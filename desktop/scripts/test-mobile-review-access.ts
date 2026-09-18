import assert from 'node:assert/strict'
import { MobileReviewAccess } from '../src/main/mobile-review-access'

const calls: string[] = []
const service = {
    getSnapshot: async () => ({ sessions: [{ threads: [{ id: 'desktop-private', providerThreadId: 'private' }, { id: 'desktop-shared', providerThreadId: 'canonical' }] }] }),
    getReviewIndex: async (id: string) => { calls.push('index:' + id); return { index: { turns: [{ id: 'turn' }] } } },
    getTurnDetail: async (id: string, turn: string) => {
        calls.push('detail:' + id + ':' + turn)
        return { detail: { messages: [{ id: 'm', role: 'assistant', text: 'Done', createdAt: 'now' }, { role: 'system', text: 'internal' }], activities: [
            { id: 'tool', kind: 'command', detail: 'raw private tool output', payload: { output: 'raw private' } },
            { id: 'write', kind: 'file-change', createdAt: 'now', detail: 'raw private output', payload: { changes: [{ path: '/work/a', kind: 'update', diff: '@@ -1 +1 @@\n-old\n+new' }], output: 'raw private', errorMessage: 'private path' } }
        ] } }
    }
}
const review = new MobileReviewAccess(() => service as any)
await review.index('canonical')
assert.deepEqual(calls, ['index:desktop-shared'])
const detail = await review.turn('canonical', 'turn')
assert.equal(detail.messages.length, 1)
assert.equal(detail.activities.length, 1)
assert.equal(detail.activities[0].id, 'write')
assert.equal(JSON.stringify(detail).includes('raw private'), false)
assert.equal(JSON.stringify(detail).includes('private path'), false)
await assert.rejects(review.turn('canonical', 'foreign-turn'), /no longer available/)
await assert.rejects(review.index('desktop-private'), /not synchronized/)
assert.equal(calls.some(call => call.includes('desktop-private')), false)
assert.equal(calls.filter(call => call.startsWith('detail:')).length, 1)
console.log('Mobile review canonical mapping, legacy file change and raw-output exclusion: passed')
const usageAdapter = new MobileReviewAccess(() => ({
    getSnapshot: async () => ({ sessions: [{ id: 'owner-session', threads: [{ id: 'chosen-thread', providerThreadId: 'chosen', model: 'gpt-5.5', activityCount: 1, proposedPlanCount: 0, updatedAt: 'v1' }] }] }),
    getSessionTurnUsage: async ({ sessionId }: {sessionId: string}) => { assert.equal(sessionId, 'owner-session');return { usage: { turns: [{ id: 'ours', threadId: 'chosen-thread', usage: {} }, { id: 'other', threadId: 'different-thread', usage: {} }], totals: { threadId: 'different-thread', contextTokens: 999 }, fetchedAt: 'now' } } },
    getReviewIndex: async () => ({ index: { turns: [{ changes: [{ filePath: 'a.txt' }] }] } })
}) as any)
const usage = await usageAdapter.details('chosen')
assert.equal(usage.turns.length, 1)
assert.equal(usage.turns[0].id, 'ours')
assert.equal(usage.totals, null, 'another selected thread context is never returned')
const coldMetadata = await usageAdapter.metadata(['chosen', 'missing'])
assert.equal(coldMetadata[0].pending, true)
assert.equal(coldMetadata[0].hasWork, true)
assert.equal(coldMetadata[1].hasWork, null)
await new Promise(resolve => setTimeout(resolve, 0))
const warmMetadata = await usageAdapter.metadata(['chosen'])
assert.equal(warmMetadata[0].pending, false)
assert.equal(warmMetadata[0].index.turns[0].changes[0].filePath, 'a.txt')
console.log('Mobile thread usage ownership and cached asynchronous metadata: passed')
