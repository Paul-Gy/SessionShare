import { Router, error, status } from 'itty-router'

export { SharingSession } from './session'

export interface Env {
  SESSIONS: DurableObjectNamespace
  BUCKET: R2Bucket
  R2_CUSTOM_DOMAIN?: string
}

const router = Router()

router
  .get('/:session?', () => error(503, 'Workers should only be active only on /api/*'))
  .post('/api/sessions', () => {
    const id = (Math.random() + 1).toString(36).substring(2, 10)

    return Response.json({ session: id })
  })
  .options('/api/*', () => status(204))
  .all('/api/sessions/:session/:path+', (request, env: Env) => {
    const name = request.params.session ?? ''
    const id = name.length === 64 ? env.SESSIONS.idFromString(name) : env.SESSIONS.idFromName(name)
    const session = env.SESSIONS.get(id)

    return session.fetch(`https://sessionshare/${request.params.path}`, request)
  })
  .all('*', () => error(404))

export default {
  fetch: router.fetch,
}
