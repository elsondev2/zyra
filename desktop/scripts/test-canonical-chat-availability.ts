import assert from 'node:assert/strict'
import { ensureCanonicalChatAvailability } from '../src/main/assistant/canonical-chat-availability'
import { selectDesktopControlWorker } from '../src/main/assistant/external-tool-routing'

let snapshot = { sessions: [{ threads: [{ id: 'local:existing', providerThreadId: 'canonical:existing' }] }] }
let refreshes = 0
const refresh = async () => { refreshes++; snapshot.sessions.push({ threads: [{ id: 'local:pi', providerThreadId: 'canonical:pi' }] }) }
assert(await ensureCanonicalChatAvailability('canonical:existing', () => snapshot, refresh))
assert.equal(refreshes, 0, 'existing tool/chat access stays on the fast path')
assert(await ensureCanonicalChatAvailability('canonical:pi', () => snapshot, refresh))
assert.equal(refreshes, 1, 'the first external tool call awaits Desktop import')
assert(await ensureCanonicalChatAvailability('local:pi', () => snapshot, refresh))
assert.equal(refreshes, 1, 'local IDs are accepted without reimport')
assert(!await ensureCanonicalChatAvailability('missing', () => snapshot, async () => { refreshes++ }))
assert.equal(refreshes, 2)
await assert.rejects(() => ensureCanonicalChatAvailability('failed', () => snapshot, async () => { throw new Error('Import failed') }), /Import failed/)
console.log('PASS canonical chat availability: first-use import, fast existing path, alias and failure behavior')
const workers = [{ localThreadId: 'local:first' }, { localThreadId: 'local:second' }]
assert.equal(selectDesktopControlWorker(workers, 'local:first', undefined), workers[0])
assert.equal(selectDesktopControlWorker(workers, undefined, undefined), workers[1])
assert.equal(selectDesktopControlWorker(workers, 'local:detached', undefined), undefined, 'a background request for another attachment cannot run in the last selected chat')
assert.equal(selectDesktopControlWorker([...workers, { localThreadId: null }], null, undefined), workers[1], 'an unbound worker cannot receive Browser control')
assert.equal(selectDesktopControlWorker(workers, 'local:first', 'external-tool:fixture'), undefined,
    'opening the Pi verification chat must not switch its root principal to the attached generation worker')
console.log('PASS external control routing: dedicated principal remains stable after opening its chat')
