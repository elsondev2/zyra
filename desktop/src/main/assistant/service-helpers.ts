import { webContents } from 'electron'
import type {
    AssistantDomainEvent,
    AssistantEventStreamPayload,
    AssistantSession,
    AssistantSnapshot
} from '../../shared/assistant/contracts'
import { ASSISTANT_IPC } from '../../shared/assistant/contracts'
import { createAssistantSessionRecord } from './service-records'
import {
    createAssistantThread,
    getActiveThread,
    getSelectedSession,
    requireSession,
    requireThread
} from './service-state'
import { createAssistantId, nowIso } from './utils'

export function createAssistantDomainEvent(
    snapshotSequence: number,
    type: AssistantDomainEvent['type'],
    occurredAt: string,
    payload: Record<string, unknown>,
    sessionId?: string,
    threadId?: string
): AssistantDomainEvent {
    return {
        sequence: snapshotSequence + 1,
        eventId: createAssistantId('assistant-event'),
        type,
        occurredAt,
        ...(sessionId ? { sessionId } : {}),
        ...(threadId ? { threadId } : {}),
        payload
    }
}

export function trimAssistantEvents<T>(events: T[], maxCount: number): T[] {
    if (events.length <= maxCount) return events
    return events.slice(-maxCount)
}

export function broadcastAssistantPayload(subscribers: Set<number>, payload: AssistantEventStreamPayload): void {
    for (const senderId of [...subscribers]) {
        const target = webContents.fromId(senderId)
        if (!target || target.isDestroyed()) {
            subscribers.delete(senderId)
            continue
        }
        target.send(ASSISTANT_IPC.eventStream, payload)
    }
}

export function markActiveThreadCompletionSeen(
    session: AssistantSession,
    occurredAt: string,
    appendEvent: (
        type: AssistantDomainEvent['type'],
        occurredAt: string,
        payload: Record<string, unknown>,
        sessionId?: string,
        threadId?: string
    ) => void
): void {
    const thread = getActiveThread(session)
    if (!thread?.latestTurn || thread.latestTurn.state !== 'completed') return
    if (thread.lastSeenCompletedTurnId === thread.latestTurn.id) return

    appendEvent('thread.updated', occurredAt, {
        threadId: thread.id,
        patch: {
            lastSeenCompletedTurnId: thread.latestTurn.id,
            updatedAt: occurredAt
        }
    }, session.id, thread.id)
}

export function updateLatestTurnAssistantMessage(
    snapshot: AssistantSnapshot,
    sessionId: string,
    threadId: string,
    assistantMessageId: string,
    occurredAt: string,
    appendEvent: (
        type: AssistantDomainEvent['type'],
        occurredAt: string,
        payload: Record<string, unknown>,
        sessionId?: string,
        threadId?: string
    ) => void
): void {
    const thread = requireThread(snapshot, threadId)
    if (!thread.latestTurn) return
    if (thread.latestTurn.assistantMessageId === assistantMessageId) return
    appendEvent('thread.latest-turn.updated', occurredAt, {
        threadId,
        latestTurn: {
            ...thread.latestTurn,
            assistantMessageId
        }
    }, sessionId, threadId)
}

export function ensureAssistantSession(
    snapshot: AssistantSnapshot,
    appendEvent: (
        type: AssistantDomainEvent['type'],
        occurredAt: string,
        payload: Record<string, unknown>,
        sessionId?: string,
        threadId?: string
    ) => void
): AssistantSession {
    const selected = getSelectedSession(snapshot)
    if (selected) return selected

    const createdAt = nowIso()
    const thread = createAssistantThread(createdAt)
    const session = createAssistantSessionRecord({
        sessionId: createAssistantId('assistant-session'),
        title: 'New Session',
        projectPath: null,
        createdAt,
        thread
    })
    appendEvent('session.created', createdAt, { session }, session.id, thread.id)
    return requireSession(snapshot, session.id)
}
