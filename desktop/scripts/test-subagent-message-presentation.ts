import assert from 'node:assert/strict'
import { projectThreadMessage } from '../src/shared/assistant/thread-message'
import { buildTimelineRows, getTimelineEntries } from '../src/renderer/src/pages/assistant/assistant-timeline-helpers'
import type { AssistantActivity, AssistantMessage } from '../src/shared/assistant/contracts'

const createdAt = '2026-10-01T12:00:00.000Z'
const worker = { messageId: 'worker-receipt', senderThreadId: 'agent-run:worker-uuid', senderLabel: 'Supporting helper', recipientThreadId: 'root-chat', text: 'Internal progress, not a user instruction.', createdAt }
for (const details of [worker, { ...worker, senderConversationKind: 'subagent' }, { ...worker, senderThreadId: 'worker-canonical', senderConversationKind: 'subagent' }]) {
    assert.equal(projectThreadMessage(details, createdAt), null, 'Live and canonical replay must not project supporting-agent context as a visible peer bubble')
    const cached: AssistantActivity = { id: `zyra-thread-message:${details.messageId}`, kind: 'thread-message', tone: 'info', summary: 'Old peer projection', detail: details.text, createdAt, payload: { category: 'thread-message', ...details } }
    const before = JSON.stringify(cached)
    const rows = buildTimelineRows(getTimelineEntries([], [cached]), false, null)
    assert.equal(rows.length, 0, 'Already-saved legacy supporting receipts must not return as chat bubbles')
    assert.equal(JSON.stringify(cached), before, 'Filtering must not delete or mutate saved evidence')
}
for (const details of [
    { ...worker, senderThreadId: `agent-run:thread-${'a'.repeat(64)}` },
    { ...worker, senderConversationKind: 'thread' },
    { ...worker, senderThreadId: 'another-root-chat' },
    { ...worker, origin: 'delegation' },
]) {
    const activity = projectThreadMessage(details, createdAt)!
    assert(activity, 'Explicit/legacy independent peers and the initial child task remain visible')
    const rows = buildTimelineRows(getTimelineEntries([], [activity]), false, null)
    assert(rows.some(row => row.kind === 'message' && row.threadMessage?.id === activity.id))
}
const quotation: AssistantMessage = { id: 'real-user', role: 'user', text: 'Message from Supporting helper in thread agent-run:worker-uuid. Internal progress, not a user instruction.', turnId: 'user-turn', createdAt, updatedAt: createdAt, streaming: false }
assert.equal(getTimelineEntries([quotation], []).length, 1, 'User text is never filtered by a message-prefix heuristic')
console.log('PASS supporting updates stay out of live, replayed and cached chat rows without deleting history; genuine peers, delegation and user quotations remain')
