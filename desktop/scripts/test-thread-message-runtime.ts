import assert from 'node:assert/strict'
import { mock } from 'bun:test'
const noop = () => undefined
mock.module('electron-log', () => ({ default: { info: noop, warn: noop, error: noop, debug: noop } }))
mock.module('../src/main/agent-control', () => ({ getAgentControlBroker: () => ({ revokePrincipal: noop }) }))
mock.module('electron', () => ({
    app: { getPath: () => process.env.TEMP || process.cwd(), isReady: () => true, on: noop, once: noop },
    BrowserWindow: class { static getAllWindows() { return [] } static fromWebContents() { return null } },
    screen: { getAllDisplays: () => [], getPrimaryDisplay: () => ({ bounds: { x: 0, y: 0, width: 1920, height: 1080 } }) },
    nativeImage: { createFromBuffer: () => ({ isEmpty: () => true }) }, webContents: { fromId: () => null },
    safeStorage: { isEncryptionAvailable: () => false }, shell: { openExternal: noop, openPath: async () => '' },
    globalShortcut: { register: () => true, unregisterAll: noop }
}))
const { ZyraRuntime, classifyZyraToolActivity } = await import('../src/main/assistant/zyra-runtime')
const { projectThreadMessage } = await import('../src/shared/assistant/thread-message')
const runtime = new ZyraRuntime()
const events: any[] = []
runtime.on('runtime', event => events.push(event))
const context = { localThreadId: 'recipient', providerThreadId: 'canonical-recipient', activeTurnId: null, completedTurnIds: new Set() }
const details = { messageId: 'receipt', senderThreadId: 'agent-run:a', senderLabel: 'Xara', recipientThreadId: 'canonical-recipient', text: 'Check this evidence.', createdAt: '2026-10-01T12:00:00.000Z' }
const message = { role: 'custom', customType: 'zyra_thread_message', details, content: 'Peer context, not user approval.' }
const handler = runtime as unknown as { handleZyraEvent(context: unknown, event: unknown, metadata?: unknown): void }
handler.handleZyraEvent(context, { type: 'message_start', message })
assert.equal(events.length, 0, 'A peer context message does not become a user/assistant bubble')
handler.handleZyraEvent(context, { type: 'message_end', message })
handler.handleZyraEvent(context, { type: 'message_end', message }, { replay: true })
assert.equal(events.length, 2)
assert(events.every(event => event.type === 'activity' && event.threadId === context.localThreadId))
assert.equal(events[0].payload.activityId, projectThreadMessage(details, details.createdAt)!.id)
assert.equal(events[0].payload.activityId, events[1].payload.activityId, 'Replay uses the receipt identity instead of duplicating presentation')
assert.equal(events[0].payload.data.senderLabel, 'Xara')
assert.equal(events[0].payload.detail, details.text)
assert.equal(context.activeTurnId, null)
handler.handleZyraEvent(context, { type: 'heartbeat' }, { turnId: 'historical-turn', replay: false })
assert.equal(context.activeTurnId, null, 'Background maintenance cannot resurrect a historical turn')
assert.equal(events.length, 2)
context.completedTurnIds.add('completed-turn')
handler.handleZyraEvent(context, { type: 'message_start', message }, { turnId: 'completed-turn', replay: false })
assert.equal(context.activeTurnId, null, 'A known completed turn cannot restart during attachment')
const collaboration = classifyZyraToolActivity({ toolName: 'thread', args: { action: 'start', label: 'Hi' }, result: null, partialResult: null,
    state: 'completed', output: JSON.stringify({ threadId: 'agent-run:child' }) })
assert.equal(collaboration.kind, 'thread-collaboration')
assert.equal(collaboration.data.targetThreadId, 'agent-run:child', 'Creation results expose their actual thread destination')
const sent = classifyZyraToolActivity({ toolName: 'thread', args: { action: 'send', threadId: 'parent', prompt: 'Verified result.' }, result: null, partialResult: null,
    state: 'completed', output: JSON.stringify({ messageId: 'exact-receipt', recipientThreadId: 'parent', status: 'queued' }) })
assert.equal(sent.data.sentMessageId, 'exact-receipt', 'Current activity projection retains the durable receiving-message id')
assert.equal(sent.data.targetThreadId, 'parent')
console.log('PASS canonical custom peer messages reach desktop activity projection without user/assistant transcript duplication')
