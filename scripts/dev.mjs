import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

const root = process.cwd()
const node = process.execPath
const viteBin = join(root, 'node_modules', 'vite', 'bin', 'vite.js')
const children = new Set()
let stopping = false
let apiRestartTimer = null

function startProcess(name, command, args) {
  const child = spawn(command, args, {
    cwd: root,
    stdio: 'inherit',
    windowsHide: false,
  })
  children.add(child)
  child.on('exit', (code, signal) => {
    children.delete(child)
    if (stopping) return
    if (name === 'api') {
      console.log(`[gridbot] API wurde beendet (${signal ?? code}). Neustart in 2 Sekunden...`)
      apiRestartTimer = setTimeout(startApi, 2000)
      return
    }
    console.log(`[gridbot] ${name} wurde beendet (${signal ?? code}).`)
    stopAll()
  })
  return child
}

function startApi() {
  if (stopping) return
  startProcess('api', node, ['server.mjs'])
}

function startVite() {
  if (!existsSync(viteBin)) {
    console.error('[gridbot] Vite wurde nicht gefunden. Bitte zuerst npm install ausfuehren.')
    process.exit(1)
  }
  startProcess('web', node, [viteBin, '--host', '127.0.0.1'])
}

function stopAll() {
  if (stopping) return
  stopping = true
  if (apiRestartTimer) clearTimeout(apiRestartTimer)
  for (const child of children) {
    child.kill()
  }
}

process.on('SIGINT', () => {
  stopAll()
  process.exit(0)
})

process.on('SIGTERM', () => {
  stopAll()
  process.exit(0)
})

startApi()
startVite()
