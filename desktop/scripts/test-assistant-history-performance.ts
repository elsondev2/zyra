import assert from 'node:assert/strict'
import { performance } from 'node:perf_hooks'
import initSqlJs from 'sql.js/dist/sql-asm.js'
import { createAssistantLongHistoryFixture } from './fixtures/assistant-long-history-fixture'
import { readAssistantHistoryPage, readAssistantReviewIndex } from '../src/main/assistant/persistence-history'
import { initializeAssistantPersistenceSchema } from '../src/main/assistant/persistence-utils'
import { replaceAssistantSnapshot } from '../src/main/assistant/persistence-write'
import { toAssistantShellSnapshot } from '../src/main/assistant/persistence-snapshot'
import { getTimelineEntries } from '../src/renderer/src/pages/assistant/assistant-timeline-helpers'

const snapshot = createAssistantLongHistoryFixture()
const thread = snapshot.sessions[0]!.threads[0]!
const SQL = await initSqlJs()
const db = new SQL.Database()
initializeAssistantPersistenceSchema(db)
replaceAssistantSnapshot(db, snapshot)

const shellStart = performance.now()
const shell = toAssistantShellSnapshot(snapshot)
const shellMs = performance.now() - shellStart
const fullPayloadBytes = JSON.stringify(snapshot).length
const shellPayloadBytes = JSON.stringify(shell).length

const fullReadStart = performance.now()
const fullMessageRows = db.exec('SELECT id, role, text, turn_id, streaming, timeline_sequence, created_at, updated_at FROM assistant_messages WHERE thread_id = ? ORDER BY created_at ASC, id ASC', [thread.id])[0]?.values || []
const fullActivityRows = db.exec('SELECT id, kind, tone, summary, detail, turn_id, timeline_sequence, created_at, payload_json FROM assistant_activities WHERE thread_id = ? ORDER BY created_at ASC, id ASC', [thread.id])[0]?.values || []
const fullReadMs = performance.now() - fullReadStart

const pageStart = performance.now()
const page = readAssistantHistoryPage(db, { threadId: thread.id })
const pageReadMs = performance.now() - pageStart
const pagePayloadBytes = JSON.stringify(page).length

const reviewIndexStart = performance.now()
const reviewIndex = readAssistantReviewIndex(db, thread.id)
const reviewIndexReadMs = performance.now() - reviewIndexStart
const reviewIndexPayloadBytes = JSON.stringify(reviewIndex).length

const deriveStart = performance.now()
const entries = getTimelineEntries(page.messages, [...page.activities].reverse(), page.proposedPlans)
const deriveMs = performance.now() - deriveStart

assert.equal(fullMessageRows.length, 2000)
assert.equal(fullActivityRows.length, 4000)
assert.equal(page.messages.filter((message) => message.role === 'user').length, 20)
assert.equal(page.pageInfo.hasOlder, true)
assert.ok(shellPayloadBytes < fullPayloadBytes / 20, 'shell payload should exclude history bodies')
assert.ok(pagePayloadBytes < fullPayloadBytes / 10, 'initial page payload should remain bounded')
assert.equal(reviewIndex.totalTurns, 1000, 'Review indexes the complete chat without paging every transcript row into the renderer')
assert.equal(reviewIndex.turns[0]?.response?.text.includes('Fixture result 1000'), true, 'Review stores only the final agent response preview per turn')
assert.deepEqual(reviewIndex.turns[0]?.changes.map((change) => change.filePath), ['src/fixture-1000.ts'])
assert.ok(reviewIndexPayloadBytes < fullPayloadBytes / 2, 'Review index payload must stay far smaller than the full transcript and tool history')
assert.ok(entries.length > 0)

console.log(JSON.stringify({
    fixture: { messages: fullMessageRows.length, activities: fullActivityRows.length },
    payloadBytes: { fullSnapshot: fullPayloadBytes, shell: shellPayloadBytes, initialPage: pagePayloadBytes, reviewIndex: reviewIndexPayloadBytes },
    timingsMs: {
        shellProjection: Number(shellMs.toFixed(2)),
        fullHistoryRead: Number(fullReadMs.toFixed(2)),
        initialPageRead: Number(pageReadMs.toFixed(2)),
        reviewIndexRead: Number(reviewIndexReadMs.toFixed(2)),
        initialPageDerivation: Number(deriveMs.toFixed(2))
    }
}, null, 2))

db.close()
