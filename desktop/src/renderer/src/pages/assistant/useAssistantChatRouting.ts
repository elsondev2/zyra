import { useEffect, useMemo, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import type { AssistantSession } from '@shared/assistant/contracts'
import { buildAssistantChatRoute, parseAssistantChatRoute, type AssistantChatRouteTarget } from './assistant-chat-route'

type AssistantChatRoutingInput = {
    bootstrapped: boolean
    commandPending: boolean
    sessions: AssistantSession[]
    selectedSessionId: string | null
    activeThreadId: string | null
    selectSession: (sessionId: string) => Promise<void>
    selectThread: (input: { sessionId: string; threadId: string }) => Promise<void>
}

type PendingRouteSelection = {
    sessionId: string
    threadId: string | null
}

function selectionKey(sessionId: string | null, threadId: string | null): string {
    return `${sessionId || ''}:${threadId || ''}`
}

function routeMatchesSelection(
    pending: PendingRouteSelection,
    sessionId: string | null,
    threadId: string | null
): boolean {
    return pending.sessionId === sessionId && (!pending.threadId || pending.threadId === threadId)
}

export function useAssistantChatRouting(input: AssistantChatRoutingInput): void {
    const location = useLocation()
    const navigate = useNavigate()
    const initializedRef = useRef(false)
    const previousPathRef = useRef(location.pathname)
    const previousSelectionRef = useRef(selectionKey(input.selectedSessionId, input.activeThreadId))
    const pendingRouteSelectionRef = useRef<PendingRouteSelection | null>(null)
    const canonicalSelectionPath = useMemo(() => (
        input.selectedSessionId
            ? buildAssistantChatRoute(input.selectedSessionId, input.activeThreadId)
            : '/assistant'
    ), [input.activeThreadId, input.selectedSessionId])

    useEffect(() => {
        const currentSelectionKey = selectionKey(input.selectedSessionId, input.activeThreadId)
        const pathChanged = previousPathRef.current !== location.pathname
        const selectionChanged = previousSelectionRef.current !== currentSelectionKey
        previousPathRef.current = location.pathname
        previousSelectionRef.current = currentSelectionKey

        if (!input.bootstrapped) return

        const route = parseAssistantChatRoute(location.pathname)
        if (route.kind === 'reserved' || route.kind === 'outside-assistant') {
            pendingRouteSelectionRef.current = null
            initializedRef.current = true
            return
        }

        const replaceWithCurrentSelection = () => {
            pendingRouteSelectionRef.current = null
            if (location.pathname !== canonicalSelectionPath) {
                navigate(canonicalSelectionPath, { replace: true })
            }
        }

        const applyRouteSelection = (target: AssistantChatRouteTarget) => {
            if (target.kind === 'assistant-root' || target.kind === 'invalid-chat') {
                replaceWithCurrentSelection()
                return
            }
            if (target.kind !== 'chat') return

            const session = input.sessions.find((entry) => entry.id === target.sessionId) || null
            if (!session) {
                replaceWithCurrentSelection()
                return
            }
            const targetThread = target.threadId
                ? session.threads.find((entry) => entry.id === target.threadId) || null
                : null
            if (target.threadId && !targetThread) {
                const fallbackPath = buildAssistantChatRoute(session.id, session.activeThreadId)
                pendingRouteSelectionRef.current = null
                if (location.pathname !== fallbackPath) navigate(fallbackPath, { replace: true })
                return
            }

            const pending: PendingRouteSelection = {
                sessionId: session.id,
                threadId: targetThread?.id || null
            }
            if (routeMatchesSelection(pending, input.selectedSessionId, input.activeThreadId)) {
                pendingRouteSelectionRef.current = null
                const canonicalPath = buildAssistantChatRoute(session.id, targetThread?.id || session.activeThreadId)
                if (location.pathname !== canonicalPath) navigate(canonicalPath, { replace: true })
                return
            }

            pendingRouteSelectionRef.current = pending
            if (targetThread) {
                void input.selectThread({ sessionId: session.id, threadId: targetThread.id })
            } else {
                void input.selectSession(session.id)
            }
        }

        if (!initializedRef.current) {
            initializedRef.current = true
            applyRouteSelection(route)
            return
        }
        if (pathChanged) {
            applyRouteSelection(route)
            return
        }

        const pending = pendingRouteSelectionRef.current
        if (pending) {
            if (routeMatchesSelection(pending, input.selectedSessionId, input.activeThreadId)) {
                pendingRouteSelectionRef.current = null
                if (location.pathname !== canonicalSelectionPath) {
                    navigate(canonicalSelectionPath, { replace: true })
                }
                return
            }
            if (!input.commandPending) replaceWithCurrentSelection()
            return
        }

        if (selectionChanged && location.pathname !== canonicalSelectionPath) {
            navigate(canonicalSelectionPath)
        }
    }, [
        canonicalSelectionPath,
        input.activeThreadId,
        input.bootstrapped,
        input.commandPending,
        input.selectSession,
        input.selectThread,
        input.selectedSessionId,
        input.sessions,
        location.pathname,
        navigate
    ])
}
