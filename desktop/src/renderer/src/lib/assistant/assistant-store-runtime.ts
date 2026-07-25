import type { AssistantCreateSessionInput, AssistantRuntimeStatus, AssistantSnapshot } from '@shared/assistant/contracts'
import type { AssistantHistoryByThreadId } from './assistant-history-state'

export type AssistantStoreState = {
    snapshot: AssistantSnapshot
    historyByThreadId: AssistantHistoryByThreadId
    status: AssistantRuntimeStatus
    hydrating: boolean
    hydrated: boolean
    modelsLoading: boolean
    commandPending: boolean
    pendingCreateSessionInput: AssistantCreateSessionInput | null
    selectionHydrationKey: string | null
    selectionTransitionKey: string | null
    selectionRequestId: number
    selectionRequestSessionId: string | null
    error: string | null
}

export const INITIAL_ASSISTANT_RUNTIME_STATUS: AssistantRuntimeStatus = {
    available: false,
    connected: false,
    selectedSessionId: null,
    activeThreadId: null,
    state: 'disconnected',
    reason: null
}

export function deriveAssistantRuntimeStatus(
    snapshot: AssistantSnapshot,
    currentStatus: AssistantRuntimeStatus
): AssistantRuntimeStatus {
    const selectedSession = snapshot.sessions.find((session) => session.id === snapshot.selectedSessionId) || null
    const activeThread = selectedSession?.threads.find((thread) => thread.id === selectedSession.activeThreadId) || null
    const threadState = activeThread?.state || 'disconnected'
    const connectedState = threadState === 'idle'
        || threadState === 'ready'
        || threadState === 'running'
        || threadState === 'waiting'

    const statusMatchesSelection = Boolean(
        selectedSession
        && activeThread
        && currentStatus.selectedSessionId === selectedSession.id
        && currentStatus.activeThreadId === activeThread.id
    )

    return {
        ...currentStatus,
        selectedSessionId: selectedSession?.id || null,
        activeThreadId: activeThread?.id || null,
        state: threadState,
        connected: Boolean(currentStatus.connected && statusMatchesSelection && connectedState)
    }
}
