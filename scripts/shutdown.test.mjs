import test from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { setTimeout as delay } from 'node:timers/promises'
import { createShutdownController } from '../server/shutdown.mjs'

const request = (patch = {}) => ({ url: '/api/shutdown', method: 'POST',
  headers: { host: '127.0.0.1:5173', origin: 'http://127.0.0.1:5173', 'x-gridbot-shutdown': 'confirm' },
  socket: { remoteAddress: '127.0.0.1' }, ...patch })
const response = () => new EventEmitter()
function fixture() {
  let stopped = 0
  const dispatch = createShutdownController({
    sendJson: (res, status, body) => { res.status = status; res.body = body; res.emit('finish') },
    stop: () => { stopped++ },
  })
  return { dispatch, stopped: () => stopped }
}

test('shutdown drains admitted work and refuses new work before closing exactly once', async () => {
  const f = fixture()
  let release
  const gate = new Promise((resolve) => { release = resolve })
  const operation = f.dispatch(request({ url: '/api/phemex/monitor' }), response(), () => gate)
  const res = response()
  const shutdown = f.dispatch(request(), res)
  const refused = response()
  await f.dispatch(request({ url: '/api/store' }), refused, () => assert.fail('new work admitted'))
  assert.equal(refused.status, 503)
  assert.equal(res.status, undefined)
  assert.equal(f.stopped(), 0)
  release()
  await operation
  await shutdown
  assert.equal(res.status, 200)
  await f.dispatch(request(), response())
  await delay(300)
  assert.equal(f.stopped(), 1)
})

for (const patch of [
  { method: 'GET' },
  { headers: {} },
  { socket: { remoteAddress: '192.168.0.2' } },
  { headers: { ...request().headers, origin: 'https://example.com' } },
  { headers: { ...request().headers, host: 'evil.example', origin: 'http://evil.example' } },
  { headers: { ...request().headers, 'x-gridbot-shutdown': undefined } },
]) {
  test(`invalid shutdown request cannot stop the app: ${JSON.stringify(patch)}`, async () => {
    const f = fixture()
    const res = response()
    await f.dispatch(request(patch), res)
    assert.ok([403, 405].includes(res.status))
    let ran = false
    await f.dispatch(request({ url: '/api/store' }), response(), async () => { ran = true })
    assert.equal(ran, true)
    assert.equal(f.stopped(), 0)
  })
}
