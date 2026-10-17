// Actual broker + Windows driver; native RPC is mocked and no helper/app starts.
import assert from 'node:assert/strict'
import { mock } from 'bun:test'
import { AgentControlBroker } from '../src/main/agent-control/agent-control-broker'
import { AgentControlError } from '../src/main/agent-control/control-errors'
mock.module('electron', () => ({ app: { getAppPath: () => '.' } }))
const { WindowsDesktopDriver } = await import('../src/main/agent-control/drivers/windows-desktop-driver')
const tick = () => new Promise<void>(resolve => setImmediate(resolve))
const root = { type: 'root' as const, threadId: 'thread:discovery', turnId: 'turn:discovery' }
const other = { type: 'root' as const, threadId: 'thread:waiting', turnId: 'turn:waiting' }
const options = { backgrounded: true, permissionMode: 'full-access' as const }
for (const operation of [
    { operation: 'list_windows', query: 'Paint' },
    { operation: 'use_app', application: 'Paint', capabilities: ['pointer.click'] },
    { operation: 'request_grant', windowToken: 'fixture:window', capabilities: ['pointer.click'] },
    { operation: 'request_grant', windowToken: 'fixture:expired', capabilities: ['pointer.click'] }
]) {
    const driver = new WindowsDesktopDriver('fixture')
    let firstRequest = true
    let release!: () => void
    let entered!: () => void
    const started = new Promise<void>(resolve => { entered = resolve })
    ;(driver as any).request = async (method: string, parameters: any, signal?: AbortSignal) => {
        assert.ok(['list_windows', 'select_window'].includes(method), 'test never launches an app or sends input')
        if (method === 'select_window' && parameters.windowToken === 'fixture:expired') {
            throw new AgentControlError('CONTROL_DRIVER_UNAVAILABLE', 'Window token is unknown or expired.')
        }
        if (!firstRequest) return { windows: [] }
        firstRequest = false
        entered()
        return new Promise((resolve, reject) => {
            release = () => resolve(method === 'select_window'
                ? { windowToken: 'fixture:window', processId: 42, executableIdentity: 'paint.exe', applicationName: 'Paint', title: 'Paint', processStartTime: 1 }
                : { windows: [] })
            signal?.addEventListener('abort', () => reject(new AgentControlError('CONTROL_CANCELLED', 'Mock native RPC cancelled.')), { once: true })
        })
    }
    const broker = new AgentControlBroker({ drivers: [driver] })
    const pending: Promise<unknown>[] = []
    try {
        broker.authorizeUserWindowsTurn(root)
        broker.authorizeUserWindowsTurn(other)
        let cancelled = false
        pending.push(broker.handleToolOperation(root, operation, undefined, options).catch(error => {
            assert.equal(error.code, 'CONTROL_CANCELLED'); cancelled = true
        }))
        await started
        let progressed = false
        pending.push(broker.handleToolOperation(other, { operation: 'list_windows', query: 'Paint' }, undefined, options).then(() => { progressed = true }))
        broker.revokePrincipal(root)
        await tick()
        assert.equal(cancelled, true, `${operation.operation}: cancellation reaches native discovery without a response or timeout`)
        assert.equal(progressed, true, `${operation.operation}: another root acquires the native lane after cancellation`)
    } finally {
        release?.()
        await broker.dispose()
        await Promise.allSettled(pending)
    }
}
console.log('Windows discovery: broker cancellation reaches native list/selection RPCs and releases the shared lane promptly: ok')
