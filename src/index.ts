import { Router } from 'itty-router'

export { SharingSession } from './session'

const router = Router()

router
  .get('/:session?', () =>
    Response.json('Workers should only be active on /api/*', { status: 503 }),
  )
  .post('/api/sessions', () => {
    const id = (Math.random() + 1).toString(36).substring(2, 10)

    return Response.json({ session: id })
  })
  .all('/api/sessions/:session/*', (request, env: Env) => {
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
  .all('*', () => Response.json('404 - Not Found', { status: 404 }))

export default {
  fetch(request: Request, env: Env): Promise<Response> {
    return router.handle(request, env)
  },
}

interface Env {
  SESSIONS: DurableObjectNamespace
}
