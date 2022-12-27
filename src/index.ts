import { Router, Request } from 'itty-router'
import { error, json, missing } from 'itty-router-extras'

export { SharingSession } from './session'

const router = Router()

router
  .get('/:session?', () =>
    error(503, 'The workers should only be active on /api/*'),
  )
  .post('/api/sessions', async () => {
    const id = (Math.random() + 1).toString(36).substring(2, 10)

    return json({ session: id })
  })
  .all('/api/sessions/:session/*', async (request: Request, env: Env) => {
    const name = request.params?.session ?? ''
    const id =
      name.length === 64
        ? env.SESSIONS.idFromString(name)
        : env.SESSIONS.idFromName(name)
    const session = env.SESSIONS.get(id)

    const url = new URL(request.url)
    const path = url.pathname.slice(1).split('/')
    url.pathname = '/' + path.slice(3).join('/')

    return session.fetch(url.toString(), request)
  })
  .all('*', () => missing())

export default {
  fetch(request: Request, env: Env): Promise<Response> {
    return router.handle(request, env)
  },
}

interface Env {
  SESSIONS: DurableObjectNamespace
}
