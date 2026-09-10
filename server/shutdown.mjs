const loopback = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1'])

export function createShutdownController({ sendJson, stop }) {
  let stopping = false
  let stopScheduled = false
  const active = new Set()
  return async function dispatch(request, response, handle) {
    const path = new URL(request.url, 'http://localhost').pathname
    if (path === '/api/shutdown') {
      let allowed = false
      try {
        const origin = new URL(request.headers.origin)
        const host = new URL(`http://${request.headers.host}`)
        allowed = loopback.has(request.socket.remoteAddress)
          && ['localhost', '127.0.0.1', '[::1]'].includes(host.hostname)
          && origin.host === host.host && origin.protocol === 'http:'
          && request.headers['x-gridbot-shutdown'] === 'confirm'
      } catch { /* Missing or malformed origin is not a shutdown request. */ }
      if (request.method !== 'POST') return sendJson(response, 405, { error: 'POST erforderlich.' })
      if (!allowed) return sendJson(response, 403, { error: 'Beenden ist nur aus der lokalen Oberfläche erlaubt.' })
      stopping = true
      await Promise.allSettled([...active])
      if (!stopScheduled) {
        stopScheduled = true
        response.once('finish', () => setTimeout(stop, 250))
      }
      return sendJson(response, 200, { stopped: true })
    }
    if (stopping) return sendJson(response, 503, { error: 'Gridbot Console wird beendet.' })
    // Register before parsing the body so an admitted trade cannot escape the drain.
    const operation = Promise.resolve().then(handle)
    active.add(operation)
    try { await operation } finally { active.delete(operation) }
  }
}
