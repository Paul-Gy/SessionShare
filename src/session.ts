import type { LogContent, LogEvent, SessionClient, UploadedFile } from './api'

import { error, Router } from 'itty-router'

interface Env {
  BUCKET: R2Bucket
  R2_CUSTOM_DOMAIN?: string
}

export class SharingSession implements DurableObject {
  router = Router()
  clients: SessionClient[] = []
  state: DurableObjectState
  env: Env

  constructor(state: DurableObjectState, env: Env) {
    this.state = state
    this.env = env
    this.router
      .get('/files/:file', (req) => this.handleGet(req.params.file))
      .post('/files/:file', (req) => this.handleUpload(req, req.params.file))
      .delete('/files/:file', (req) => this.handleDelete(req, req.params.file))
      .all('*', () => error(404))
  }

  async fetch(request: Request) {
    const ip = request.headers.get('CF-Connecting-IP') ?? '0.0.0.0'

    if (request.headers.get('Upgrade') === 'websocket') {
      const pair = new WebSocketPair()

      this.handleSession(pair[1], ip)
      await this.updateExpiration()

      return new Response(null, { status: 101, webSocket: pair[0] })
    }

    return this.router.handle(request)
  }

  async handleGet(file: string) {
    const key = `${this.state.id.toString()}-${file}`
    const object = await this.env.BUCKET.get(key)

    if (!object) {
      return new Response('Object Not Found', { status: 404 })
    }

    const headers = new Headers()
    object.writeHttpMetadata(headers)
    headers.set('etag', object.httpEtag)

    return new Response(object.body, { headers })
  }

  async handleUpload(request: Request, fileId: string) {
    const key = `${this.state.id.toString()}-${fileId}`
    const files = await this.getFiles()

    if (files.size > 25) {
      return error(400, 'A session can contains up to 25 files.')
    }

    const r2object = await this.env.BUCKET.put(key, request.body, {
      httpMetadata: request.headers,
    })

    const file: UploadedFile = {
      id: fileId,
      name: fileId,
      type: r2object.httpMetadata?.contentType,
      size: r2object.size,
      encrypted: request.headers.get('X-Encrypted') === 'true',
      lastUpdate: new Date(),
    }

    files.set(fileId, file)

    await this.state.storage.put('files', files)
    await this.broadcast({ type: 'file_upload', file }, parseRequestUser(request))
    await this.updateExpiration()

    return Response.json({ id: fileId })
  }

  async handleDelete(request: Request, fileId: string) {
    const files = await this.getFiles()
    const file = files.get(fileId)

    if (!file) {
      return new Response('Object Not Found', { status: 404 })
    }

    files.delete(fileId)

    await this.env.BUCKET.delete(`${this.state.id.toString()}-${fileId}`)
    await this.state.storage.put('files', files)
    await this.broadcast({ type: 'file_delete', file }, parseRequestUser(request))

    return Response.json({ message: 'File Deleted' })
  }

  handleSession(socket: WebSocket, ip: string) {
    socket.accept()

    const client: SessionClient = { socket, ip, active: true }
    this.clients.push(client)

    // Set event handlers to receive messages.
    let receivedUserInfo = false
    socket.addEventListener('message', async (event) => {
      try {
        if (!client.active) {
          socket.close(1011, 'WebSocket broken.')
          return
        }

        const data = JSON.parse(event.data as string)

        if (data.action === 'message') {
          await this.broadcast({ type: 'message', message: data.message }, client.name)
          return
        }

        if (!data.name || data.name.length > 25 || data.name.length < 3) {
          socket.send(JSON.stringify({ error: `Invalid name: ${data.name}.` }))
          return
        }

        if (!receivedUserInfo) {
          const bucketDomain = this.env.R2_CUSTOM_DOMAIN
          const files = Object.fromEntries(await this.getFiles())
          const logs: LogEvent[] = (await this.state.storage.get('logs')) ?? []
          const users = this.clients
            .filter((client) => client.name !== undefined)
            .map((client) => client.name)
          const response = { ready: true, bucketDomain, files, logs, users }

          client.name = data.name
          socket.send(JSON.stringify(response))

          await this.broadcast({ type: 'user_join' }, data.name)

          receivedUserInfo = true
        }
      } catch (err) {
        socket.send(JSON.stringify({ error: err }))
      }
    })

    const quitHandler = async () => {
      client.active = false
      this.clients = this.clients.filter((member) => member !== client)

      if (client.name) {
        await this.broadcast({ type: 'user_leave' }, client.name)
      }
    }

    socket.addEventListener('close', quitHandler)
    socket.addEventListener('error', quitHandler)
  }

  async destroy() {
    const files = await this.getFiles()

    for (const file of files.keys()) {
      const key = `${this.state.id.toString()}-${file}`

      await this.env.BUCKET.delete(key)
    }

    await this.broadcast({ type: 'close' })

    await this.state.storage.deleteAll()
  }

  async broadcast(content: LogContent, user = '') {
    const event: LogEvent = { ...content, user, date: new Date() }
    const clientLefts: SessionClient[] = []

    this.clients = this.clients.filter((client) => {
      try {
        client.socket.send(JSON.stringify(event))

        return true
      } catch (err) {
        client.active = false
        clientLefts.push(client)

        return false
      }
    })

    clientLefts.forEach((user) => {
      if (user.name) {
        this.broadcast({ type: 'user_leave' }, user.name)
      }
    })

    const logs: LogEvent[] = (await this.state.storage.get('logs')) ?? []
    logs.push(event)

    if (logs.length > 15) {
      logs.splice(0, logs.length - 15)
    }

    await this.state.storage.put('logs', logs)
  }

  async updateExpiration() {
    await this.state.storage.setAlarm(Date.now() + 86400 * 1000) // 24 hours
  }

  async alarm() {
    await this.destroy()
  }

  async getFiles(): Promise<Map<string, UploadedFile>> {
    return (await this.state.storage.get('files')) ?? new Map()
  }
}

function parseRequestUser(request: Request): string {
  return request.headers.get('Session-Name') ?? '?'
}
