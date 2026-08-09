import { useCallback, useEffect, useRef, useState } from 'react'
import type { AgentRunState, AgentTranscriptPage } from '@shared/assistant/contracts'
import { mergeAssistantAgentTranscriptPages } from './assistant-agent-presentation'

type TranscriptLoadState = {
    agentRunId: string | null
    page: AgentTranscriptPage | null
    loading: boolean
    error: string | null
}

function readTranscriptPage(result: Record<string, unknown>): AgentTranscriptPage {
    const candidate = result['page'] && typeof result['page'] === 'object'
        ? result['page']
        : result
    if (!candidate || typeof candidate !== 'object' || !Array.isArray((candidate as Record<string, unknown>)['entries'])) {
        throw new Error('The agent transcript response was incomplete.')
    }
    return candidate as unknown as AgentTranscriptPage
}

function errorMessage(error: unknown): string {
    return error instanceof Error && error.message
        ? error.message
        : 'Could not load this agent transcript.'
}

export function useAssistantAgentTranscript(
    threadId: string | null,
    run: AgentRunState | null
): TranscriptLoadState & { loadOlder: () => Promise<void>; retry: () => void } {
    const requestSequenceRef = useRef(0)
    const [revision, setRevision] = useState(0)
    const [state, setState] = useState<TranscriptLoadState>({
        agentRunId: null,
        page: null,
        loading: false,
        error: null
    })
    const agentRunId = run?.agentRunId || null
    const sessionFile = run?.sessionFile || null
    const shouldLoad = Boolean(threadId && agentRunId && sessionFile)
    const activeState = state.agentRunId === agentRunId
        ? state
        : { agentRunId, page: null, loading: shouldLoad, error: null }

    useEffect(() => {
        const requestId = ++requestSequenceRef.current
        let cancelled = false
        if (!threadId || !agentRunId || !sessionFile) {
            setState({ agentRunId, page: null, loading: false, error: null })
            return () => { cancelled = true }
        }

        setState({ agentRunId, page: null, loading: true, error: null })
        void window.devscope.assistant.agentAction({
            threadId,
            action: 'transcript',
            payload: { agentRunId, limit: 30 }
        }).then((response) => {
            if (cancelled || requestSequenceRef.current !== requestId) return
            if (!response.success) {
                setState({ agentRunId, page: null, loading: false, error: response.error })
                return
            }
            setState({ agentRunId, page: readTranscriptPage(response.result), loading: false, error: null })
        }).catch((error) => {
            if (!cancelled && requestSequenceRef.current === requestId) {
                setState({ agentRunId, page: null, loading: false, error: errorMessage(error) })
            }
        })

        return () => { cancelled = true }
    }, [agentRunId, revision, sessionFile, threadId])

    useEffect(() => () => {
        requestSequenceRef.current += 1
    }, [])

    const loadOlder = useCallback(async () => {
        const currentPage = activeState.page
        if (!threadId || !agentRunId || !currentPage || currentPage.nextBefore == null || activeState.loading) return
        const requestId = ++requestSequenceRef.current
        setState((current) => current.agentRunId === agentRunId
            ? { ...current, loading: true, error: null }
            : current)
        try {
            const response = await window.devscope.assistant.agentAction({
                threadId,
                action: 'transcript',
                payload: { agentRunId, limit: 30, before: currentPage.nextBefore }
            })
            if (requestSequenceRef.current !== requestId) return
            if (!response.success) {
                setState((current) => current.agentRunId === agentRunId
                    ? { ...current, loading: false, error: response.error }
                    : current)
                return
            }
            const olderPage = readTranscriptPage(response.result)
            setState((current) => current.agentRunId === agentRunId && current.page
                ? {
                    agentRunId,
                    page: mergeAssistantAgentTranscriptPages(current.page, olderPage),
                    loading: false,
                    error: null
                }
                : current)
        } catch (error) {
            if (requestSequenceRef.current === requestId) {
                setState((current) => current.agentRunId === agentRunId
                    ? { ...current, loading: false, error: errorMessage(error) }
                    : current)
            }
        }
    }, [activeState.loading, activeState.page, agentRunId, threadId])

    const retry = useCallback(() => setRevision((current) => current + 1), [])

    return { ...activeState, loadOlder, retry }
}
