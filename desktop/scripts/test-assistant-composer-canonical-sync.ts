import assert from 'node:assert/strict'
import { reconcileAssistantComposerCanonicalConfiguration as reconcile, retainAssistantComposerCanonicalConfiguration as retain } from '../src/renderer/src/pages/assistant/assistant-composer-canonical-sync'

const original = { model: 'provider/model-a', runtimeMode: 'approval-required' as const, effort: 'medium' as const, fastModeEnabled: true }
const stored = { ...original, draft: 'Keep this unsent message', contextFiles: [{ id: 'image', path: '/image.png' }] }
assert.deepEqual(reconcile(original, { ...original, runtimeMode: 'full-access' }, stored), { runtimeMode: 'full-access' }, 'terminal permission updates replace previously persisted desktop values')
assert.deepEqual(reconcile(original, { ...original, model: 'provider/model-b', effort: 'high', fastModeEnabled: false }, stored), { model: 'provider/model-b', effort: 'high', fastModeEnabled: false }, 'model/thinking updates and explicit false arrive together')
assert.deepEqual(reconcile(original, original, { ...stored, model: 'provider/pending-model', runtimeMode: 'full-access' }), {}, 'unchanged server values must not overwrite an unsent desktop choice')
assert.deepEqual(reconcile(undefined, original, { model: 'provider/new-chat-choice' }), { runtimeMode: 'approval-required', effort: 'medium', fastModeEnabled: true }, 'first hydration preserves explicit new-chat overrides while filling absent fields')
assert.deepEqual(reconcile(original, {}, stored), {}, 'partial/loading payloads are not configuration resets')
assert.deepEqual(reconcile({}, original, stored), original, 'a newly loaded canonical configuration is authoritative after initial loading')
assert.deepEqual(reconcile(undefined, original, stored), {}, 'switching chats initializes a separate canonical baseline and keeps its pending configuration')
assert.equal(stored.draft, 'Keep this unsent message')
assert.equal(stored.contextFiles[0].path, '/image.png')
assert.deepEqual(Object.keys(reconcile(original, { ...original, model: 'provider/model-b' }, stored)), ['model'], 'canonical sync never patches drafts or attachments')
assert.deepEqual(reconcile(retain(original, { model: undefined }), original, { ...stored, model: 'provider/pending-model' }), {}, 'a transient partial snapshot cannot erase the baseline and overwrite pending edits on rehydration')
assert.deepEqual(reconcile(undefined, original, {}), original, 'reopening an existing connected chat uses canonical values instead of last-used storage')
assert.deepEqual(reconcile(original, { ...original, model: 'provider/intermediate', runtimeMode: 'edits-only', effort: 'high' }, {}, { model: 'provider/latest-choice' }), { runtimeMode: 'edits-only' }, 'an older model acknowledgement cannot replace a newer optimistic selection; unrelated permission changes still arrive')
const { validateAssistantSessionConfiguration: validate } = await import('../src/shared/assistant/session-configuration')
const { createAssistantComposerConfigurationPublisher: publisher } = await import('../src/renderer/src/pages/assistant/assistant-composer-configuration-publisher')
const owner = { sessionId: 'session-a', threadId: 'thread-a' }
assert.deepEqual(validate({ ...owner, runtimeMode: 'auto-review' }), { ...owner, runtimeMode: 'auto-review' }, 'permission-only patches contain no model/default fields')
assert.deepEqual(validate({ ...owner, model: ' provider/model-b ', effort: 'high' }), { ...owner, model: 'provider/model-b', effort: 'high' })
for (const invalid of [{}, { ...owner }, { ...owner, runtimeMode: 'unsafe' }, { ...owner, model: '' }, { ...owner, effort: 'unknown' }, { ...owner, runtimeMode: 'full-access', systemPrompt: 'unexpected' }]) {
    assert.throws(() => validate(invalid))
}
const calls: string[] = []
let release: (() => void) | undefined
const transport = publisher(async input => {
    calls.push(input.model || input.runtimeMode || '')
    if (calls.length === 1) await new Promise<void>(resolve => { release = resolve })
    return { success: true }
})
const first = transport({ ...owner, runtimeMode: 'edits-only' })
const second = transport({ ...owner, model: 'provider/model-b' })
await new Promise(resolve => setTimeout(resolve, 0))
assert.deepEqual(calls, ['edits-only'], 'later changes wait for the earlier canonical write')
assert.deepEqual(transport.pending(owner.sessionId, owner.threadId), { runtimeMode: 'edits-only', model: 'provider/model-b' })
release?.()
await Promise.all([first, second])
assert.deepEqual(calls, ['edits-only', 'provider/model-b'])
assert.deepEqual(transport.pending(owner.sessionId, owner.threadId), {}, 'acknowledged choices release their optimistic guard')
let attempts = 0
const recover = publisher(async () => ++attempts === 1 ? { success: false, error: 'Unavailable' } : { success: true })
await assert.rejects(recover({ ...owner, runtimeMode: 'edits-only' }), /Unavailable/)
await recover({ ...owner, model: 'provider/model-b' })
assert.equal(attempts, 2, 'one rejected request cannot poison future configuration edits')
let releaseOlder: (() => void) | undefined
let releaseNewer: (() => void) | undefined
const modelQueue = publisher(async input => {
    await new Promise<void>(resolve => { if (input.model === 'older') releaseOlder = resolve; else releaseNewer = resolve })
    return { success: true }
})
const older = modelQueue({ ...owner, model: 'older' })
const newer = modelQueue({ ...owner, model: 'newer' })
await new Promise(resolve => setTimeout(resolve, 0))
assert.deepEqual(modelQueue.pending(owner.sessionId, owner.threadId), { model: 'newer' })
releaseOlder?.()
await older
await new Promise(resolve => setTimeout(resolve, 0))
assert.deepEqual(modelQueue.pending(owner.sessionId, owner.threadId), { model: 'newer' }, 'older completion must not clear the newer same-field revision')
assert.deepEqual(reconcile(original, { ...original, model: 'older' }, {}, modelQueue.pending(owner.sessionId, owner.threadId)), {}, 'older canonical acknowledgement stays hidden while the newer model is pending')
releaseNewer?.()
await newer
assert.deepEqual(modelQueue.pending(owner.sessionId, owner.threadId), {})
console.log('Composer canonical synchronization: 31 assertions passed')
