import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mock } from 'bun:test'
const id = (runtime: string, session: string) => createHash('sha256').update(runtime + ':' + session).digest('hex')
const receivers = new Map<string, (event: any) => void>()
const closed: string[] = [], writes: string[] = []
const terminals = ['a', 'b', 'c'].map(key => ({ runtimeId: 'utility:chat:terminal:' + key, sessionId: key, cwd: 'C:\\shared', title: key, status: 'running' }))
mock.module('../src/main/ipc/handlers/preview-terminal-handlers', () => ({
    listRemotePreviewTerminals: (allow: (runtime: string, cwd: string) => boolean) => terminals.filter(t => allow(t.runtimeId, t.cwd)),
    bindRemotePreviewTerminal: (runtime: string, receive: (event: any) => void) => {
        receivers.set(runtime, receive)
        return { close() { receivers.delete(runtime); closed.push(runtime) }, async invoke(method: string, params: any) {
            if (method === 'write') writes.push(params.data)
            return { success: true, screen: { sequence: 0, cols: 80, rows: 24, data: '' } }
        } }
    }
}))
const { MobileTerminalAccess } = await import('../src/main/mobile-terminal-access')
const delivered: any[] = []
const access = new MobileTerminalAccess(() => ({ getMobileTerminalIdentity: async () => ({ runtimeId: 'chat' }) }) as any, event => delivered.push(event))
const roots = [{ id: 'r', path: 'C:\\shared', readOnly: false }], chat = { canonicalChatId: 'chat' }
const ids = terminals.map(t => id(t.runtimeId, t.sessionId))
const attach = (index: number, subscriptionId: string, keepExisting = true) => access.dispatch('terminal.attach', { terminalId: ids[index], subscriptionId, keepExisting }, chat, roots)
await attach(0, 'a1'); await attach(1, 'b1')
assert.equal(receivers.size, 2, 'separate runtimes stay subscribed')
receivers.get(terminals[0].runtimeId)!({ sessionId: 'a', type: 'output', data: 'a' })
receivers.get(terminals[1].runtimeId)!({ sessionId: 'b', type: 'output', data: 'b' })
receivers.get(terminals[0].runtimeId)!({ sessionId: 'unselected', type: 'output', data: 'private' })
assert.deepEqual(delivered.map(e => e.terminalId), ids.slice(0, 2), 'only explicitly opened shells forward events')
await assert.rejects(attach(2, 'c1'), /two terminals/)
await attach(0, 'a2')
await access.dispatch('terminal.detach', { terminalId: ids[0], subscriptionId: 'a1' }, chat, roots)
assert.equal(receivers.size, 2, 'old pane cleanup cannot close a reopened pane')
await access.dispatch('terminal.detach', { terminalId: ids[0], subscriptionId: 'a2' }, chat, roots)
assert.equal(receivers.size, 1)
await attach(2, 'c1')
await access.dispatch('terminal.input', { terminalId: ids[2], data: 'echo test' }, chat, roots)
assert.deepEqual(writes, ['echo test'])
await assert.rejects(access.dispatch('terminal.input', { terminalId: ids[2], data: 'no' }, chat, [{ ...roots[0], readOnly: true }]), /read-only/)
await attach(0, '', false)
assert.equal(receivers.size, 1, 'legacy attach retains single-pane semantics')
await access.dispatch('terminal.detach', {}, chat, roots)
assert.equal(receivers.size, 0)
access.close()
assert.ok(closed.length >= 3)
let releaseOwner: (() => void) | undefined
let enteredOwner: (() => void) | undefined
const entered = new Promise<void>(resolve => { enteredOwner = resolve })
const blocked = new Promise<void>(resolve => { releaseOwner = resolve })
const closing = new MobileTerminalAccess(() => ({ getMobileTerminalIdentity: async () => { enteredOwner!(); await blocked; return { runtimeId: 'chat' } } }) as any, () => {})
const pendingAttach = closing.dispatch('terminal.attach', { terminalId: ids[0] }, chat, roots)
await entered; closing.close(); releaseOwner!()
await assert.rejects(pendingAttach, /released/)
assert.equal(receivers.size, 0, 'a disconnect during owner lookup cannot resurrect a terminal subscription')
console.log('Mobile terminal two-pane routing, scope, legacy behavior and stale cleanup passed')
