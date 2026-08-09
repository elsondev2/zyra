import type { AssistantSnapshot } from '@shared/assistant/contracts'

/**
 * Session/thread selection is renderer navigation state. Domain events still
 * update the shared catalog, but another connected client must not replace the
 * route this renderer is displaying.
 */
export function preserveAssistantClientRoute(
    previous: AssistantSnapshot,
    projected: AssistantSnapshot,
    requestedSessionId: string | null
): AssistantSnapshot {
    const clientSessionId = requestedSessionId || previous.selectedSessionId
    if (!clientSessionId) return projected

    const projectedSessionIndex = projected.sessions.findIndex((session) => session.id === clientSessionId)
    if (projectedSessionIndex < 0) return projected

    const previousSession = previous.sessions.find((session) => session.id === clientSessionId) || null
    const previousThreadId = previousSession?.activeThreadId || null
    const projectedSession = projected.sessions[projectedSessionIndex]
    const canPreserveThread = Boolean(
        previousThreadId
        && projectedSession.threads.some((thread) => thread.id === previousThreadId)
    )
    const nextThreadId = canPreserveThread ? previousThreadId : projectedSession.activeThreadId

    if (
        projected.selectedSessionId === clientSessionId
        && projectedSession.activeThreadId === nextThreadId
    ) return projected

    const sessions = projectedSession.activeThreadId === nextThreadId
        ? projected.sessions
        : projected.sessions.map((session, index) => (
            index === projectedSessionIndex
                ? { ...session, activeThreadId: nextThreadId }
                : session
        ))

    return {
        ...projected,
        selectedSessionId: clientSessionId,
        sessions
    }
}
