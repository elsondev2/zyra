import assert from 'node:assert/strict'
import { mock } from 'bun:test'
mock.module('electron-log', () => ({ default: { warn: () => {}, info: () => {} } }))
const noop = () => undefined
mock.module('electron', () => ({ app: { getPath: () => process.env.TEMP || process.cwd(), isReady: () => true, on: noop, once: noop },
    BrowserWindow: class { static getAllWindows() { return [] } }, screen: { getAllDisplays: () => [], getPrimaryDisplay: () => ({ bounds: {} }) },
    nativeImage: { createFromBuffer: () => ({ isEmpty: () => true }) }, webContents: { fromId: () => null }, safeStorage: { isEncryptionAvailable: () => false } }))
const { queueGeneratedSessionTitle } = await import('../src/main/assistant/session-title-generation')
const { renameAssistantSessionAction } = await import('../src/main/assistant/service-session-actions')
const { commitAssistantSessionTitle } = await import('../src/main/assistant/session-title-updates')
const session = { id: 'serialized-title', title: 'Fix startup', threads: [{ providerThreadId: 'synthetic-canonical' }] }
const canonical: string[] = []
let release!: () => void
const delayed = new Promise<void>(resolve => { release = resolve })
const appendEvent = (_type: unknown, _date: string, payload: Record<string, unknown>) => { Object.assign(session, payload.patch) }
const automatic = queueGeneratedSessionTitle({ sessionId: session.id, threadId: 'synthetic-thread', messageText: 'Fix startup', seedTitle: session.title, cwd: 'C:/synthetic-project',
    generateText: async () => ({ success: true, text: 'Startup repair' }), getSnapshot: () => ({ sessions: [session] as any }), appendEvent,
    onApplied: async title => { canonical.push(title); await delayed } })
await new Promise(resolve => setTimeout(resolve, 0))
assert.deepEqual(canonical, ['Startup repair'])
const deps = { ensureReady: async () => {}, getSnapshot: () => ({ sessions: [session] }), appendEvent,
    runtime: { updateCanonicalChat: async (_id: string, patch: { title: string }) => { canonical.push(patch.title) } } }
const first = renameAssistantSessionAction(deps as never, session.id, 'My first name')
const second = renameAssistantSessionAction(deps as never, session.id, 'My latest name')
release()
await Promise.all([automatic, first, second])
assert.deepEqual(canonical, ['Startup repair', 'My first name', 'My latest name'], 'manual names commit after an already-running automatic write, without a compensating write')
assert.equal(session.title, 'My latest name')
await assert.rejects(commitAssistantSessionTitle(session.id, async () => { throw new Error('synthetic failed save') }))
assert.equal(await commitAssistantSessionTitle(session.id, () => 'Recovered'), 'Recovered', 'failed commits cannot poison later title updates')
console.log('Title commits: delayed automatic save, consecutive manual names, canonical/local agreement and failed-queue recovery: ok')
