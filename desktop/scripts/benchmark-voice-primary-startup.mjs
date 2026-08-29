import { spawn } from 'node:child_process'
import { createInterface } from 'node:readline'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const desktopRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const zyraRoot = resolve(desktopRoot, '..')
const bridgePath = join(zyraRoot, 'src', 'zyra-ui-bridge.mjs')
const startedAt = performance.now()

const child = spawn(process.execPath, [bridgePath], {
    cwd: zyraRoot,
    env: {
        ...process.env,
        ZYRA_ROOT: zyraRoot,
        ZYRA_CALLER_CWD: zyraRoot
    },
    stdio: ['pipe', 'pipe', 'pipe'],
    windowsHide: true
})

const timeout = setTimeout(() => {
    child.kill()
    console.error('Voice primary-agent bridge startup timed out.')
    process.exitCode = 1
}, 90_000)
timeout.unref?.()

const lines = createInterface({ input: child.stdout })
lines.on('line', (line) => {
    const response = JSON.parse(line)
    if (response.id !== 1) return
    clearTimeout(timeout)
    if (!response.ok) {
        console.error(response.error || 'Voice primary-agent bridge startup failed.')
        child.kill()
        process.exitCode = 1
        return
    }
    console.log(JSON.stringify({
        bridgeConnectMs: Math.round(performance.now() - startedAt),
        providerThreadId: response.result?.threadId || null
    }))
    child.stdin.write(`${JSON.stringify({ id: 2, type: 'dispose', payload: {} })}\n`)
    setTimeout(() => child.kill(), 50).unref?.()
})

child.stderr.on('data', (chunk) => {
    const message = String(chunk).trim()
    if (message) console.error(message)
})

child.on('error', (error) => {
    clearTimeout(timeout)
    console.error(error.message)
    process.exitCode = 1
})

child.on('exit', (code) => {
    clearTimeout(timeout)
    if (code && process.exitCode !== 1) process.exitCode = 1
})

child.stdin.write(`${JSON.stringify({
    id: 1,
    type: 'connect',
    payload: {
        cwd: zyraRoot,
        localThreadId: 'voice-private:latency-benchmark',
        noSession: true,
        model: 'openai-codex/gpt-5.6-sol',
        thinking: 'high',
        profile: 'default',
        runtimeMode: 'approval-required',
        interactionMode: 'default',
        reasoningSummary: 'auto',
        surface: 'memory-worker',
        purpose: 'voice-primary'
    }
})}\n`)
