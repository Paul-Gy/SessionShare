import type { LogEvent, LogType, SessionClient, UploadedFile } from './api'

import { json } from 'itty-router-extras'

type FileIndex = Record<string, UploadedFile>

export class SharingSession implements DurableObject {
  state: DurableObjectState
  clients: SessionClient[] = []
  env: Env

  constructor(state: DurableObjectState, env: Env) {
    this.state = state
    this.env = env
  }

  async fetch(request: Request) {
    const ip = request.headers.get('CF-Connecting-IP') ?? '0.0.0.0'

    if (request.headers.get('Upgrade') == 'websocket') {
      const pair = new WebSocketPair()

      await this.handleSession(pair[1], ip)
      await this.updateExpiration()

      return new Response(null, { status: 101, webSocket: pair[0] })
    }

    const url = new URL(request.url)

    if (!url.pathname.startsWith('/files/')) {
      return new Response('404 - Not found')
    }

    const filename = url.pathname.slice(7) // Remove /files/

    if (request.method == 'POST') {
      return this.handleUpload(request, filename)
    }

    if (request.method == 'DELETE') {
      return this.handleDelete(request, filename)
    }

    return this.handleGet(filename)
  }

  async handleGet(file: string) {
    const key = this.state.id.toString() + '-' + file
    const object = await this.env.BUCKET.get(key)

    if (!object) {
      return new Response('Object Not Found', { status: 404 })
    }

    const headers = new Headers()
    object.writeHttpMetadata(headers)
    headers.set('etag', object.httpEtag)

    return new Response(object.body, { headers })
  }

  async handleUpload(request: Request, filename: string) {
    const id = filename
    const key = this.state.id.toString() + '-' + id
    const files: FileIndex = (await this.state.storage.get('files')) ?? {}

    if (Object.keys(files).length > 25) {
      return json(
        { error: 'A session can contains up to 25 files' },
        { status: 400 },
      )
    }

    const r2object = await this.env.BUCKET.put(key, request.body, {
      httpMetadata: request.headers,
    })

    const file: UploadedFile = {
      id,
      name: filename,
      type: r2object.httpMetadata?.contentType,
      size: r2object.size,
      encrypted: request.headers.get('X-Encrypted') === 'true',
      lastUpdate: new Date(),
    }

    files[id] = file

    await this.state.storage.put('files', files)
    await this.broadcast('file_upload', this.parseRequestUser(request), file)
    await this.updateExpiration()

    return json({ id })
  }

  async handleDelete(request: Request, fileId: string) {
    const files: FileIndex = (await this.state.storage.get('files')) ?? {}
    const file = files[fileId]

    if (!file) {
      return new Response('Object Not Found', { status: 404 })
    }

    delete files[fileId]

    await this.env.BUCKET.delete(this.state.id.toString() + '-' + fileId)
    await this.state.storage.put('files', files)
    await this.broadcast('file_delete', this.parseRequestUser(request), file)

    return json({ message: 'File Deleted' })
  }

  async handleSession(socket: WebSocket, ip: string) {
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

        if (!data.name || data.name.length > 25 || data.name.length < 3) {
          socket.send(JSON.stringify({ error: `Invalid name: ${data.name}.` }))
          return
        }

        if (!receivedUserInfo) {
          const files: FileIndex = (await this.state.storage.get('files')) ?? {}
          const logs: LogEvent[] = (await this.state.storage.get('logs')) ?? []
          const users = this.clients
            .filter((client) => client.name)
            .map((client) => client.name)

          client.name = data.name

          socket.send(JSON.stringify({ ready: true, files, logs, users }))

          await this.broadcast('user_join', data.name)

          receivedUserInfo = true
        }
      } catch (err) {
        socket.send(JSON.stringify({ error: err }))
      }
    })

    const quitHandler = () => {
      client.active = false
      this.clients = this.clients.filter((member) => member !== client)

      if (client.name) {
        this.broadcast('user_leave', client.name)
      }
    }

    socket.addEventListener('close', quitHandler)
    socket.addEventListener('error', quitHandler)
  }

  async destroy() {
    const files: FileIndex = (await this.state.storage.get('files')) ?? {}

    for (const file in files) {
      const key = this.state.id.toString() + '-' + file

      await this.env.BUCKET.delete(key)
    }

    await this.broadcast('close', '')

    await this.state.storage.deleteAll()
  }

  async broadcast(type: LogType, user: string, file?: UploadedFile) {
    const event: LogEvent = { type, user, file, date: new Date() }
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
        this.broadcast('user_leave', user.name)
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

  parseRequestUser(request: Request): string {
    return request.headers.get('Session-Name') ?? '?'
  }
}

interface Env {
  BUCKET: R2Bucket
}
