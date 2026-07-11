import type { AssistantSnapshot } from '../../shared/assistant/contracts'
import { applyAssistantDomainEvent, createDefaultAssistantSnapshot } from '../../shared/assistant/projector'
import {
    clearResolvedApprovals,
    deriveSessionTitleFromPrompt,
    isDefaultSessionTitle,
    clearResolvedUserInputs,
    nowIso,
    runtimeStateAfterRestore,
    settleRunningTurn,
    sortThreadsNewestFirst
} from './utils'

function cloneSnapshot(snapshot: AssistantSnapshot): AssistantSnapshot {
    return JSON.parse(JSON.stringify(snapshot)) as AssistantSnapshot
}

export function createDefaultSnapshot(): AssistantSnapshot {
    return createDefaultAssistantSnapshot()
}

export const applyDomainEvent = applyAssistantDomainEvent

export function recoverPersistedSnapshot(snapshot: AssistantSnapshot): AssistantSnapshot {
    const recovered = cloneSnapshot(snapshot)
    const recoveredAt = nowIso()

    recovered.playground = {
        rootPath: recovered.playground?.rootPath || null,
        labs: Array.isArray(recovered.playground?.labs) ? recovered.playground.labs : []
    }

    for (const session of recovered.sessions) {
        session.mode = 'work'
        if (isDefaultSessionTitle(session.title)) {
            const firstUserMessage = session.threads
                .flatMap((thread) => thread.messages || [])
                .find((message) => message.role === 'user' && String(message.text || '').trim().length > 0)
            session.title = firstUserMessage
                ? deriveSessionTitleFromPrompt(firstUserMessage.text)
                : 'New Session'
        }
        session.updatedAt = session.updatedAt || recoveredAt
        session.playgroundLabId = null
        session.pendingLabRequest = null
        session.threadIds = sortThreadsNewestFirst(session.threadIds || [], session.threads || [])
        if (!session.threadIds.includes(session.activeThreadId || '')) {
            session.activeThreadId = session.threadIds[0] || null
        }
        for (const thread of session.threads) {
            thread.messageCount = Number.isFinite(thread.messageCount) ? thread.messageCount : (thread.messages?.length || 0)
            thread.lastSeenCompletedTurnId = thread.lastSeenCompletedTurnId || null
            thread.state = runtimeStateAfterRestore(thread.state)
            thread.pendingApprovals = clearResolvedApprovals(thread.pendingApprovals || [])
            thread.pendingUserInputs = clearResolvedUserInputs(thread.pendingUserInputs || [])
            thread.latestTurn = settleRunningTurn(thread.latestTurn, recoveredAt)
        }
    }

    if (recovered.selectedSessionId && !recovered.sessions.some((session) => session.id === recovered.selectedSessionId)) {
        recovered.selectedSessionId = recovered.sessions[0]?.id || null
    }

    return recovered
}
