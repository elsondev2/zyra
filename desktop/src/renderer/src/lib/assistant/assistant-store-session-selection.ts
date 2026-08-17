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
    getState: () => AssistantStoreState
    setState: SetAssistantStoreState
    requestSessionHydration: (sessionId: string, threadId: string | null) => Promise<void>
}

const SELECTION_PAINT_FALLBACK_MS = 80

function waitForSelectionShellPaint(): Promise<void> {
    if (typeof window === 'undefined' || typeof window.requestAnimationFrame !== 'function') {
        return new Promise((resolve) => setTimeout(resolve, 0))
    }

    return new Promise((resolve) => {
        let settled = false
        const finish = () => {
            if (settled) return
            settled = true
            window.clearTimeout(fallbackTimer)
            resolve()
        }
        const fallbackTimer = window.setTimeout(finish, SELECTION_PAINT_FALLBACK_MS)
        window.requestAnimationFrame(() => {
            window.requestAnimationFrame(finish)
        })
    })
}

export async function selectAssistantStoreSession(
    context: AssistantStoreSessionSelectionContext,
    sessionId: string,
    options?: { force?: boolean }
) {
    const force = options?.force === true
    if (!force && context.state.snapshot.selectedSessionId === sessionId && !context.state.selectionRequestSessionId) {
        return { success: true as const, snapshot: context.state.snapshot }
    }

    const selectedSession = context.state.snapshot.sessions.find((session) => session.id === sessionId) || null
    if (!selectedSession) return { success: false as const, error: 'Assistant session not found.' }

    const previousSessionId = context.state.snapshot.selectedSessionId
    const targetThreadId = selectedSession.activeThreadId || null
    const targetThread = selectedSession.threads.find((thread) => thread.id === targetThreadId) || null
    const transitionKey = `${sessionId}:${targetThreadId || ''}`
    const canHydrateFromCache = hasCachedSessionSelection(
        context.state.snapshot,
        sessionId,
        targetThreadId,
        context.hydratedThreadCache
    )
    let selectionRequestId = 0

    context.setState((current) => {
        selectionRequestId = current.selectionRequestId + 1
        const snapshot = applyCachedSessionSelection(
            current.snapshot,
            sessionId,
            targetThreadId,
            context.hydratedThreadCache
        )
        return {
            error: null,
            commandPending: !canHydrateFromCache,
            selectionRequestId,
            selectionRequestSessionId: sessionId,
            selectionTransitionKey: canHydrateFromCache ? null : transitionKey,
            snapshot,
            status: deriveAssistantRuntimeStatus(snapshot, current.status)
        }
    })

    if (!canHydrateFromCache) {
        void context.requestSessionHydration(sessionId, targetThreadId)
        await waitForSelectionShellPaint()
        if (context.getState().selectionRequestId !== selectionRequestId) {
            return { success: true as const, snapshot: context.getState().snapshot }
        }

        context.setState((current) => {
            if (current.selectionRequestId !== selectionRequestId) return {}
            const snapshot = applyCachedSessionSelection(
                current.snapshot,
                sessionId,
                targetThreadId,
                context.hydratedThreadCache
            )
            return {
                selectionTransitionKey: null,
                snapshot,
                status: deriveAssistantRuntimeStatus(snapshot, current.status)
            }
        })
    }

    if (canHydrateFromCache) {
        await Promise.resolve()
        if (context.getState().selectionRequestId !== selectionRequestId) {
            return { success: true as const, snapshot: context.getState().snapshot }
        }
    }

    const restorePreviousSelection = (message: string) => {
        context.setState((current) => {
            if (current.selectionRequestId !== selectionRequestId) return {}
            const canRestore = Boolean(
                previousSessionId
                && current.snapshot.sessions.some((session) => session.id === previousSessionId)
            )
            const snapshot = canRestore && current.snapshot.selectedSessionId === sessionId
                ? { ...current.snapshot, selectedSessionId: previousSessionId }
                : current.snapshot
            return {
                error: message,
                commandPending: false,
                selectionTransitionKey: null,
                selectionRequestSessionId: null,
                snapshot,
                status: deriveAssistantRuntimeStatus(snapshot, current.status)
            }
        })
    }

    try {
        const result = await window.devscope.assistant.selectSession(sessionId)
        if (context.getState().selectionRequestId !== selectionRequestId) return result
        if (!result.success) {
            restorePreviousSelection(result.error)
            return result
        }
        const snapshot = result.snapshot
        if (snapshot) {
            context.setState((current) => {
                if (current.selectionRequestId !== selectionRequestId) return {}
                return {
                    snapshot,
                    status: deriveAssistantRuntimeStatus(snapshot, current.status)
                }
            })
        } else {
            void context.requestSessionHydration(sessionId, targetThreadId)
        }

        return result
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Assistant command failed.'
        restorePreviousSelection(message)
        return { success: false as const, error: message }
    } finally {
        context.setState((current) => (
            current.selectionRequestId === selectionRequestId
                ? {
                    commandPending: false,
                    selectionTransitionKey: null,
                    selectionRequestSessionId: null
                }
                : {}
        ))
    }
}
