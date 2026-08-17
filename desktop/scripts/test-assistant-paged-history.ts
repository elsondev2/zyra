import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import initSqlJs from 'sql.js/dist/sql-asm.js'
import type { AssistantActivity, AssistantMessage, AssistantProposedPlan, AssistantSession, AssistantThread } from '../src/shared/assistant/contracts'
import { compareAssistantTimelineOrderKeys, getAssistantTimelineOrderKey } from '../src/shared/assistant/timeline-order'
import {
    ASSISTANT_HISTORY_PAGE_MAX_CHARACTERS,
    INITIAL_ASSISTANT_HISTORY_PAGE_MAX_RECORDS,
    readAssistantHistoryPage,
    readAssistantReviewIndex,
    readAssistantThreadDetail,
    readAssistantTurnDetail,
    searchAssistantTurns
} from '../src/main/assistant/persistence-history'
import {
    ASSISTANT_ACTIVITY_PAYLOAD_MAX_CHARACTERS,
    serializeAssistantActivityPayload
} from '../src/main/assistant/persistence-activity-payload'
import { initializeAssistantPersistenceSchema } from '../src/main/assistant/persistence-utils'
import { replaceAssistantSnapshot, upsertAssistantCanonicalTimelineProjection } from '../src/main/assistant/persistence-write'
import { createDefaultSnapshot } from '../src/main/assistant/projector'
import { toAssistantShellSnapshot } from '../src/main/assistant/persistence-snapshot'
import {
    applyAssistantRetainedHistory,
    hasRenderableAssistantRetainedHistory,
    formatAssistantHistoryLoadError,
    hasAssistantPersistedThreadContent,
    shouldShowAssistantThreadHistoryLoader
} from '../src/renderer/src/lib/assistant/assistant-history-state'
import { computeStableAssistantTimelineRows } from '../src/renderer/src/pages/assistant/assistant-virtual-timeline-rows'
import type { TimelineDisplayRow } from '../src/renderer/src/pages/assistant/assistant-timeline-helpers'

const at = (minute: number) => new Date(Date.parse('2026-07-16T10:00:00.000Z') + minute * 60_000).toISOString()
const messages: AssistantMessage[] = []
const activities: AssistantActivity[] = []
const proposedPlans: AssistantProposedPlan[] = []
for (let index = 1; index <= 4; index += 1) {
    const turnId = `turn-${index}`
    messages.push({ id: `user-${index}`, role: 'user', text: `Prompt ${index}`, turnId, streaming: false, timelineSequence: index * 10, createdAt: at(index), updatedAt: at(index) })
    activities.push({
        id: `activity-${index}`,
        kind: index === 2 ? 'file-change' : 'command',
        tone: 'tool',
        summary: `Tool ${index}`,
        turnId,
        timelineSequence: index * 10 + 1,
        createdAt: at(index),
        payload: index === 2 ? {
            category: 'file-change',
            provider: 'pi',
            status: 'completed',
            source: 'provider-result',
            authoritative: true,
            revision: 2,
            paths: ['src/review-index.ts'],
            createdPaths: [],
            changes: [{ path: 'src/review-index.ts', kind: 'update', diff: '@@ -1 +1 @@\n-old\n+new' }],
            patch: '--- a/src/review-index.ts\n+++ b/src/review-index.ts\n@@ -1 +1 @@\n-old\n+new',
            fileCount: 1,
            startedAt: at(index),
            completedAt: at(index)
        } : { status: 'completed' }
    })
    messages.push({ id: `assistant-${index}`, role: 'assistant', text: `Response ${index}`, turnId, streaming: false, timelineSequence: index * 10 + 2, createdAt: at(index), updatedAt: at(index) })
}
proposedPlans.push({ id: 'plan-3', turnId: 'turn-3', planMarkdown: 'Plan three', timelineSequence: 33, createdAt: at(3), updatedAt: at(3) })

const thread: AssistantThread = {
    id: 'paged-thread', providerThreadId: null, source: 'root', parentThreadId: null, providerParentThreadId: null,
    subagentDepth: null, agentNickname: null, agentRole: null, model: 'test', cwd: 'C:/fixture',
    messageCount: messages.length, activityCount: activities.length, proposedPlanCount: proposedPlans.length,
    lastSeenCompletedTurnId: 'turn-4', runtimeMode: 'approval-required', interactionMode: 'default', state: 'ready',
    lastError: null, createdAt: at(0), updatedAt: at(4), latestTurn: null,
    hasPendingApprovals: false, hasPendingUserInputs: false, hasActivePlan: false,
    activePlan: null, messages, activities, proposedPlans, pendingApprovals: [], pendingUserInputs: []
}
const session: AssistantSession = {
    id: 'paged-session', title: 'Paged fixture', mode: 'work', projectPath: 'C:/fixture', playgroundLabId: null,
    pendingLabRequest: null, archived: false, createdAt: at(0), updatedAt: at(4), activeThreadId: thread.id,
    threadIds: [thread.id], threads: [thread]
}
const snapshot = createDefaultSnapshot()
snapshot.selectedSessionId = session.id
snapshot.sessions = [session]

const SQL = await initSqlJs()
const db = new SQL.Database()
initializeAssistantPersistenceSchema(db)
replaceAssistantSnapshot(db, snapshot)
for (let index = 1; index <= 4; index += 1) {
    db.run(`INSERT OR REPLACE INTO assistant_turns (id, thread_id, model, state, requested_at, started_at, completed_at, assistant_message_id, effort, service_tier, usage_json, updated_at) VALUES (?, ?, ?, 'completed', ?, ?, ?, ?, NULL, NULL, NULL, ?)`, [`turn-${index}`, thread.id, thread.model, at(index), at(index), at(index), `assistant-${index}`, at(index)])
}
db.run(`INSERT INTO assistant_messages (id, thread_id, role, text, turn_id, streaming, timeline_sequence, created_at, updated_at) VALUES (?, ?, 'assistant', ?, 'turn-2', 0, 23, ?, ?)`, ['assistant-2-final', thread.id, 'Final response 2 from the agent', at(2), at(2)])

const newest = readAssistantHistoryPage(db, { threadId: thread.id, turnLimit: 2 })
assert.deepEqual(newest.messages.filter((message) => message.role === 'user').map((message) => message.id), ['user-3', 'user-4'])
assert.equal(newest.pageInfo.turnCount, 2)
assert.equal(newest.pageInfo.hasOlder, true)
assert.deepEqual(newest.activities.map((activity) => activity.id), ['activity-3', 'activity-4'])
assert.deepEqual(newest.proposedPlans.map((plan) => plan.id), ['plan-3'])

const older = readAssistantHistoryPage(db, { threadId: thread.id, before: newest.pageInfo.oldestCursor, turnLimit: 2 })
assert.deepEqual(older.messages.filter((message) => message.role === 'user').map((message) => message.id), ['user-1', 'user-2'])
assert.equal(older.pageInfo.hasOlder, false)
assert.equal(new Set([...newest.messages, ...older.messages].map((message) => message.id)).size, newest.messages.length + older.messages.length)
assert.throws(() => readAssistantHistoryPage(db, { threadId: thread.id, before: 'malformed' }), /malformed or stale/)

const detail = readAssistantThreadDetail(db, thread.id)
assert.equal(detail.history.pageInfo.turnCount, 4)
assert.equal(detail.history.fullyLoaded, true)
const turnDetail = readAssistantTurnDetail(db, thread.id, 'turn-2')
assert.deepEqual(turnDetail.messages.map((message) => message.id), ['user-2', 'assistant-2', 'assistant-2-final'])
assert.deepEqual(turnDetail.activities.map((activity) => activity.id), ['activity-2'])
assert.deepEqual(searchAssistantTurns(db, thread.id, 'Prompt 2').turnIds, ['turn-2'])
assert.deepEqual(searchAssistantTurns(db, thread.id, 'Tool 3').turnIds, ['turn-3'])

const reviewIndex = readAssistantReviewIndex(db, thread.id)
assert.equal(reviewIndex.totalTurns, 4, 'Review counts the complete persisted chat instead of the loaded page')
assert.deepEqual(reviewIndex.turns.map((turn) => turn.number), [4, 3, 2, 1], 'Review numbering remains stable and chronological')
const indexedTurnTwo = reviewIndex.turns.find((turn) => turn.id === 'turn-2')
assert.equal(indexedTurnTwo?.prompt?.text, 'Prompt 2')
assert.equal(indexedTurnTwo?.response?.text, 'Final response 2 from the agent', 'Review keeps only the final agent message for the turn')
assert.deepEqual(indexedTurnTwo?.changes.map((change) => change.filePath), ['src/review-index.ts'], 'Review exposes persisted file links without loading full turn details')
assert.equal(indexedTurnTwo?.changes[0]?.additions, 1)
assert.equal(indexedTurnTwo?.changes[0]?.deletions, 1)

upsertAssistantCanonicalTimelineProjection(db, {
    threadId: thread.id,
    messages: [],
    activities: [{
        id: 'canonical-review-file-change',
        kind: 'file-change',
        tone: 'tool',
        summary: 'Edited file',
        detail: 'src/canonical-review.ts',
        turnId: 'turn-1',
        timelineSequence: 12,
        createdAt: at(1),
        payload: {
            category: 'file-change',
            provider: 'pi',
            status: 'completed',
            source: 'provider-result',
            authoritative: true,
            revision: 3,
            paths: ['src/canonical-review.ts'],
            createdPaths: [],
            changes: [{ path: 'src/canonical-review.ts', kind: 'update', diff: '@@ -1 +1 @@\n-old\n+new' }],
            patch: '--- a/src/canonical-review.ts\n+++ b/src/canonical-review.ts\n@@ -1 +1 @@\n-old\n+new',
            fileCount: 1
        }
    }]
})
const canonicalReviewIndex = readAssistantReviewIndex(db, thread.id)
assert.deepEqual(
    canonicalReviewIndex.turns.find((turn) => turn.id === 'turn-1')?.changes.map((change) => change.filePath),
    ['src/canonical-review.ts'],
    'canonical/TUI backfill rows must be visible through the unchanged Desktop Review index'
)

const shell = toAssistantShellSnapshot(snapshot)
assert.equal('messages' in shell.sessions[0]!.threads[0]!, false)
assert.equal(JSON.stringify(shell).includes('Response 4'), false)
assert.equal(shell.sessions[0]!.threads[0]!.messageCount, messages.length)

const shellSnapshot = {
    ...snapshot,
    sessions: [{
        ...snapshot.sessions[0]!,
        threads: [{
            ...snapshot.sessions[0]!.threads[0]!,
            activePlan: null,
            messages: [],
            activities: [],
            proposedPlans: [],
            pendingApprovals: [],
            pendingUserInputs: []
        }]
    }]
}
const retainedHistory = { ...readAssistantThreadDetail(db, thread.id).history, lastUsedAt: Date.now() }
const restoredFromRetainedHistory = applyAssistantRetainedHistory(shellSnapshot, thread.id, retainedHistory)
assert.equal(hasRenderableAssistantRetainedHistory(retainedHistory), true)
assert.equal(
    restoredFromRetainedHistory.sessions[0]!.threads[0]!.messages.length,
    retainedHistory.messages.length,
    'fresh retained history must rematerialize a shell-only thread instead of leaving a blank selected chat'
)
assert.equal(
    restoredFromRetainedHistory.sessions[0]!.threads[0]!.activities.length,
    retainedHistory.activities.length,
    'retained activity rows must survive a shell refresh alongside chat messages'
)
assert.equal(
    hasRenderableAssistantRetainedHistory({
        ...retainedHistory,
        messages: [],
        activities: [],
        proposedPlans: []
    }),
    false,
    'an authoritative empty history remains cacheable without pretending it can restore timeline rows'
)

const metadataOnlyThread: AssistantThread = {
    ...thread,
    messageCount: 0,
    activityCount: 0,
    proposedPlanCount: 0,
    hasActivePlan: false,
    hasPendingApprovals: false,
    hasPendingUserInputs: false,
    activePlan: null,
    messages: [],
    activities: [],
    proposedPlans: [],
    pendingApprovals: [],
    pendingUserInputs: [],
    latestTurn: {
        id: 'missing-history-turn', state: 'completed', requestedAt: at(5), startedAt: at(5), completedAt: at(5),
        assistantMessageId: 'missing-history-message', usage: null
    }
}
assert.equal(hasAssistantPersistedThreadContent(metadataOnlyThread), false, 'completed-turn metadata without persisted timeline rows is not loadable chat history')
assert.equal(shouldShowAssistantThreadHistoryLoader({
    selectionHydrating: false,
    snapshotLoading: false,
    historyLoaded: false,
    historyLoadFailed: false,
    hasPersistedContent: true
}), true, 'persisted timeline rows show a loader until initial hydration finishes')
assert.equal(shouldShowAssistantThreadHistoryLoader({
    selectionHydrating: false,
    snapshotLoading: false,
    historyLoaded: true,
    historyLoadFailed: false,
    hasPersistedContent: true
}), false, 'an authoritative empty hydration result ends the chat loader')
assert.equal(shouldShowAssistantThreadHistoryLoader({
    selectionHydrating: false,
    snapshotLoading: false,
    historyLoaded: false,
    historyLoadFailed: true,
    hasPersistedContent: true
}), false, 'a failed hydration cannot leave the chat loader spinning forever')
assert.match(formatAssistantHistoryLoadError(new Error('Aborted(OOM). Build with -sASSERTIONS for more info.')), /Restart Zyra/, 'SQL.js memory failures explain how to activate the bounded reader')

const tiedMessage = { ...messages[0]!, id: 'tie-message', timelineSequence: undefined, createdAt: at(9) }
const tiedActivity = { ...activities[0]!, id: 'tie-activity', timelineSequence: undefined, createdAt: at(9) }
assert.notEqual(compareAssistantTimelineOrderKeys(getAssistantTimelineOrderKey('message', tiedMessage), getAssistantTimelineOrderKey('activity', tiedActivity)), 0)
assert.ok(compareAssistantTimelineOrderKeys(getAssistantTimelineOrderKey('message', tiedMessage), getAssistantTimelineOrderKey('activity', tiedActivity)) < 0)

const initialRows: TimelineDisplayRow[] = newest.messages.map((message) => ({ kind: 'message', id: message.id, createdAt: message.createdAt, message }))
const stableInitial = computeStableAssistantTimelineRows(null, initialRows)
const changedLastMessage = { ...newest.messages[newest.messages.length - 1]!, text: 'Updated live response' }
const stableUpdate = computeStableAssistantTimelineRows(stableInitial, initialRows.map((row, index) => (
    index === initialRows.length - 1 && row.kind === 'message' ? { ...row, message: changedLastMessage } : row
)))
assert.equal(stableUpdate.rows[0], stableInitial.rows[0], 'updating one live message preserves unrelated row identity')
assert.notEqual(stableUpdate.rows[stableUpdate.rows.length - 1], stableInitial.rows[stableInitial.rows.length - 1])
const prependedRow: TimelineDisplayRow = { kind: 'message', id: older.messages[0]!.id, createdAt: older.messages[0]!.createdAt, message: older.messages[0]! }
const stablePrepend = computeStableAssistantTimelineRows(stableUpdate, [prependedRow, ...stableUpdate.rows])
assert.equal(stablePrepend.rows[1], stableUpdate.rows[0], 'prepending a page retains existing row object references')

const queryPlan = db.exec(`EXPLAIN QUERY PLAN SELECT id FROM assistant_messages WHERE thread_id = ? AND role = 'user' ORDER BY created_at DESC, timeline_sequence DESC, id DESC LIMIT 20`, [thread.id])[0]?.values || []
assert.equal(queryPlan.some((row) => row.some((value) => String(value).includes('idx_assistant_messages_history'))), true)

db.run(`INSERT INTO assistant_messages (id, thread_id, role, text, turn_id, streaming, timeline_sequence, created_at, updated_at) VALUES (?, ?, 'user', ?, NULL, 0, 80, ?, ?)`, ['legacy-user', thread.id, 'Legacy prompt without a ledger row', at(8), at(8)])
db.run(`INSERT INTO assistant_messages (id, thread_id, role, text, turn_id, streaming, timeline_sequence, created_at, updated_at) VALUES (?, ?, 'assistant', ?, NULL, 0, 81, ?, ?)`, ['legacy-assistant', thread.id, 'Legacy final response', at(8), at(8)])
const legacyReviewIndex = readAssistantReviewIndex(db, thread.id)
const legacyIndexTurn = legacyReviewIndex.turns.find((turn) => turn.id === 'message:legacy-user')
assert.equal(legacyReviewIndex.totalTurns, 5, 'legacy user prompts remain part of the complete Review count')
assert.equal(legacyIndexTurn?.response?.text, 'Legacy final response')
const legacyDetail = readAssistantTurnDetail(db, thread.id, 'message:legacy-user')
assert.deepEqual(legacyDetail.messages.map((message) => message.id), ['legacy-user', 'legacy-assistant'], 'opening a legacy index row lazily loads only its timeline window')

const largePrompt = 'x'.repeat(350_000)
for (let index = 1; index <= 6; index += 1) {
    const createdAt = at(20 + index)
    const sequenceBase = 1_000 + index * 100
    db.run(`INSERT INTO assistant_messages (id, thread_id, role, text, turn_id, streaming, timeline_sequence, created_at, updated_at) VALUES (?, ?, 'user', ?, ?, 0, ?, ?, ?)`, [`budget-user-${index}`, thread.id, largePrompt, `budget-turn-${index}`, sequenceBase, createdAt, createdAt])
    for (let activityIndex = 1; activityIndex <= 70; activityIndex += 1) {
        db.run(`INSERT INTO assistant_activities (id, thread_id, kind, tone, summary, detail, turn_id, timeline_sequence, created_at, payload_json) VALUES (?, ?, 'command', 'tool', ?, NULL, ?, ?, ?, '{}')`, [`budget-activity-${index}-${activityIndex}`, thread.id, `Activity ${activityIndex}`, `budget-turn-${index}`, sequenceBase + activityIndex, createdAt])
    }
    db.run(`INSERT INTO assistant_messages (id, thread_id, role, text, turn_id, streaming, timeline_sequence, created_at, updated_at) VALUES (?, ?, 'assistant', ?, ?, 0, ?, ?, ?)`, [`budget-assistant-${index}`, thread.id, `Budget response ${index}`, `budget-turn-${index}`, sequenceBase + 71, createdAt, createdAt])
}
const budgetedPage = readAssistantHistoryPage(db, { threadId: thread.id, turnLimit: 20 })
assert.equal(budgetedPage.pageInfo.turnCount, 2, 'initial history keeps complete newest turns within its smaller first-paint budget')
assert.equal(budgetedPage.messages.some((message) => message.id === 'budget-user-4'), false, 'the oldest over-budget turn remains on the next page')
assert.equal(budgetedPage.messages.some((message) => message.id === 'budget-user-6'), true, 'the newest turn is always retained')
assert.equal(budgetedPage.messages.reduce((total, message) => total + message.text.length, 0) <= ASSISTANT_HISTORY_PAGE_MAX_CHARACTERS, true)
assert.equal(budgetedPage.messages.length + budgetedPage.activities.length + budgetedPage.proposedPlans.length <= INITIAL_ASSISTANT_HISTORY_PAGE_MAX_RECORDS, true)
assert.equal(budgetedPage.pageInfo.hasOlder, true)

const oversizedCreatedAt = at(40)
const oversizedPayload = JSON.stringify({
    status: 'completed',
    toolName: 'read',
    toolCallId: 'oversized-read',
    historyBodyRef: {
        version: 1,
        canonicalChatId: 'canonical:oversized',
        entryIndex: 20,
        entryId: 'entry:oversized-read',
        entrySha256: 'd'.repeat(64),
        toolCallId: 'oversized-read',
        toolName: 'read',
        bodyBytes: ASSISTANT_ACTIVITY_PAYLOAD_MAX_CHARACTERS * 3
    },
    paths: ['assets/large-image.png'],
    surface: { version: 1, kind: 'file-read', lifecycle: 'completed' },
    result: { content: [{ type: 'image', data: 'a'.repeat(ASSISTANT_ACTIVITY_PAYLOAD_MAX_CHARACTERS * 3) }] }
})
db.run(`INSERT INTO assistant_messages (id, thread_id, role, text, turn_id, streaming, timeline_sequence, created_at, updated_at) VALUES (?, ?, 'user', 'Inspect image', 'oversized-turn', 0, 2000, ?, ?)`, ['oversized-user', thread.id, oversizedCreatedAt, oversizedCreatedAt])
db.run(`INSERT INTO assistant_activities (id, thread_id, kind, tone, summary, detail, turn_id, timeline_sequence, created_at, payload_json) VALUES (?, ?, 'file-read', 'tool', 'Read file', 'assets/large-image.png', 'oversized-turn', 2001, ?, ?)`, ['oversized-activity', thread.id, oversizedCreatedAt, oversizedPayload])
db.run(`INSERT INTO assistant_messages (id, thread_id, role, text, turn_id, streaming, timeline_sequence, created_at, updated_at) VALUES (?, ?, 'assistant', 'Image inspected', 'oversized-turn', 0, 2002, ?, ?)`, ['oversized-assistant', thread.id, oversizedCreatedAt, oversizedCreatedAt])
const oversizedPage = readAssistantHistoryPage(db, { threadId: thread.id, turnLimit: 1 })
assert.deepEqual(oversizedPage.messages.map((message) => message.id), ['oversized-user', 'oversized-assistant'], 'an oversized complete turn still loads')
assert.equal(oversizedPage.activities[0]?.payload?.persistencePayloadTruncated, true, 'historical reads omit oversized embedded result bodies before SQL.js materializes them')
assert.equal(oversizedPage.activities[0]?.payload?.originalPayloadCharacters, oversizedPayload.length)
const compactedPayload = serializeAssistantActivityPayload(JSON.parse(oversizedPayload))
const parsedCompactedPayload = JSON.parse(compactedPayload)
assert.equal(compactedPayload.length < ASSISTANT_ACTIVITY_PAYLOAD_MAX_CHARACTERS, true, 'new oversized activity payloads are compacted before persistence')
assert.deepEqual(parsedCompactedPayload.paths, ['assets/large-image.png'], 'payload compaction preserves useful file metadata')
assert.equal(parsedCompactedPayload.historyBodyRef.entryId, 'entry:oversized-read', 'payload compaction preserves deferred-output hydration identity')
assert.equal(parsedCompactedPayload.toolCallId, 'oversized-read')
assert.equal('result' in parsedCompactedPayload, false, 'payload compaction removes the embedded result body')

const virtualTimelineSource = readFileSync(new URL('../src/renderer/src/pages/assistant/AssistantVirtualTimeline.tsx', import.meta.url), 'utf8')
assert.equal(virtualTimelineSource.includes('initialScrollAtEnd'), true, 'LegendList owns initial positioning at the newest row')
assert.equal(virtualTimelineSource.includes('onLoad={handleInitialLoad}'), true, 'the virtual list waits for measured initial layout before arming older history')
assert.equal(virtualTimelineSource.includes('INITIAL_END_FOLLOW_DELAYS_MS'), false, 'initial positioning does not replay timer-driven viewport corrections')
assert.equal(virtualTimelineSource.includes('scrollElement.scrollTop ='), false, 'native DOM scrolling cannot fight LegendList during bootstrap or prepends')
assert.equal(virtualTimelineSource.includes('key={props.windowKey}'), true, 'switching chats creates a fresh initial-scroll session')
assert.equal(virtualTimelineSource.includes('startupSettled && olderLoadIntent && props.hasOlder'), true, 'older history cannot load before end positioning and upward user intent')
assert.equal(virtualTimelineSource.includes('&& !props.loadOlderError ? requestOlderPage'), true, 'a failed older page cannot enter an automatic retry loop')
assert.equal(virtualTimelineSource.includes('setOlderLoadIntentWindowKey(null)'), true, 'one upward gesture can request at most one older page')
assert.equal(virtualTimelineSource.includes("event.deltaY < 0"), true, 'upward wheel intent arms automatic older-page loading')
assert.equal(virtualTimelineSource.includes('contentInsetEndAdjustment={props.contentInsetEndAdjustment}'), true, 'LegendList receives the real composer inset for its own measured scroll range')
assert.equal(virtualTimelineSource.includes('previousContentInsetEndRef'), false, 'composer resizing has no second viewport controller')

db.close()
console.log('Assistant paged history contract: ok')
