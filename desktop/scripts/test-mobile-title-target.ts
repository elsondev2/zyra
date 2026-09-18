import assert from 'node:assert/strict'
import type { AssistantSession } from '../src/shared/assistant/contracts'
import { resolveSessionTitleTarget } from '../src/main/assistant/session-title-target'

const session = { activeThreadId: 'child', threads: [
    { id: 'root', source: 'root', parentThreadId: null, providerThreadId: 'canonical:private' },
    { id: 'child', source: 'subagent', parentThreadId: 'root', providerThreadId: 'canonical:shared' }
] } as AssistantSession
assert.equal(resolveSessionTitleTarget(session).thread.id, 'root', 'Desktop keeps its existing root title behavior')
assert.deepEqual(resolveSessionTitleTarget(session).canonicalIds, ['canonical:private', 'canonical:shared'])
const mobile = resolveSessionTitleTarget(session, 'canonical:shared')
assert.equal(mobile.thread.id, 'child', 'mobile reads only the authorized chat review')
assert.deepEqual(mobile.canonicalIds, ['canonical:shared'], 'mobile never rewrites sibling canonical titles')
assert.throws(() => resolveSessionTitleTarget(session, 'missing'), /thread not found/, 'a stale chat cannot fall back to private history')
assert.equal(resolveSessionTitleTarget({ ...session, threads: [session.threads[1]] }).thread.id, 'child', 'Desktop retains the active-thread fallback')
console.log('Mobile title target preserves authorized scope and Desktop defaults: passed')
