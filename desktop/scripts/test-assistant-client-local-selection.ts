import assert from 'node:assert/strict'
import { applyAssistantDomainEvent, createDefaultAssistantSnapshot } from '../src/shared/assistant/projector'
import { preserveAssistantClientRoute } from '../src/renderer/src/lib/assistant/assistant-client-route'

const now = new Date().toISOString()
const session = (id: string, title: string) => ({
    id,
    title,
    mode: 'work',
    projectPath: null,
    playgroundLabId: null,
    pendingLabRequest: null,
    archived: false,
    createdAt: now,
    updatedAt: now,
    activeThreadId: null,
    threadIds: [],
    threads: []
})
const sessionA = session('session-a', 'A')
const sessionB = session('session-b', 'B')

const selectedA = {
    ...createDefaultAssistantSnapshot(),
    selectedSessionId: sessionA.id,
    sessions: [sessionA, sessionB]
} as any

const remoteSelection = preserveAssistantClientRoute(selectedA, applyAssistantDomainEvent(selectedA, {
    eventId: 'event-select-b',
    sequence: 1,
    occurredAt: new Date().toISOString(),
    type: 'session.selected',
    payload: { sessionId: sessionB.id }
} as any), null)
assert.equal(remoteSelection.selectedSessionId, sessionA.id, 'another client selecting a chat must not replace this client\'s routed chat')

const remoteCreation = preserveAssistantClientRoute(remoteSelection, applyAssistantDomainEvent(remoteSelection, {
    eventId: 'event-create-c',
    sequence: 2,
    occurredAt: new Date().toISOString(),
    type: 'session.created',
    payload: {
        session: session('session-c', 'C')
    }
} as any), null)
assert.equal(remoteCreation.selectedSessionId, sessionA.id, 'another client creating a chat must preserve this client\'s selection')
assert.equal(remoteCreation.sessions.some((session: any) => session.id === 'session-c'), true, 'the shared session catalog must still receive the created chat')

const threadedA = {
    ...selectedA,
    sessions: [{
        ...sessionA,
        activeThreadId: 'thread-a',
        threadIds: ['thread-a', 'thread-b'],
        threads: [{ id: 'thread-a', updatedAt: now }, { id: 'thread-b', updatedAt: now }]
    }, sessionB]
} as any
const remoteThreadSelection = preserveAssistantClientRoute(threadedA, applyAssistantDomainEvent(threadedA, {
    eventId: 'event-select-thread-b',
    sequence: 1,
    occurredAt: now,
    type: 'session.updated',
    payload: { sessionId: sessionA.id, patch: { activeThreadId: 'thread-b' } }
} as any), null)
assert.equal(remoteThreadSelection.sessions.find((entry: any) => entry.id === sessionA.id)?.activeThreadId, 'thread-a', 'another client selecting a thread must not replace this client\'s thread route')

const firstCreation = applyAssistantDomainEvent(createDefaultAssistantSnapshot(), {
    eventId: 'event-create-first',
    sequence: 1,
    occurredAt: new Date().toISOString(),
    type: 'session.created',
    payload: {
        session: session('session-first', 'First')
    }
} as any)
assert.equal(firstCreation.selectedSessionId, 'session-first', 'the first available chat should seed an otherwise empty client selection')

const authoritativeSession = {
    ...session('session-race', 'General greeting'),
    projectPath: 'C:/workspace',
    updatedAt: new Date(Date.now() + 1_000).toISOString()
}
const authoritativeSnapshot = {
    ...createDefaultAssistantSnapshot(),
    snapshotSequence: 10,
    selectedSessionId: authoritativeSession.id,
    sessions: [authoritativeSession]
} as any
const staleCreateEvent = {
    eventId: 'event-create-race',
    sequence: 10,
    occurredAt: now,
    type: 'session.created',
    payload: { session: session(authoritativeSession.id, 'New Session') }
} as any
const afterStaleReplay = applyAssistantDomainEvent(authoritativeSnapshot, staleCreateEvent)
assert.equal(afterStaleReplay.sessions.length, 1, 'a create event already represented by a refreshed snapshot must not duplicate the chat')
assert.equal(afterStaleReplay.sessions[0]?.title, 'General greeting', 'a stale create replay must not replace the authoritative generated title')

const afterDuplicateCreation = applyAssistantDomainEvent(authoritativeSnapshot, {
    ...staleCreateEvent,
    eventId: 'event-create-race-new-sequence',
    sequence: 11
})
assert.equal(afterDuplicateCreation.sessions.length, 1, 'session creation remains idempotent even if a replay is assigned a newer sequence')
assert.equal(afterDuplicateCreation.sessions[0]?.title, 'General greeting', 'a duplicate create never regresses an existing session shell')

console.log('Assistant client-local selection: ok')
