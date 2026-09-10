import test from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { setTimeout as delay } from 'node:timers/promises'

test('shutdown stops API and supervised web process without restarting either', { timeout: 15000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'gridbot-shutdown-test-'))
  let child
  let exited = false
  try {
    // Isolated working directory: never load live credentials, state or trading bots.
    await writeFile(join(directory, 'server.mjs'), `import ${JSON.stringify(pathToFileURL(resolve('server.mjs')).href)}\n`)
    const viteDir = join(directory, 'node_modules', 'vite', 'bin')
    await mkdir(viteDir, { recursive: true })
    await writeFile(join(viteDir, 'vite.js'), "const server = require('node:http').createServer((q,r) => r.end('test')); server.listen(0,'127.0.0.1',()=>console.log('TEST_WEB='+server.address().port));\n")
    child = spawn(process.execPath, [resolve('scripts/dev.mjs')], {
      cwd: directory, env: { ...process.env, PORT: '0' }, windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    child.once('exit', () => { exited = true })
    let output = ''
    child.stdout.on('data', (data) => { output += data })
    child.stderr.on('data', (data) => { output += data })
    for (let i = 0; i < 100 && (!/TEST_WEB=(\d+)/.test(output) || !/http:\/\/127.0.0.1:(\d+)/.test(output)); i++) await delay(50)
    const apiPort = output.match(/http:\/\/127.0.0.1:(\d+)/)?.[1]
    const webPort = output.match(/TEST_WEB=(\d+)/)?.[1]
    assert.ok(apiPort && webPort, output)
    const origin = `http://127.0.0.1:${apiPort}`
    const result = await fetch(`${origin}/api/shutdown`, { method: 'POST', headers: { Origin: origin, 'X-Gridbot-Shutdown': 'confirm' } })
    assert.equal(result.status, 200)
    assert.deepEqual(await result.json(), { stopped: true })
    for (let i = 0; i < 60 && !exited; i++) await delay(50)
    assert.equal(exited, true, output)
    await delay(2200)
    await assert.rejects(fetch(origin))
    await assert.rejects(fetch(`http://127.0.0.1:${webPort}`))
    assert.equal(output.includes('Neustart in'), false, output)
  } finally {
    if (child && !exited) {
      if (process.platform === 'win32') {
        await new Promise((done) => spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' }).once('exit', done))
      } else child.kill('SIGTERM')
    }
    assert.equal(dirname(resolve(directory)), resolve(tmpdir()))
    await rm(directory, { recursive: true, force: true })
  }
})
