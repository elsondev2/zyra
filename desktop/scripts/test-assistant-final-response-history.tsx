import assert from 'node:assert/strict'
import { mock } from 'bun:test'
import initSqlJs from 'sql.js/dist/sql-asm.js'
import { createAssistantThread } from '../src/main/assistant/service-state'
import { createAssistantSessionRecord, createRunningLatestTurn } from '../src/main/assistant/service-records'
import { createDefaultAssistantSnapshot, applyAssistantDomainEvent } from '../src/shared/assistant/projector'
import type { AssistantMessage, AssistantSnapshot } from '../src/shared/assistant/contracts'
import { initializeAssistantPersistenceSchema } from '../src/main/assistant/persistence-utils'
import { replaceAssistantSnapshot } from '../src/main/assistant/persistence-write'
import { readAssistantThreadDetail } from '../src/main/assistant/persistence-history'
import { hydrateFocusedSessionSnapshot, toAssistantShellSnapshot } from '../src/main/assistant/persistence-snapshot'
import { applyAssistantThreadDetail, mergeAssistantShellSnapshot } from '../src/renderer/src/lib/assistant/assistant-history-state'
import { buildTimelineRows, getTimelineEntries } from '../src/renderer/src/pages/assistant/assistant-timeline-helpers'
import { groupTimelineRowsIntoWorkSummaries } from '../src/renderer/src/pages/assistant/assistant-turn-work'
import { preserveAssistantMessagePhases } from '../src/shared/assistant/message-phase'

const noop = () => undefined
mock.module('electron-log', () => ({ default: { info: noop, warn: noop, error: noop, debug: noop } }))
mock.module('electron', () => ({ app: { getPath: () => process.env.TEMP || process.cwd(), isReady: () => true, on: noop, once: noop },
    BrowserWindow: class { static getAllWindows() { return [] } }, screen: { getAllDisplays: () => [] },
    globalShortcut: { register: () => true, unregister: noop, unregisterAll: noop }, shell: { openExternal: async () => {} },
    nativeImage: { createFromBuffer: () => ({ isEmpty: () => true }) }, webContents: { fromId: () => null }, safeStorage: { isEncryptionAvailable: () => false } }))
const { AssistantService, projectCanonicalTimeline } = await import('../src/main/assistant/service')
const at = '2026-10-06T10:00:00.000Z'
const failures: string[] = []
const check = (label: string, verify: () => void) => { try { verify() } catch (error) { failures.push(`${label}: ${String(error)}`) } }
const signature = JSON.stringify({ v: 1, id: 'history-final', phase: 'final_answer' })
const projection = projectCanonicalTimeline([
    { type: 'message', id: 'entry-user', timestamp: at, message: { id: 'history-user', role: 'user', content: [{ type: 'text', text: 'Fix it' }] } },
    { type: 'message', id: 'entry-final', timestamp: at, message: { id: 'history-final', role: 'assistant', content: [{ type: 'text', text: 'The final answer', textSignature: signature }] } }
], 'canonical-phase-chat', 'canonical-phase-chat', at, 0)
check('canonical projection', () => assert.equal(projection.messages.find(message => message.role === 'assistant')?.phase, 'final_answer', 'canonical textSignature phase survives message projection'))
const legacyProjection = projectCanonicalTimeline([{ type: 'message', id: 'legacy-phase', timestamp: at,
    message: { id: 'legacy-phase', role: 'assistant', content: [{ type: 'text', text: 'A literal final_answer marker.', textSignature: JSON.stringify({ v: 2, id: 'legacy-phase', phase: 'final_answer' }) }] } }], 'legacy-chat', 'legacy-chat', at, 0)
assert.equal(legacyProjection.messages[0]?.phase, undefined, 'unsupported signatures and visible tags cannot invent phase')

const thread = createAssistantThread(at)
thread.state = 'running'
thread.latestTurn = { ...createRunningLatestTurn('history-phase-turn', at), assistantMessageId: 'assistant-message-history-final' }
thread.messages = [
    { id: 'history-user', role: 'user', text: 'Fix it', turnId: thread.latestTurn.id, streaming: false, createdAt: at, updatedAt: at },
    { id: 'assistant-message-history-final', role: 'assistant', text: 'The final answer', turnId: thread.latestTurn.id, streaming: true, phase: 'final_answer', createdAt: '2026-10-06T10:00:02.000Z', updatedAt: at }
]
thread.activities = [{ id: 'history-action', kind: 'command', tone: 'tool', summary: 'Checking', turnId: thread.latestTurn.id, createdAt: '2026-10-06T10:00:01.000Z', payload: { status: 'running' } }]
const session = createAssistantSessionRecord({ sessionId: 'history-phase-session', title: 'History phase', projectPath: null, thread, createdAt: at })
const snapshot: AssistantSnapshot = { ...createDefaultAssistantSnapshot(), selectedSessionId: session.id, sessions: [session] }
const withoutPhase = (message: AssistantMessage) => { const { phase, ...rest } = message; return rest }
const SQL = await initSqlJs()
const db = new SQL.Database()
initializeAssistantPersistenceSchema(db)
replaceAssistantSnapshot(db, snapshot)
const detail = readAssistantThreadDetail(db, thread.id)
db.close()
assert.equal(detail.history.messages.at(-1)?.phase, undefined, 'the real SQLite history reader omits phase; this fixture reproduces its actual shape')
const explicit = [{ ...thread.messages[1]!, phase: 'commentary' as const }]
assert.equal(preserveAssistantMessagePhases(thread.messages, explicit), explicit, 'explicit incoming provider phase remains authoritative')
const unrelated = [{ ...withoutPhase(thread.messages[1]!), id: 'another-message' }]
assert.equal(preserveAssistantMessagePhases(thread.messages, unrelated), unrelated, 'phase never crosses message identity')
const changedRole = [{ ...withoutPhase(thread.messages[1]!), role: 'user' as const }]
assert.equal(preserveAssistantMessagePhases(thread.messages, changedRole), changedRole, 'phase is only copied to assistant messages')
function assertFinalPhase(state: AssistantSnapshot, label: string) {
    check(label, () => {
    const hydrated = state.sessions[0]!.threads[0]!
    assert.equal(hydrated.messages.at(-1)?.phase, 'final_answer', `${label}: phase survives a phase-less history row`)
    assert.equal(hydrated.latestTurn?.state, 'running', `${label}: hydration never completes the turn`)
    const rows = groupTimelineRowsIntoWorkSummaries({ rows: buildTimelineRows(getTimelineEntries(hydrated.messages, hydrated.activities), true, at), messages: hydrated.messages,
        isWorking: true, latestTurnStartedAt: at, latestAssistantMessageId: hydrated.latestTurn!.assistantMessageId })
    assert.ok(rows.some(row => row.kind === 'turn-work-summary' && row.running && row.terminalResponseVisible), `${label}: Work remains visually collapsed during final streaming`)
    })
}
assertFinalPhase(hydrateFocusedSessionSnapshot(snapshot, session.id, { ...detail, ...detail.history }), 'main selection hydration')
const patched = applyAssistantDomainEvent(snapshot, { eventId: 'canonical-phase-refresh', sequence: 1, type: 'thread.updated', occurredAt: at,
    sessionId: session.id, threadId: thread.id, payload: { threadId: thread.id, patch: { messages: detail.history.messages } } })
assertFinalPhase(patched, 'canonical thread update')
const hydrated = applyAssistantThreadDetail(snapshot, detail)
assertFinalPhase(hydrated.snapshot, 'renderer detail bootstrap')
const shell = toAssistantShellSnapshot(hydrated.snapshot)
const away = mergeAssistantShellSnapshot(hydrated.snapshot, { ...shell, selectedSessionId: null })
const back = mergeAssistantShellSnapshot(away, shell)
assertFinalPhase(applyAssistantThreadDetail(back, detail, hydrated.history).snapshot, 'navigation away and back')
const dematerialized = { ...snapshot, sessions: [{ ...session, threads: [{ ...thread, messages: [] }] }] }
assertFinalPhase(applyAssistantThreadDetail(dematerialized, detail, hydrated.history).snapshot, 'retained history fallback')
for (const text of ['', 'The final answer grows']) {
    const live = { ...snapshot, sessions: [{ ...session, threads: [{ ...thread, messages: [thread.messages[0]!, { ...thread.messages[1]!, text }] }] }] }
    const emptyDetail = { ...detail, history: { ...detail.history, messages: live.sessions[0]!.threads[0]!.messages.map(withoutPhase) } }
    assertFinalPhase(applyAssistantThreadDetail(live, emptyDetail).snapshot, `phase onset ${JSON.stringify(text)}`)
}

// Exercise the actual API boundary for a new renderer with no retained rows.
const apiResult = await AssistantService.prototype.getThreadDetailBootstrap.call({ ensureReady: async () => {}, state: { snapshot },
    ensureCanonicalHistoryLoaded: async () => {}, persistence: { readThreadDetail: async () => structuredClone(detail) } } as never, thread.id)
check('detail API', () => assert.equal(apiResult.detail.history.messages.at(-1)?.phase, 'final_answer', 'detail API carries main resident phase to a fresh renderer'))
assert.equal(thread.messages.at(-1)?.phase, 'final_answer', 'history reconciliation never mutates the source message')
assert.equal(detail.history.messages.at(-1)?.phase, undefined, 'phase-less persisted input remains immutable')
assert.equal(failures.length, 0, failures.join('\n\n'))
console.log('Final phase history: canonical signature, selection/bootstrap, refresh, navigation, retained rows and empty onset preserve collapse without completing the turn: ok')
process.exit(0)
