import type { IRequest } from 'itty-router'
import type { SharingSession } from './session'

import { Router, error, status } from 'itty-router'

export { SharingSession } from './session'

export interface Env {
  SESSIONS: DurableObjectNamespace<SharingSession>
  BUCKET: R2Bucket
  R2_CUSTOM_DOMAIN?: string
  CREATE_LIMITER: RateLimit
}

const router = Router<IRequest, [Env]>()

router
  .get('/:session?', () => error(503, 'Workers should only be active on /api/*'))
  .post('/api/sessions', (request, env) => createSession(env, request))
  .all('/api/sessions/:session/*', ({ params }) =>
    /^[a-z0-9]{10}$/.test(params.session) ? undefined : error(404, 'Session not found.'),
  )
  .get('/api/sessions/:session/status', async ({ params }, env) =>
    (await session(env, params.session).isActive())
      ? status(204)
      : error(404, 'Session not found.'),
  )
  .get('/api/sessions/:session/websocket', forward('websocket'))
  .get('/api/sessions/:session/files/:file', forward('files'))
  .post('/api/sessions/:session/files/:file', forward('files'))
  .delete('/api/sessions/:session/files/:file', forward('files'))
  .all('*', () => error(404))

export default {
  fetch: router.fetch,
}

function forward(prefix: 'websocket' | 'files') {
  return (request: IRequest, env: Env) => {
    const path = prefix === 'files' ? `files/${request.params.file}` : 'websocket'

    // Ignore query strings as they are unused anyway.
    return session(env, request.params.session).fetch(`https://sessionshare/${path}`, request)
  }
}

async function createSession(env: Env, request: IRequest) {
  const ip = request.headers.get('CF-Connecting-IP') ?? '0.0.0.0'
  const { success } = await env.CREATE_LIMITER.limit({ key: ip })

  if (!success) {
    return error(429, 'Too many sessions created, please retry later.')
  }

  const body = await request.json<{ encrypted?: unknown }>().catch(() => null)

  if (!body || typeof body.encrypted !== 'boolean') {
    return error(400, 'Invalid session options.')
  }

  for (let attempt = 0; attempt < 5; attempt++) {
    const name = randomString(10)

    // create() returns false when the randomly generated name is already in use: retry.
    if (await session(env, name).create(body.encrypted)) {
      return Response.json({ session: name })
    }
  }

  return error(503, 'Could not allocate a session.')
}

function session(env: Env, name: string): DurableObjectStub<SharingSession> {
  return env.SESSIONS.get(env.SESSIONS.idFromName(name))
}

function randomString(length: number): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
  const bytes = crypto.getRandomValues(new Uint8Array(length))

  return Array.from(bytes, (byte) => chars[byte % chars.length]).join('')
}
