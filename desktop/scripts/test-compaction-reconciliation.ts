import assert from 'node:assert/strict'
import type { AssistantActivity } from '../src/shared/assistant/contracts'
import { findReplayedCompaction, findSupersededRuntimeCompactionIds } from '../src/main/assistant/compaction-reconciliation'
const live: AssistantActivity = { id: 'live-first', kind: 'context.compaction', tone: 'tool', summary: 'AUTO-COMPACTED', turnId: 'local-turn', createdAt: '2026-01-01T12:00:00Z', payload: { status: 'completed', firstKeptEntryId: 'kept-1', tokensBefore: 4000, sourceSequence: 20, startedSequence: 19 } }
const canonical: AssistantActivity = { id: 'shared-activity:canonical-1', kind: 'context-compaction', tone: 'info', summary: 'Context compacted', createdAt: '2026-01-01T12:00:00Z', payload: { canonicalEntry: { id: 'canonical-1', type: 'compaction', firstKeptEntryId: 'kept-1', tokensBefore: 4000 } } }
assert.equal(findReplayedCompaction([live], { replay: true, status: 'completed', sourceSequence: 20 })?.id, live.id)
assert.equal(findReplayedCompaction([live], { replay: true, status: 'running', sourceSequence: 19 })?.id, live.id, 'a replayed start must find the already settled operation')
assert.equal(findReplayedCompaction([live], { replay: true, status: 'completed', firstKeptEntryId: 'kept-1', tokensBefore: 4000 })?.id, live.id, 'old saved projections can reconcile without source sequence')
assert.equal(findReplayedCompaction([live], { replay: true, status: 'completed', sourceSequence: 99, firstKeptEntryId: 'kept-1', tokensBefore: 4000 }), null, 'a missed independent operation with a different durable sequence is not swallowed by equal metrics')
assert.equal(findReplayedCompaction([canonical], { replay: true, status: 'completed', firstKeptEntryId: 'kept-1', tokensBefore: 4000 })?.id, canonical.id)
assert.equal(findReplayedCompaction([live], { replay: false, status: 'completed', firstKeptEntryId: 'kept-1', tokensBefore: 4000 }), null, 'a genuinely new live operation is not swallowed')
assert.equal(findReplayedCompaction([live], { replay: true, status: 'completed', firstKeptEntryId: 'kept-2', tokensBefore: 4000 }), null)
const copies = Array.from({ length: 4 }, (_, index) => ({ ...live, id: `old-replay-${index}`, payload: { ...live.payload, sourceSequence: undefined, startedSequence: undefined }, createdAt: `2026-01-01T12:0${index}:00Z` }))
assert.deepEqual(findSupersededRuntimeCompactionIds([live, ...copies, canonical], [canonical]), [live.id, ...copies.map(activity => activity.id)], 'old accumulated copies disappear when canonical history is imported')
const secondCanonical = { ...canonical, id: 'shared-activity:canonical-2' }
assert.deepEqual(findSupersededRuntimeCompactionIds([canonical, secondCanonical], [canonical, secondCanonical]), [], 'separate canonical compactions remain even with identical result metrics')
assert.deepEqual(findSupersededRuntimeCompactionIds([{ ...live, payload: { ...live.payload, status: 'failed' } }], [canonical]), [], 'failed attempts are not hidden by successful canonical compactions')
console.log('Compaction replay identity, legacy-copy cleanup and distinct operations: ok')
