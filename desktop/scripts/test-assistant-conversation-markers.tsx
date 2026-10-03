import assert from 'node:assert/strict'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import initSqlJs from 'sql.js/dist/sql-asm.js'
import { addAssistantConversationMarkers, formatAssistantConversationTime } from '../src/renderer/src/pages/assistant/assistant-conversation-markers'
import { AssistantConversationMarker } from '../src/renderer/src/pages/assistant/AssistantConversationMarker'
import { buildAssistantTurnUsageIndex } from '../src/renderer/src/pages/assistant/assistant-turn-usage-index'
import { computeStableAssistantTimelineRows } from '../src/renderer/src/pages/assistant/assistant-virtual-timeline-rows'
import { groupTimelineRowsIntoWorkSummaries } from '../src/renderer/src/pages/assistant/assistant-turn-work'
import { estimateTimelineRowHeight, type TimelineRenderRow } from '../src/renderer/src/pages/assistant/assistant-timeline-helpers'
import { initializeAssistantPersistenceSchema } from '../src/main/assistant/persistence-utils'
import { replaceAssistantSnapshot, persistAssistantEvent } from '../src/main/assistant/persistence-write'
import { readAssistantSessionTurnUsage } from '../src/main/assistant/persistence-read'
import { createDefaultAssistantSnapshot } from '../src/shared/assistant/projector'
import { createAssistantThread } from '../src/main/assistant/service-state'
import { createAssistantSessionRecord } from '../src/main/assistant/service-records'
import type { AssistantMessage, AssistantSessionTurnUsageEntry } from '../src/shared/assistant/contracts'
import { mock } from 'bun:test'

const start = '2026-10-02T10:00:00.000Z'
const turn = (id: string, requestedAt: string, model: string): AssistantSessionTurnUsageEntry => ({ id, model, sessionId: 'session', threadId: 'thread', requestedAt, startedAt: requestedAt,
    completedAt: requestedAt, state: 'completed', assistantMessageId: `answer-${id}`, usage: null, updatedAt: requestedAt })
const message = (id: string, date: string, role: 'user' | 'assistant', turnId: string | null): AssistantMessage => ({ id, role, text: id, createdAt: date, updatedAt: date, turnId, streaming: false })
const row = (message: AssistantMessage): TimelineRenderRow => ({ kind: 'message', id: message.id, createdAt: message.createdAt, message })
const first = turn('one', start, 'openai-codex/gpt-6.1-sol')
const next = turn('two', '2026-10-02T12:00:00.000Z', 'openai-codex/gpt-6-astra')
const rows = [row(message('prompt-one', start, 'user', first.id)), row(message('answer-one', '2026-10-02T10:03:00.000Z', 'assistant', first.id)),
    row(message('prompt-two', next.requestedAt, 'user', next.id)), row(message('answer-two', '2026-10-02T12:01:00.000Z', 'assistant', next.id))]
const ledger = buildAssistantTurnUsageIndex(rows.flatMap(row => row.kind === 'message' ? [row.message] : []), [first, next])
const marked = addAssistantConversationMarkers(rows, ledger)
assert.deepEqual(marked.map(row => row.kind), ['message', 'message', 'conversation-time', 'model-change', 'message', 'message'])
assert.equal(marked[4], rows[2], 'the boundary precedes the new prompt, preserving the real message object')
assert.equal(addAssistantConversationMarkers(rows, new Map()).filter(row => row.kind === 'model-change').length, 0, 'missing legacy model metadata never fabricates a switch')
assert.equal(addAssistantConversationMarkers(rows.slice(2), ledger).length, 2, 'a paged window cannot fabricate a gap or switch from unseen history')
const same = new Map(ledger); same.set(next.id, { ...next, model: first.model })
assert.equal(addAssistantConversationMarkers(rows, same).filter(row => row.kind === 'model-change').length, 0)
const longWork = { ...rows[1], message: { ...(rows[1] as Extract<TimelineRenderRow, {kind: 'message'}>).message, updatedAt: '2026-10-02T11:45:00.000Z' } } as TimelineRenderRow
assert.equal(addAssistantConversationMarkers([rows[0], longWork, rows[2]], ledger).filter(row => row.kind === 'conversation-time').length, 0, 'long-running work does not count as inactivity')
const legacy = rows.map(row => row.kind === 'message' && row.message.role === 'user' ? { ...row, message: { ...row.message, turnId: null } } : row)
assert.equal(addAssistantConversationMarkers(legacy, ledger).filter(row => row.kind === 'model-change').length, 1, 'legacy prompts without turn IDs use exact persisted request times')
const unknown = row(message('unknown-prompt', '2026-10-02T11:00:00.000Z', 'user', null))
assert.equal(addAssistantConversationMarkers([rows[0], unknown, rows[2]], ledger).filter(row => row.kind === 'model-change').length, 0, 'unknown intervening turns break comparison')
const grouped = groupTimelineRowsIntoWorkSummaries({ rows: [rows[0], { kind: 'activity', id: 'read', createdAt: start, activity: { id: 'read', kind: 'read', tone: 'tool', summary: 'Reading', turnId: first.id, createdAt: start } }, ...rows.slice(1)], messages: rows.flatMap(row => row.kind === 'message' ? [row.message] : []), turnUsageById: ledger, isWorking: false })
const groupedMarked = addAssistantConversationMarkers(grouped, ledger)
assert.equal(groupedMarked.filter(row => row.kind === 'turn-work-summary').length, 1, 'existing work collapse is preserved')
assert.ok(groupedMarked.filter(row => row.kind === 'turn-work-summary').every(row => row.rows.every(nested => nested.kind !== 'conversation-time' && nested.kind !== 'model-change')))
const stable = computeStableAssistantTimelineRows(null, marked)
assert.equal(computeStableAssistantTimelineRows(stable, addAssistantConversationMarkers(rows, ledger)), stable, 'markers keep virtual row identity across rerenders')
for (const marker of marked) if (marker.kind === 'model-change' || marker.kind === 'conversation-time') {
    assert.ok(estimateTimelineRowHeight(marker) < 50)
    const markup = renderToStaticMarkup(createElement(AssistantConversationMarker, { row: marker }))
    if (marker.kind === 'conversation-time') { assert.match(markup, /<time dateTime=/); assert.doesNotMatch(markup, /h-px|<hr/); }
    else { assert.match(markup, /Model changed from/); assert.match(markup, /gpt-6.1-sol/); assert.match(markup, /gpt-6-astra/); assert.match(markup, /h-px/); }
}
const localDate = new Date(2026, 9, 2, 17, 12)
assert.match(formatAssistantConversationTime(localDate.toISOString(), new Date(2026, 9, 2), 'en-GB'), /^Today 17:12$/)
assert.match(formatAssistantConversationTime(localDate.toISOString(), new Date(2026, 9, 3), 'en-GB'), /^Yesterday 17:12$/)
assert.match(formatAssistantConversationTime(localDate.toISOString(), new Date(2027, 0, 1), 'en-GB'), /2026/)
assert.equal(formatAssistantConversationTime('invalid'), '')

// Actual SQLite writes prove selecting a new model cannot relabel old turns.
const SQL = await initSqlJs(); const db = new SQL.Database()
initializeAssistantPersistenceSchema(db)
const thread = createAssistantThread(start); thread.id = first.threadId; thread.model = first.model; thread.latestTurn = { ...first }
const snapshot = createDefaultAssistantSnapshot()
snapshot.sessions = [createAssistantSessionRecord({ sessionId: first.sessionId, title: 'Marker fixture', projectPath: null, createdAt: start, thread })]
replaceAssistantSnapshot(db, snapshot)
thread.model = next.model
const persistTurn = (sequence: number) => persistAssistantEvent(db, { sequence, eventId: `turn-${sequence}`, type: 'thread.latest-turn.updated', occurredAt: next.requestedAt,
    sessionId: first.sessionId, threadId: thread.id, payload: { threadId: thread.id, latestTurn: thread.latestTurn } }, snapshot)
persistTurn(1)
let saved = readAssistantSessionTurnUsage(db, first.sessionId)
assert.equal(saved[0].model, first.model, 'replayed turn updates after model selection retain the model used by the previous turn')
let index = buildAssistantTurnUsageIndex([], saved, { sessionId: first.sessionId, threadId: thread.id, model: next.model, latestTurn: thread.latestTurn })
assert.equal(index.get(first.id)?.model, first.model, 'live UI overlay preserves persisted turn model')
thread.latestTurn = { ...next }; persistTurn(2)
saved = readAssistantSessionTurnUsage(db, first.sessionId)
assert.deepEqual(saved.map(turn => turn.model), [first.model, next.model], 'the next turn records the newly chosen model')
index = buildAssistantTurnUsageIndex([], [], { sessionId: first.sessionId, threadId: thread.id, model: 'different-selected-model', latestTurn: thread.latestTurn })
assert.equal(index.get(next.id)?.model, '', 'a completed turn without a saved model cannot inherit current selection')
db.close()
// Exercise the real query action, with Electron platform services kept cold.
const noop = () => undefined
mock.module('electron-log', () => ({ default: { info: noop, warn: noop, error: noop, debug: noop } }))
mock.module('../src/main/agent-control', () => ({ getAgentControlBroker: () => ({ revokePrincipal: noop }) }))
mock.module('electron', () => ({ app: { getPath: () => process.env.TEMP || process.cwd(), isReady: () => true, on: noop, once: noop },
    BrowserWindow: class { static getAllWindows() { return [] } static fromWebContents() { return null } },
    screen: { getAllDisplays: () => [], getPrimaryDisplay: () => ({ bounds: { x: 0, y: 0, width: 1000, height: 800 } }) },
    nativeImage: { createFromBuffer: () => ({ isEmpty: () => true }) }, webContents: { fromId: () => null },
    safeStorage: { isEncryptionAvailable: () => false }, shell: { openExternal: noop, openPath: async () => '' }, globalShortcut: { register: () => true, unregisterAll: noop } }))
const { getAssistantSessionTurnUsageAction } = await import('../src/main/assistant/service-session-actions')
thread.model = 'new-dropdown-selection'
const response = await getAssistantSessionTurnUsageAction({ ensureReady: async () => {}, getSnapshot: () => snapshot } as any, async () => saved, { sessionId: first.sessionId })
assert.equal(response.usage.turns.find(turn => turn.id === next.id)?.model, next.model, 'the IPC query preserves the saved model despite newer dropdown selection')
const responseIndex = buildAssistantTurnUsageIndex([], response.usage.turns, { sessionId: first.sessionId, threadId: thread.id, model: thread.model, latestTurn: thread.latestTurn })
assert.equal(addAssistantConversationMarkers(rows, responseIndex).filter(row => row.kind === 'model-change').length, 1, 'SQLite to query to UI index retains the actual model switch')

// Real submission and SQLite projection while connection is deliberately held.
const { sendAssistantPromptAction } = await import('../src/main/assistant/service-session-actions')
const { applyAssistantDomainEvent } = await import('../src/shared/assistant/projector')
const submissionDb = new SQL.Database()
initializeAssistantPersistenceSchema(submissionDb)
thread.model = first.model
thread.latestTurn = { ...first }
thread.messages = rows.slice(0, 2).flatMap(row => row.kind === 'message' ? [row.message] : [])
let submittedSnapshot = snapshot
replaceAssistantSnapshot(submissionDb, submittedSnapshot)
let sequence = 0
let releaseConnect!: () => void
let didConnect!: () => void
const connectStarted = new Promise<void>(resolve => { didConnect = resolve })
const connectionGate = new Promise<void>(resolve => { releaseConnect = resolve })
let connected = false
let dispatchedTurnId = ''
const pendingSubmission = sendAssistantPromptAction({
    ensureReady: async () => {}, getSnapshot: () => submittedSnapshot,
    getFirstUserMessageText: async () => 'First prompt', getTitleGenerationModel: async () => null,
    getSessionRuntimeCwd: () => 'C:/workspace',
    appendEvent(type: any, occurredAt: string, payload: any, sessionId: string, threadId: string) {
        const event = { sequence: ++sequence, eventId: `submission-${sequence}`, type, occurredAt, payload, sessionId, threadId }
        submittedSnapshot = applyAssistantDomainEvent(submittedSnapshot, event)
        persistAssistantEvent(submissionDb, event, submittedSnapshot)
    },
    runtime: {
        hasSession: () => connected,
        connect: async () => { didConnect(); await connectionGate; connected = true },
        sendPrompt: async (_id: string, _prompt: string, options: any) => {
            dispatchedTurnId = options.turnId
            return { turnId: options.turnId, providerThreadId: 'canonical-submission' }
        }
    }
} as any, 'Use the newly selected model', { sessionId: first.sessionId, model: next.model })
await connectStarted
const pendingThread = submittedSnapshot.sessions[0].threads[0]
assert.equal(dispatchedTurnId, '', 'the connection gate still holds prompt dispatch')
const pendingTurns = readAssistantSessionTurnUsage(submissionDb, first.sessionId)
assert.equal(pendingTurns.length, 2, 'the submitted model is durable before connection finishes')
assert.equal(pendingTurns[1].model, next.model)
assert.equal(pendingThread.messages.at(-1)?.turnId, pendingThread.latestTurn?.id, 'the pending message owns its reserved turn identity')
const pendingIndex = buildAssistantTurnUsageIndex(pendingThread.messages, pendingTurns, {
    sessionId: first.sessionId, threadId: thread.id, model: pendingThread.model, latestTurn: pendingThread.latestTurn!
})
const pendingMarkers = addAssistantConversationMarkers(pendingThread.messages.map(row), pendingIndex)
assert.equal(pendingMarkers.filter(row => row.kind === 'model-change').length, 1, 'source to SQLite to renderer shows the model switch while connection remains pending')
releaseConnect()
const submittedResult = await pendingSubmission
assert.equal(submittedResult.turnId, pendingThread.latestTurn?.id, 'dispatch keeps the already displayed turn ID')
assert.equal(readAssistantSessionTurnUsage(submissionDb, first.sessionId).length, 2, 'attachment does not create a duplicate turn')

const { ZyraRuntime } = await import('../src/main/assistant/zyra-runtime')
const runtimeEvents: any[] = []
let canonicalRequestTurnId = ''
const context = {
    model: next.model, localThreadId: thread.id, providerThreadId: 'canonical-submission',
    completedTurnIds: new Set(), toolArgsByCallId: new Map(), toolStartedAtByCallId: new Map(),
    assistantTextByItemId: new Map(), assistantCompletedItemIds: new Set(), internalTextByItemId: new Map(), internalCompletedItemIds: new Set()
}
const runtimeResult = await ZyraRuntime.prototype.sendPrompt.call({
    ensurePromptAvailable: async () => {}, requireSession: () => context,
    emitRuntime: (event: any) => runtimeEvents.push(event),
    runPromptTurn: async (_context: any, id: string) => { canonicalRequestTurnId = id }
} as any, thread.id, 'Tiny test prompt', { turnId: submittedResult.turnId, model: next.model })
assert.equal(runtimeResult.turnId, submittedResult.turnId)
assert.equal(runtimeEvents.find(event => event.type === 'turn.started')?.turnId, submittedResult.turnId)
assert.equal(canonicalRequestTurnId, submittedResult.turnId, 'the actual runtime carries the reserved ID into canonical prompt dispatch')

await assert.rejects(sendAssistantPromptAction({
    ensureReady: async () => {}, getSnapshot: () => submittedSnapshot,
    getFirstUserMessageText: async () => 'First prompt', getTitleGenerationModel: async () => null,
    getSessionRuntimeCwd: () => 'C:/workspace',
    appendEvent(type: any, occurredAt: string, payload: any, sessionId: string, threadId: string) {
        const event = { sequence: ++sequence, eventId: `submission-${sequence}`, type, occurredAt, payload, sessionId, threadId }
        submittedSnapshot = applyAssistantDomainEvent(submittedSnapshot, event)
        persistAssistantEvent(submissionDb, event, submittedSnapshot)
    },
    runtime: { hasSession: () => false, connect: async () => { throw new Error('Synthetic failed connection') } }
} as any, 'A failed connection', { sessionId: first.sessionId, model: first.model }), /Synthetic failed connection/)
assert.equal(submittedSnapshot.sessions[0].threads[0].latestTurn?.state, 'error', 'a failed connection settles its reserved turn instead of leaving permanent active work')
assert.equal(readAssistantSessionTurnUsage(submissionDb, first.sessionId).at(-1)?.state, 'error', 'failed submission state survives reopening')
const { interruptAssistantTurnAction } = await import('../src/main/assistant/service-session-actions')
let connectForCancel!: () => void
let finishCancelledConnect!: () => void
const cancellingConnectionStarted = new Promise<void>(resolve => { connectForCancel = resolve })
const cancelledConnectionGate = new Promise<void>(resolve => { finishCancelledConnect = resolve })
let cancelledPromptDispatches = 0
const cancelDeps = {
    ensureReady: async () => {}, getSnapshot: () => submittedSnapshot,
    getFirstUserMessageText: async () => 'First prompt', getTitleGenerationModel: async () => null,
    getSessionRuntimeCwd: () => 'C:/workspace',
    appendEvent(type: any, occurredAt: string, payload: any, sessionId: string, threadId: string) {
        const event = { sequence: ++sequence, eventId: `submission-${sequence}`, type, occurredAt, payload, sessionId, threadId }
        submittedSnapshot = applyAssistantDomainEvent(submittedSnapshot, event)
        persistAssistantEvent(submissionDb, event, submittedSnapshot)
    },
    runtime: {
        hasSession: () => false,
        connect: async () => { connectForCancel(); await cancelledConnectionGate },
        sendPrompt: async () => { cancelledPromptDispatches++; throw new Error('A stopped submission cannot dispatch') }
    }
}
const cancelledSend = sendAssistantPromptAction(cancelDeps as any, 'Stop this during connection', { sessionId: first.sessionId, model: next.model })
await cancellingConnectionStarted
await interruptAssistantTurnAction(cancelDeps as any, submittedSnapshot.sessions[0].threads[0].latestTurn!.id, first.sessionId)
assert.equal(submittedSnapshot.sessions[0].threads[0].latestTurn?.state, 'interrupted', 'Stop settles the submitted turn before connection finishes')
finishCancelledConnect()
await cancelledSend
assert.equal(cancelledPromptDispatches, 0, 'finishing the connection cannot dispatch a stopped turn')
const { createAssistantSessionAction } = await import('../src/main/assistant/service-session-actions')
let draftSnapshot = createDefaultAssistantSnapshot()
let preparationModel = ''
let preparationStarted!: () => void
let finishPreparation!: () => void
const preparing = new Promise<void>(resolve => { preparationStarted = resolve })
const preparationGate = new Promise<void>(resolve => { finishPreparation = resolve })
const createdDraft = await createAssistantSessionAction({
    ensureReady: async () => {}, getSnapshot: () => draftSnapshot,
    getNewChatExecutionDefaults: async () => ({ webSearch: true, webFetch: true }),
    getNewChatPreparationModel: async () => 'opencode-harness/openai/gpt-6.1-sol',
    getSessionRuntimeCwd: () => 'C:/workspace',
    appendEvent(type: any, occurredAt: string, payload: any, sessionId: string, threadId: string) {
        draftSnapshot = applyAssistantDomainEvent(draftSnapshot, {
            sequence: ++sequence, eventId: `draft-${sequence}`, type, occurredAt, payload, sessionId, threadId
        })
    },
    runtime: { prepareChatRuntime: async (model: string) => { preparationModel = model; preparationStarted(); await preparationGate } }
} as any)
await preparing
assert.equal(createdDraft.success, true, 'a pending transport cannot block creation or composing')
assert.equal(preparationModel, 'opencode-harness/openai/gpt-6.1-sol', 'an empty new thread prepares the saved composer model')
assert.equal(draftSnapshot.sessions[0].threads[0].model, '', 'preparation preserves the composer-owned model selection')
assert.equal(draftSnapshot.sessions[0].threads[0].latestTurn, null, 'preparing does not fabricate a model request')
finishPreparation()
const { connectAssistantSession } = await import('../src/main/assistant/service-session-actions')
let warmedModel = ''
const draftConnectionDeps = {
    ensureReady: async () => {}, getSnapshot: () => draftSnapshot,
    getNewChatPreparationModel: async () => 'opencode-harness/openai/gpt-6.1-sol',
    connectSessionRuntime: async (_session: any, preparedThread: any) => { warmedModel = preparedThread.model }
}
await connectAssistantSession(draftConnectionDeps as any)
assert.equal(warmedModel, 'opencode-harness/openai/gpt-6.1-sol', 'typing prepares the composer default rather than the engine fallback')
assert.equal(draftSnapshot.sessions[0].threads[0].model, '', 'draft attachment does not persist an unsubmitted model choice')
draftSnapshot.sessions[0].threads[0].model = next.model
await connectAssistantSession(draftConnectionDeps as any)
assert.equal(warmedModel, next.model, 'an existing selected model takes priority over new-chat defaults')
submissionDb.close()
console.log('Conversation markers: saved turn models, legacy matching, inactivity, collapse, virtual identity, real SQLite history, dates and markup passed.')
