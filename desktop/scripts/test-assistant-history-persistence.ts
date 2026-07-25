import assert from 'node:assert/strict'
import initSqlJs from 'sql.js/dist/sql-asm.js'
import type { AssistantActivity, AssistantDomainEvent, AssistantMessage, AssistantSession, AssistantThread } from '../src/shared/assistant/contracts'
import { initializeAssistantPersistenceSchema } from '../src/main/assistant/persistence-utils'
import { persistAssistantEvent, replaceAssistantSnapshot } from '../src/main/assistant/persistence-write'
import { createDefaultSnapshot } from '../src/main/assistant/projector'
import { applyAssistantDomainEvent } from '../src/shared/assistant/projector'

const createdAt = '2026-07-15T12:00:00.000Z'
const oldMessage: AssistantMessage = {
    id: 'message-old',
    role: 'user',
    text: 'Keep this older prompt.',
    turnId: null,
    streaming: false,
    createdAt,
    updatedAt: createdAt
}
const currentMessage: AssistantMessage = {
    id: 'message-current',
    role: 'assistant',
    text: 'Keep this current response.',
    turnId: 'turn-current',
    streaming: false,
    createdAt: '2026-07-15T12:01:00.000Z',
    updatedAt: '2026-07-15T12:01:00.000Z'
}
const oldActivity: AssistantActivity = {
    id: 'activity-old',
    kind: 'command',
    tone: 'tool',
    summary: 'Older command',
    turnId: 'turn-old',
    createdAt
}
const currentActivity: AssistantActivity = {
    id: 'activity-current',
    kind: 'command',
    tone: 'tool',
    summary: 'Current command',
    turnId: 'turn-current',
    createdAt: '2026-07-15T12:01:00.000Z'
}

const thread: AssistantThread = {
    id: 'thread-history',
    providerThreadId: null,
    source: 'root',
    parentThreadId: null,
    providerParentThreadId: null,
    subagentDepth: null,
    agentNickname: null,
    agentRole: null,
    model: 'test-model',
    cwd: 'C:/project',
    messageCount: 2,
    lastSeenCompletedTurnId: null,
    runtimeMode: 'approval-required',
    interactionMode: 'default',
    state: 'ready',
    lastError: null,
    createdAt,
    updatedAt: currentMessage.updatedAt,
    latestTurn: null,
    activePlan: null,
    messages: [oldMessage, currentMessage],
    proposedPlans: [],
    activities: [oldActivity, currentActivity],
    pendingApprovals: [],
    pendingUserInputs: []
}
const session: AssistantSession = {
    id: 'session-history',
    title: 'History persistence test',
    mode: 'work',
    projectPath: 'C:/project',
    playgroundLabId: null,
    pendingLabRequest: null,
    archived: false,
    createdAt,
    updatedAt: currentMessage.updatedAt,
    activeThreadId: thread.id,
    threadIds: [thread.id],
    threads: [thread]
}
const snapshot = createDefaultSnapshot()
snapshot.selectedSessionId = session.id
snapshot.sessions = [session]

const SQL = await initSqlJs()
const db = new SQL.Database()
initializeAssistantPersistenceSchema(db)
replaceAssistantSnapshot(db, snapshot)

const partialThread: AssistantThread = {
    ...thread,
    messageCount: 1,
    messages: [currentMessage],
    activities: [currentActivity]
}
const partialSnapshot = {
    ...snapshot,
    snapshotSequence: snapshot.snapshotSequence + 1,
    sessions: [{ ...session, threads: [partialThread] }]
}
const partialEvent: AssistantDomainEvent = {
    sequence: 1,
    eventId: 'event-partial-history',
    type: 'thread.updated',
    occurredAt: currentMessage.updatedAt,
    sessionId: session.id,
    threadId: thread.id,
    payload: {
        threadId: thread.id,
        patch: {
            messages: partialThread.messages,
            activities: partialThread.activities
        }
    }
}
const projectedPartialSnapshot = applyAssistantDomainEvent(snapshot, partialEvent)
const projectedPartialThread = projectedPartialSnapshot.sessions[0]?.threads[0]
assert.equal(projectedPartialThread?.messages.length, 2, 'partial message patches must not erase older rows from live UI state')
assert.equal(projectedPartialThread?.activities.length, 2, 'partial activity patches must not erase older rows from live UI state')

persistAssistantEvent(db, partialEvent, partialSnapshot)

assert.equal(db.exec("SELECT COUNT(*) FROM assistant_messages WHERE thread_id = 'thread-history'")[0]?.values[0]?.[0], 2, 'partial message snapshots must not erase older persisted rows')
assert.equal(db.exec("SELECT COUNT(*) FROM assistant_activities WHERE thread_id = 'thread-history'")[0]?.values[0]?.[0], 2, 'partial activity snapshots must not erase older persisted rows')

const explicitDeleteEvent: AssistantDomainEvent = {
    ...partialEvent,
    sequence: 2,
    eventId: 'event-explicit-delete',
    payload: {
        ...partialEvent.payload,
        removedMessageIds: [oldMessage.id],
        removedActivityIds: [oldActivity.id]
    }
}
const projectedDeleteSnapshot = applyAssistantDomainEvent(projectedPartialSnapshot, explicitDeleteEvent)
const projectedDeleteThread = projectedDeleteSnapshot.sessions[0]?.threads[0]
assert.deepEqual(projectedDeleteThread?.messages.map((entry) => entry.id), [currentMessage.id], 'explicit deletion removes only the requested message from live UI state')
assert.deepEqual(projectedDeleteThread?.activities.map((entry) => entry.id), [currentActivity.id], 'explicit deletion removes only the requested activity from live UI state')

persistAssistantEvent(db, explicitDeleteEvent, partialSnapshot)

assert.deepEqual(db.exec("SELECT id FROM assistant_messages WHERE thread_id = 'thread-history' ORDER BY id")[0]?.values, [[currentMessage.id]], 'explicit deletion removes only the requested message row')
assert.deepEqual(db.exec("SELECT id FROM assistant_activities WHERE thread_id = 'thread-history' ORDER BY id")[0]?.values, [[currentActivity.id]], 'explicit deletion removes only the requested activity row')

const unloadedDeleteEvent: AssistantDomainEvent = {
    ...partialEvent,
    sequence: 3,
    eventId: 'event-unloaded-delete',
    payload: {
        threadId: thread.id,
        patch: { messageCount: 0, activityCount: 0, updatedAt: currentMessage.updatedAt },
        removedMessageIds: [currentMessage.id],
        removedActivityIds: [currentActivity.id]
    }
}
const projectedUnloadedDelete = applyAssistantDomainEvent(projectedDeleteSnapshot, unloadedDeleteEvent)
assert.equal(projectedUnloadedDelete.sessions[0]?.threads[0]?.messages.length, 0, 'exact removed IDs update loaded renderer rows without a complete replacement array')
persistAssistantEvent(db, unloadedDeleteEvent, partialSnapshot)
assert.equal(db.exec("SELECT COUNT(*) FROM assistant_messages WHERE thread_id = 'thread-history'")[0]?.values[0]?.[0], 0, 'persistence deletes unloaded messages from exact IDs without renderer history bodies')
assert.equal(db.exec("SELECT COUNT(*) FROM assistant_activities WHERE thread_id = 'thread-history'")[0]?.values[0]?.[0], 0, 'persistence deletes unloaded activities from exact IDs without renderer history bodies')

db.close()
console.log('Assistant history persistence contract: ok')
