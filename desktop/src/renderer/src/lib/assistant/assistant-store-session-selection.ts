import {
    applyCachedSessionSelection,
    hasCachedSessionSelection,
    type CachedHydratedThreadState
} from './session-hydration-cache'
import {
    deriveAssistantRuntimeStatus,
    type AssistantStoreState
} from './assistant-store-runtime'

type SetAssistantStoreState = (
    nextState:
        | Partial<AssistantStoreState>
        | ((current: AssistantStoreState) => Partial<AssistantStoreState>)
) => void

type AssistantStoreSessionSelectionContext = {
    state: AssistantStoreState
    hydratedThreadCache: Map<string, CachedHydratedThreadState>
    setState: SetAssistantStoreState
    requestSessionHydration: (sessionId: string, threadId: string | null) => Promise<void>
}

export async function selectAssistantStoreSession(
    context: AssistantStoreSessionSelectionContext,
    sessionId: string,
    options?: { force?: boolean }
) {
    const force = options?.force === true
    if (!force && context.state.snapshot.selectedSessionId === sessionId) {
        return { success: true as const, snapshot: context.state.snapshot }
    }

    const selectedSession = context.state.snapshot.sessions.find((session) => session.id === sessionId) || null
    const targetThreadId = selectedSession?.activeThreadId || null
    const canHydrateFromCache = hasCachedSessionSelection(
        context.state.snapshot,
        sessionId,
        targetThreadId,
        context.hydratedThreadCache
    )

    context.setState((current) => {
        const currentSession = current.snapshot.sessions.find((session) => session.id === sessionId) || null
        const snapshot = applyCachedSessionSelection(
            current.snapshot,
            sessionId,
            currentSession?.activeThreadId || null,
            context.hydratedThreadCache
        )
        return {
            error: null,
            commandPending: !canHydrateFromCache,
            snapshot,
            status: deriveAssistantRuntimeStatus(snapshot, current.status)
        }
    })

    try {
        const result = await window.devscope.assistant.selectSession(sessionId)
        if (!result.success) {
            context.setState({ error: result.error })
            return result
        }
        const snapshot = result.snapshot
        if (snapshot) {
            context.setState((current) => ({
                snapshot,
                status: deriveAssistantRuntimeStatus(snapshot, current.status)
            }))
        } else if (!canHydrateFromCache) {
            void context.requestSessionHydration(sessionId, targetThreadId)
        }
        return result
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Assistant command failed.'
        context.setState({ error: message })
        return { success: false as const, error: message }
    } finally {
        context.setState({ commandPending: false })
    }
}
