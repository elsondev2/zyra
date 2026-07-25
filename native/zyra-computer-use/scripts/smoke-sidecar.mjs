import { spawn } from 'node:child_process'
import { randomBytes, randomUUID } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

if (process.platform !== 'win32') {
  console.log('SKIP: Windows sidecar smoke requires Windows.')
  process.exit(0)
}
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const executable = path.join(root, 'src', 'Zyra.ComputerUse', 'bin', 'Debug', 'net8.0-windows', 'Zyra.ComputerUse.exe')
const pipeName = `zyra-computer-use-smoke-${process.pid}-${randomUUID()}`
const secret = randomBytes(32).toString('base64url')
const artifacts = path.join(os.tmpdir(), 'zyra-computer-use-smoke', randomUUID())
mkdirSync(artifacts, { recursive: true })
const target = spawn(executable, ['--test-window'], { windowsHide: false })
const sidecar = spawn(executable, ['--pipe', pipeName, '--artifacts', artifacts], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] })
sidecar.stdin.write(`${secret}\n`)
const socket = await connectPipe(`\\\\.\\pipe\\${pipeName}`)
let buffer = ''
const pending = new Map()
socket.setEncoding('utf8')
socket.on('data', (chunk) => {
  buffer += chunk
  for (;;) {
    const newline = buffer.indexOf('\n')
    if (newline < 0) break
    const line = buffer.slice(0, newline).trim()
    buffer = buffer.slice(newline + 1)
    if (!line) continue
    const response = JSON.parse(line)
    const request = pending.get(response.id)
    if (!request) continue
    pending.delete(response.id)
    response.ok ? request.resolve(response.result) : request.reject(new Error(`${response.error?.code}: ${response.error?.message}`))
  }
})
const rpc = (method, params = {}) => new Promise((resolve, reject) => {
  const id = randomUUID()
  pending.set(id, { resolve, reject })
  socket.write(`${JSON.stringify({ id, method, params, auth: secret, version: 1 })}\n`)
})
try {
  await rpc('health')
  let candidate
  let lastWindows = []
  for (let attempt = 0; attempt < 50 && !candidate; attempt += 1) {
    const listed = await rpc('list_windows')
    lastWindows = listed.windows
    candidate = listed.windows.find((entry) => entry.processId === target.pid && !entry.blocked)
    if (!candidate) await delay(100)
  }
  if (!candidate) {
    throw new Error(`Owned deterministic test window PID ${target.pid} was not discoverable. Seen: ${lastWindows.map((entry) => `${entry.processId}:${entry.title}`).join(' | ')}`)
  } else {
    await rpc('select_window', { windowToken: candidate.windowToken })
    const observation = await rpc('observe', { windowToken: candidate.windowToken, revision: 1, includeScreenshot: true })
    if (!Array.isArray(observation.elements) || !observation.screenshotRef || observation.targetState !== 'ready' || observation.elements.length === 0) throw new Error(`Sidecar observation/capture contract was incomplete: ${JSON.stringify({ targetState: observation.targetState, elements: observation.elements?.length, screenshotRef: observation.screenshotRef, redactions: observation.redactions })}`)
    const editable = observation.elements.find((element) => element.actions?.includes('type') && !element.sensitive)
    if (editable) await rpc('action', { windowToken: candidate.windowToken, revision: 1, action: { type: 'type', elementRef: editable.elementRef, text: 'Zyra sidecar smoke', replace: true, deltaX: 0, deltaY: 0 } })
    await rpc('emergency_stop')
    console.log(`Windows sidecar live smoke passed (${observation.elements.length} UIA elements, selected-window capture, ${editable ? 'semantic type' : 'no editable control exposed'}).`)
  }
} finally {
  socket.destroy()
  sidecar.kill()
  target.kill()
}

function connectPipe(pipePath) {
  return new Promise((resolve, reject) => {
    let attempts = 0
    const attempt = () => {
      const socket = net.createConnection(pipePath)
      socket.once('connect', () => resolve(socket))
      socket.once('error', (error) => {
        socket.destroy()
        if (++attempts >= 40) reject(error)
        else setTimeout(attempt, 50)
      })
    }
    attempt()
  })
}
function delay(ms) { return new Promise((resolve) => setTimeout(resolve, ms)) }
