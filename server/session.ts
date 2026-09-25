import type { ClientInfo, LogContent, LogEvent, StoredClient, UploadedFile } from './api'
import type { Env } from './index'

import { DurableObject } from 'cloudflare:workers'
import { Router, error } from 'itty-router'
import { maxLogEntries, maxSessionFiles, maxUploadSize, slugifyFile } from './api'
import { randomUsername } from './utils/names'

export class SharingSession extends DurableObject<Env> {
  router = Router()
  // In-memory cache of the persisted logs, lazily loaded after hibernation/restart
  logs?: LogEvent[]
  // Best-effort limits: resets when the Durable Object hibernates or restarts
  writeTimes: number[] = []
  messageTimes = new WeakMap<WebSocket, number[]>()

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env)
    this.router
      .all('*', async () => ((await this.isActive()) ? null : error(404, 'Session not found.')))
      .get('/websocket', (request) => this.handleWebSocket(request))
      .get('/files/:file', (request) => this.handleGet(request.params.file))
      .post('/files/:file', (request) => this.handleUpload(request, request.params.file))
      .delete('/files/:file', (request) => this.handleDelete(request, request.params.file))
      .all('*', () => error(404))
  }

  fetch(request: Request): Promise<Response> {
    return this.router.fetch(request)
  }

  async isActive(): Promise<boolean> {
    return (await this.ctx.storage.get<boolean>('active')) === true
  }

  async create(encrypted: boolean): Promise<boolean> {
    if (await this.isActive()) {
      return false
    }

    await this.updateExpiration()
    await this.ctx.storage.put({ encrypted, active: true })

    return true
  }

  async handleWebSocket(request: Request): Promise<Response> {
    if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
      return error(426, 'Expected a WebSocket upgrade request.')
    }

    if (this.ctx.getWebSockets().length >= 32) {
      return error(429, 'This session has too many connected users.')
    }

    const pair = new WebSocketPair()

    this.ctx.acceptWebSocket(pair[1])
    await this.updateExpiration()

    return new Response(null, { status: 101, webSocket: pair[0] })
  }

  async handleGet(fileId: string): Promise<Response> {
    // Not rate limited or authenticated: the R2 custom domain serves the same files directly anyway
    const object = await this.env.BUCKET.get(this.fileStorageKey(fileId))

    if (!object) {
      return error(404, 'File not found.')
    }

    const headers = new Headers()
    object.writeHttpMetadata(headers)
    headers.set('etag', object.httpEtag)
    headers.set('X-Content-Type-Options', 'nosniff') // Content-Type is client-supplied

    return new Response(object.body, { headers })
  }

  async handleUpload(request: Request, rawFileName: string): Promise<Response> {
    const client = await this.getRequestClient(request)

    if (!client) {
      return error(401, 'Unknown client, please rejoin the session.')
    }

    // Strip control/format characters from filename
    const fileName = decodePath(rawFileName)?.replace(/\p{C}/gu, '')

    if (!fileName || fileName.length > 100) {
      return error(400, 'Invalid file name.')
    }

    // Use Content-Length header, as required for R2, and Cloudflare rejects if mismatched/invalid
    const rawFileSize = request.headers.get('Content-Length')
    const fileSize = Number(rawFileSize)

    // Allow 128 extra bytes for extra bytes from AES-GCM packaging
    if (!rawFileSize || !Number.isFinite(fileSize) || fileSize > maxUploadSize + 128) {
      return error(400, `Max upload size is ${maxUploadSize / (1024 * 1024)} MB.`)
    }

    if (!this.allowWrite()) {
      return error(429, 'Too many requests, please retry later.')
    }

    const fileId = slugifyFile(fileName)
    const filesBeforeUpload = await this.getFiles()

    if (!filesBeforeUpload.has(fileId) && filesBeforeUpload.size >= maxSessionFiles) {
      return error(400, `A session can contain up to ${maxSessionFiles} files.`)
    }

    // encodeURIComponent leaves '()* unescaped, but RFC 8187 requires escaping them in filename*
    const encoded = encodeURIComponent(fileName).replace(
      /['()*]/g,
      (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
    )

    const r2object = await this.env.BUCKET.put(this.fileStorageKey(fileId), request.body, {
      httpMetadata: {
        contentType: request.headers.get('Content-Type') ?? undefined,
        contentDisposition: `attachment; filename="${fileId}"; filename*=UTF-8''${encoded}`,
        cacheControl: 'public, max-age=3600', // 1 hour (note that deleted files can still be served from the CDN cache)
      },
    })

    const file: UploadedFile = {
      id: fileId,
      name: fileName,
      type: r2object.httpMetadata?.contentType,
      storageKey: this.fileStorageKey(fileId),
      size: r2object.size,
      updatedAt: new Date(),
    }

    // The R2 await above opens the input gate, so concurrent uploads may have filled the
    // session meanwhile: re-check the limit before committing the metadata
    const filesAfterUpload = await this.getFiles()

    if (!filesAfterUpload.has(fileId) && filesAfterUpload.size >= maxSessionFiles) {
      await this.env.BUCKET.delete(this.fileStorageKey(fileId))

      return error(400, `A session can contain up to ${maxSessionFiles} files.`)
    }

    filesAfterUpload.set(fileId, file)

    await this.ctx.storage.put('files', filesAfterUpload)
    await this.broadcast({ type: 'file_upload', file }, client.name)
    await this.updateExpiration()

    return Response.json({ id: fileId })
  }

  async handleDelete(request: Request, fileId: string): Promise<Response> {
    // Deliberately not rate limited: deleting files should always be possible
    const client = await this.getRequestClient(request)

    if (!client) {
      return error(401, 'Unknown client, please rejoin the session.')
    }

    const currentFiles = await this.getFiles()
    const file = currentFiles.get(fileId)

    if (!file) {
      return error(404, 'File not found.')
    }

    await this.env.BUCKET.delete(this.fileStorageKey(fileId))

    // The DO is single-threaded, but the R2 await above opens the input gate, so a
    // concurrent request may have mutated 'files' meanwhile.
    const files = await this.getFiles()
    files.delete(fileId)

    await this.ctx.storage.put('files', files)
    await this.broadcast({ type: 'file_delete', file }, client.name)
    await this.updateExpiration()

    return Response.json({ message: 'File Deleted' })
  }

  async webSocketMessage(socket: WebSocket, message: ArrayBuffer | string): Promise<void> {
    if (typeof message !== 'string' || message.length > 4096) {
      return // Drop binary frames or abnormally long messages
    }

    if (!this.allowMessage(socket)) {
      socket.send(JSON.stringify({ error: 'Too many requests, please wait before retrying.' }))
      return
    }

    try {
      const data = JSON.parse(message)
      const client = this.clientInfo(socket)

      if (!client) {
        if (data.action !== 'join') {
          socket.send(JSON.stringify({ error: 'Expected join message.' }))
          return
        }

        const encrypted = await this.ctx.storage.get<boolean>('encrypted')

        if (encrypted && !data.hasKey) {
          socket.send(
            JSON.stringify({
              error: 'This session is encrypted and requires an encryption key.',
              close: true,
            }),
          )
          socket.close(1008, 'Encryption key required.')
          return
        }

        await this.joinClient(socket, data.clientId)
        return
      }

      if (data.action !== 'message') {
        socket.send(JSON.stringify({ error: 'Unknown action.' }))
        return
      }

      if (typeof data.message !== 'string' || !Number.isFinite(data.messageId)) {
        socket.send(JSON.stringify({ error: 'Invalid message.' }))
        return
      }

      if (data.message.length > 128) {
        socket.send(JSON.stringify({ error: 'Message cannot be longer than 128 characters.' }))
        return
      }

      const content: LogContent = {
        type: 'message',
        message: data.message,
        messageId: data.messageId,
      }

      await this.broadcast(content, client.name)
      await this.updateExpiration()
    } catch (err) {
      console.error('WebSocket message handling failed', err)

      try {
        socket.send(JSON.stringify({ error: 'Unexpected server error.' }))
      } catch {
        // Socket may already be closed.
      }
    }
  }

  async joinClient(socket: WebSocket, clientId: unknown): Promise<void> {
    const clients = await this.getClients()

    // Restore the identity of a reconnecting client, otherwise generate a new one.
    let id: string = crypto.randomUUID()
    let name: string | undefined

    if (typeof clientId === 'string') {
      const existing = clients.get(clientId)

      if (existing) {
        id = clientId
        name = existing.name
      }
    }

    name ??= this.availableUsername(clients)

    clients.set(id, { name, lastSeen: Date.now() })
    this.evictStoredClients(clients)
    await this.ctx.storage.put('clients', clients)

    socket.serializeAttachment({ id, name } satisfies ClientInfo)

    const bucketDomain = this.env.R2_CUSTOM_DOMAIN
    const files = Object.fromEntries(await this.getFiles())
    const encrypted = await this.ctx.storage.get<boolean>('encrypted')
    const logs = await this.getLogs()
    const users = [...new Set(this.clients().map((client) => client.name))]

    const response = { ready: true, id, name, bucketDomain, files, logs, users, encrypted }

    socket.send(JSON.stringify(response))

    await this.broadcast({ type: 'user_join' }, name)
  }

  async webSocketClose(socket: WebSocket): Promise<void> {
    await this.handleQuit(socket)
  }

  async webSocketError(socket: WebSocket): Promise<void> {
    await this.handleQuit(socket)
  }

  async handleQuit(socket: WebSocket): Promise<void> {
    const client = this.clientInfo(socket)

    if (!client) {
      return
    }

    // Clear the attachment first, so a 'close' following an 'error' doesn't broadcast twice.
    socket.serializeAttachment(null)

    const clients = await this.getClients()
    const stored = clients.get(client.id)

    if (stored) {
      stored.lastSeen = Date.now()
      await this.ctx.storage.put('clients', clients)
    }

    if (this.clients().some((other) => other.id === client.id)) {
      return // User re-connected
    }

    await this.broadcast({ type: 'user_leave' }, client.name)
  }

  async destroy(): Promise<void> {
    await this.ctx.blockConcurrencyWhile(async () => {
      await this.ctx.storage.put('active', false)
      await this.broadcast({ type: 'close' })

      for (const socket of this.ctx.getWebSockets()) {
        // Clear the attachment so the close handler doesn't write to the deleted storage.
        socket.serializeAttachment(null)

        try {
          socket.close(1000, 'Session expired.')
        } catch {
          // Socket may already be closed.
        }
      }

      this.logs = undefined

      const files = await this.getFiles()

      if (files.size > 0) {
        const fileKeys = files.keys().map((file) => this.fileStorageKey(file))

        await this.env.BUCKET.delete(fileKeys.toArray())
      }

      await this.ctx.storage.deleteAll() // Also clears alarm (with current compatibility date)
    })
  }

  async broadcast(content: LogContent, user = ''): Promise<void> {
    const event: LogEvent = { ...content, user, id: crypto.randomUUID(), date: new Date() }

    if (content.type !== 'close') {
      const logs = await this.getLogs()
      logs.push(event)

      if (logs.length > maxLogEntries) {
        logs.splice(0, logs.length - maxLogEntries)
      }

      await this.ctx.storage.put('logs', logs)
    }

    const payload = JSON.stringify(event)

    for (const socket of this.ctx.getWebSockets()) {
      if (!this.clientInfo(socket)) {
        continue // Socket accepted but the client hasn't joined yet
      }

      try {
        socket.send(payload)
      } catch {
        // Broken sockets are reported through webSocketClose/webSocketError.
      }
    }
  }

  async updateExpiration(): Promise<void> {
    await this.ctx.storage.setAlarm(Date.now() + 86400 * 1000) // 24 hours
  }

  async alarm(): Promise<void> {
    await this.destroy()
  }

  async getFiles(): Promise<Map<string, UploadedFile>> {
    const files = await this.ctx.storage.get<Map<string, UploadedFile>>('files')

    return files ?? new Map()
  }

  async getClients(): Promise<Map<string, StoredClient>> {
    const clients = await this.ctx.storage.get<Map<string, StoredClient>>('clients')

    return clients ?? new Map()
  }

  async getLogs(): Promise<LogEvent[]> {
    this.logs ??= (await this.ctx.storage.get<LogEvent[]>('logs')) ?? []

    return this.logs
  }

  async getRequestClient(request: Request): Promise<StoredClient | undefined> {
    const clientId = request.headers.get('Session-Client-Id') ?? ''
    const clients = await this.getClients()
    const client = clients.get(clientId)

    if (client && Date.now() - client.lastSeen >= 60_000) {
      client.lastSeen = Date.now()
      await this.ctx.storage.put('clients', clients)
    }

    return client
  }

  evictStoredClients(clients: Map<string, StoredClient>): void {
    if (clients.size <= 100) {
      return
    }

    const connected = new Set(this.clients().map((client) => client.id))

    const removable = [...clients.entries()]
      .filter(([id]) => !connected.has(id))
      .sort(([, a], [, b]) => a.lastSeen - b.lastSeen)

    for (const [id] of removable) {
      if (clients.size <= 100) {
        break
      }

      clients.delete(id)
    }
  }

  clientInfo(socket: WebSocket): ClientInfo | null {
    return socket.deserializeAttachment()
  }

  clients(): ClientInfo[] {
    return this.ctx
      .getWebSockets()
      .map((socket) => this.clientInfo(socket))
      .filter((client) => client !== null)
  }

  fileStorageKey(fileId: string): string {
    return `${this.ctx.id.toString()}-${fileId}`
  }

  availableUsername(clients: Map<string, StoredClient>): string {
    const username = randomUsername()

    if (clients.values().some((client) => client.name === username)) {
      // Unbounded recursion is fine as collisions are rare and repeated ones vanishingly unlikely
      return this.availableUsername(clients)
    }

    return username
  }

  allowWrite(): boolean {
    // Maximum 30 uploads per minute
    const [allowed, times] = rateLimit(this.writeTimes, 30, 60_000)
    this.writeTimes = times

    return allowed
  }

  allowMessage(socket: WebSocket): boolean {
    // Maximum 10 messages per 10 seconds
    const [allowed, times] = rateLimit(this.messageTimes.get(socket) ?? [], 10, 10_000)
    this.messageTimes.set(socket, times)

    return allowed
  }
}

function decodePath(value: string): string | null {
  try {
    return decodeURIComponent(value)
  } catch {
    return null // malformed percent-escape
  }
}

function rateLimit(
  times: number[],
  limit: number,
  windowMs: number,
): [allowed: boolean, times: number[]] {
  const now = Date.now()
  const recent = times.filter((time) => now - time < windowMs)

  if (recent.length >= limit) {
    return [false, recent]
  }

  recent.push(now)

  return [true, recent]
}
