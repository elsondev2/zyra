import assert from 'node:assert/strict'
import { mergeCanonicalPresenceLatestTurn } from '../src/main/assistant/service-canonical-presence'
import { getAssistantThreadLastMessageAt } from '../src/renderer/src/pages/assistant/assistant-sessions-rail-utils'
import type { AssistantLatestTurn, AssistantThread } from '../src/shared/assistant/contracts'
const start = '2026-10-01T10:00:00.000Z'
const end = '2026-10-01T10:44:36.000Z'
const local = { id: 'turn', state: 'completed', requestedAt: start, startedAt: start, completedAt: end, assistantMessageId: 'answer', usage: null } as AssistantLatestTurn
const stale = { ...local, state: 'running', requestedAt: '2026-10-01T10:08:00.000Z', startedAt: '2026-10-01T10:08:00.000Z', completedAt: null }
const merged = mergeCanonicalPresenceLatestTurn(local, { latestTurn: stale } as any)!
assert.equal(merged.state, 'completed', 'The same completed turn cannot become running during attachment')
assert.equal(merged.startedAt, start, 'Attachment cannot replace a known send/start boundary')
assert.equal(merged.completedAt, end)
assert.equal(mergeCanonicalPresenceLatestTurn(local, { latestTurn: { ...stale, id: 'new-turn' } } as any)?.state, 'running', 'A genuinely new turn remains allowed')
assert.equal(getAssistantThreadLastMessageAt({ createdAt: start, latestTurn: local, messages: [{ role: 'user', createdAt: start }] } as AssistantThread), end, 'Partial hydration cannot move a completed chat backward in Recent')
console.log('PASS terminal turn and recency continuity')
