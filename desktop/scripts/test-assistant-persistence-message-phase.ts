import assert from 'node:assert/strict'
import initSqlJs from 'sql.js/dist/sql-asm.js'
import type { AssistantMessage, AssistantSession, AssistantThread } from '../src/shared/assistant/contracts'
import { readAssistantHistoryPage } from '../src/main/assistant/persistence-history'
import { initializeAssistantPersistenceSchema } from '../src/main/assistant/persistence-utils'
import { readAssistantPersistenceRecord, readHydratedThreadDetails } from '../src/main/assistant/persistence-read'
import { replaceAssistantSnapshot } from '../src/main/assistant/persistence-write'
import { createDefaultSnapshot } from '../src/main/assistant/projector'

const createdAt = '2026-07-16T12:00:00.000Z'
const messages: AssistantMessage[] = [
    { id: 'user-phase', role: 'user', text: 'Question', turnId: 'turn-phase', streaming: false, timelineSequence: 1, createdAt, updatedAt: createdAt },
    { id: 'commentary-phase', role: 'assistant', text: 'Working through it.', turnId: 'turn-phase', streaming: false, phase: 'commentary', timelineSequence: 2, createdAt, updatedAt: createdAt },
    { id: 'final-phase', role: 'assistant', text: 'The answer.', turnId: 'turn-phase', streaming: false, phase: 'final_answer', timelineSequence: 3, createdAt, updatedAt: createdAt }
]
const thread: AssistantThread = {
    id: 'thread-phase', providerThreadId: null, source: 'root', parentThreadId: null, providerParentThreadId: null,
    subagentDepth: null, agentNickname: null, agentRole: null, model: 'test-model', cwd: 'C:/project',
    messageCount: messages.length, activityCount: 0, proposedPlanCount: 0, lastSeenCompletedTurnId: null,
    runtimeMode: 'approval-required', interactionMode: 'default', state: 'ready', lastError: null,
    createdAt, updatedAt: createdAt, latestTurn: null, hasPendingApprovals: false, hasPendingUserInputs: false,
    hasActivePlan: false, activePlan: null, messages, proposedPlans: [], activities: [], pendingApprovals: [], pendingUserInputs: []
}
const session: AssistantSession = {
    id: 'session-phase', title: 'Phase persistence', mode: 'work', projectPath: 'C:/project', playgroundLabId: null,
    pendingLabRequest: null, archived: false, createdAt, updatedAt: createdAt, activeThreadId: thread.id,
    threadIds: [thread.id], threads: [thread]
}
const snapshot = createDefaultSnapshot()
snapshot.selectedSessionId = session.id
snapshot.sessions = [session]

const SQL = await initSqlJs()
const firstProcessDb = new SQL.Database()
initializeAssistantPersistenceSchema(firstProcessDb)
replaceAssistantSnapshot(firstProcessDb, snapshot)
const persistedBytes = firstProcessDb.export()
firstProcessDb.close()

// Importing the exported SQLite file simulates process shutdown and a fresh process opening it.
const reopenedDb = new SQL.Database(persistedBytes)
initializeAssistantPersistenceSchema(reopenedDb)
const shell = readAssistantPersistenceRecord(reopenedDb).snapshot
const hydrated = readHydratedThreadDetails(reopenedDb, shell, session.id).get(thread.id)
assert.equal(hydrated?.messages.find(message => message.id === 'commentary-phase')?.phase, 'commentary')
assert.equal(hydrated?.messages.find(message => message.id === 'final-phase')?.phase, 'final_answer')

const page = readAssistantHistoryPage(reopenedDb, { threadId: thread.id, turnLimit: 1 })
assert.equal(page.messages.find(message => message.id === 'commentary-phase')?.phase, 'commentary', 'paginated reads retain commentary phase after reopen')
assert.equal(page.messages.find(message => message.id === 'final-phase')?.phase, 'final_answer', 'paginated reads retain final-answer phase after reopen')

reopenedDb.run(`INSERT INTO assistant_messages (id, thread_id, role, text, turn_id, streaming, timeline_sequence, created_at, updated_at)
    VALUES ('legacy-phase', ?, 'assistant', 'Legacy answer', 'legacy-turn', 0, 4, ?, ?)`, [thread.id, createdAt, createdAt])
const legacyMessage = readAssistantHistoryPage(reopenedDb, { threadId: thread.id, turnLimit: 1 }).messages.find(message => message.id === 'legacy-phase')
assert.ok(legacyMessage)
assert.equal(legacyMessage.phase, undefined, 'legacy message rows with NULL phase remain valid and phase-less')
reopenedDb.close()
console.log('Assistant persistence message phase contract: ok')
