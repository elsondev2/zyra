import { useCallback, useEffect, useRef, useState } from 'react'
import type { AgentRunState, AgentTranscriptPage } from '@shared/assistant/contracts'
import { mergeAssistantAgentTranscriptPages, mergeAssistantAgentTranscriptRefresh } from './assistant-agent-presentation'

const PAGE_SIZE = 30
const LIVE_TRANSCRIPT_REFRESH_MS = 1_000
const TERMINAL_TRANSCRIPT_REFRESH_DELAYS_MS = [250, 1_000]
const LIVE_AGENT_STATUSES = new Set<AgentRunState['status']>(['queued', 'starting', 'running', 'waiting', 'blocked', 'recovering'])
type TranscriptLoadState = { agentRunId: string | null; page: AgentTranscriptPage | null; loading: boolean; error: string | null }
function readTranscriptPage(result: Record<string, unknown>): AgentTranscriptPage {
    const candidate = result['page'] && typeof result['page'] === 'object' ? result['page'] : result
    if (!candidate || typeof candidate !== 'object' || !Array.isArray((candidate as Record<string, unknown>)['entries'])) {
        throw new Error('The agent transcript response was incomplete.')
    }
    return candidate as unknown as AgentTranscriptPage
}
function errorMessage(error: unknown): string {
    return error instanceof Error && error.message ? error.message : 'Could not load this agent transcript.'
}

export function useAssistantAgentTranscript(threadId: string | null, run: AgentRunState | null): TranscriptLoadState & {
    loadOlder: () => Promise<void>; loadNewer: () => Promise<void>; retry: () => void
} {
    const generationRef = useRef(0)
    const foregroundPendingRef = useRef(false)
    const [revision, setRevision] = useState(0)
    const [state, setState] = useState<TranscriptLoadState>({ agentRunId: null, page: null, loading: false, error: null })
    const stateRef = useRef(state)
    stateRef.current = state
    const agentRunId = run?.agentRunId || null
    const sessionFile = run?.sessionFile || null
    const shouldLoad = Boolean(threadId && agentRunId && sessionFile)
    const activeState = state.agentRunId === agentRunId ? state : { agentRunId, page: null, loading: shouldLoad, error: null }
    const hydrated = Boolean(activeState.page)

    useEffect(() => {
        const generation = ++generationRef.current
        foregroundPendingRef.current = true
        if (!threadId || !agentRunId || !sessionFile) {
            foregroundPendingRef.current = false
            setState({ agentRunId, page: null, loading: false, error: null })
            return
        }
        setState({ agentRunId, page: null, loading: true, error: null })
        void window.devscope.assistant.agentAction({ threadId, action: 'transcript', payload: { agentRunId, limit: PAGE_SIZE, after: -1 } })
            .then(response => {
                if (generationRef.current !== generation) return
                if (!response.success) throw new Error(response.error)
                setState({ agentRunId, page: readTranscriptPage(response.result), loading: false, error: null })
            }).catch(error => {
                if (generationRef.current === generation) setState({ agentRunId, page: null, loading: false, error: errorMessage(error) })
            }).finally(() => { if (generationRef.current === generation) foregroundPendingRef.current = false })
        return () => { if (generationRef.current === generation) generationRef.current += 1 }
    }, [agentRunId, revision, sessionFile, threadId])

    useEffect(() => {
        if (!threadId || !agentRunId || !sessionFile || !hydrated) return
        const generation = generationRef.current
        let cancelled = false
        let requestRunning = false
        const refreshLatest = async () => {
            const current = stateRef.current
            if (cancelled || requestRunning || foregroundPendingRef.current || current.agentRunId !== agentRunId || !current.page) return
            requestRunning = true
            const last = current.page.entries.at(-1)?.index ?? -1
            // Historical windows refresh in place. Only an already-loaded live end
            // can append new records; never jump across unloaded middle pages.
            const windowBounds = current.page.nextAfter != null
                ? { after: Math.max(-1, last - PAGE_SIZE), before: last + 1 }
                : { after: Math.max(-1, last - 1) }
            try {
                const response = await window.devscope.assistant.agentAction({ threadId, action: 'transcript', payload: { agentRunId, limit: PAGE_SIZE, ...windowBounds } })
                if (cancelled || generationRef.current !== generation || !response.success) return
                const latest = readTranscriptPage(response.result)
                setState(current => current.agentRunId === agentRunId && current.page
                    ? { ...current, page: mergeAssistantAgentTranscriptRefresh(current.page, latest) }
                    : current)
            } catch {
                // Background reads preserve both the last good page and foreground errors/loading.
            } finally { requestRunning = false }
        }
        const timeouts: number[] = []
        let interval: number | null = null
        if (run && LIVE_AGENT_STATUSES.has(run.status)) {
            interval = window.setInterval(() => void refreshLatest(), LIVE_TRANSCRIPT_REFRESH_MS)
        } else {
            for (const delay of TERMINAL_TRANSCRIPT_REFRESH_DELAYS_MS) timeouts.push(window.setTimeout(() => void refreshLatest(), delay))
        }
        return () => {
            cancelled = true
            if (interval !== null) window.clearInterval(interval)
            for (const timeout of timeouts) window.clearTimeout(timeout)
        }
    }, [agentRunId, hydrated, revision, run?.completedAt, run?.status, sessionFile, threadId])

    const loadPage = useCallback(async (direction: 'older' | 'newer') => {
        const current = stateRef.current
        const page = current.page
        const cursor = direction === 'older' ? page?.nextBefore : page?.nextAfter
        if (!threadId || !agentRunId || current.agentRunId !== agentRunId || !page || cursor == null || foregroundPendingRef.current) return
        const generation = generationRef.current
        foregroundPendingRef.current = true
        setState(current => ({ ...current, loading: true, error: null }))
        try {
            const response = await window.devscope.assistant.agentAction({ threadId, action: 'transcript',
                payload: { agentRunId, limit: PAGE_SIZE, ...(direction === 'older' ? { before: cursor } : { after: cursor }) } })
            if (generationRef.current !== generation) return
            if (!response.success) throw new Error(response.error)
            const incoming = readTranscriptPage(response.result)
            setState(current => current.agentRunId === agentRunId && current.page ? { ...current,
                page: direction === 'older' ? mergeAssistantAgentTranscriptPages(current.page, incoming) : mergeAssistantAgentTranscriptRefresh(current.page, incoming),
                loading: false, error: null } : current)
        } catch (error) {
            if (generationRef.current === generation) setState(current => ({ ...current, loading: false, error: errorMessage(error) }))
        } finally { if (generationRef.current === generation) foregroundPendingRef.current = false }
    }, [agentRunId, threadId])
    const loadOlder = useCallback(() => loadPage('older'), [loadPage])
    const loadNewer = useCallback(() => loadPage('newer'), [loadPage])
    const retry = useCallback(() => setRevision(value => value + 1), [])
    return { ...activeState, loadOlder, loadNewer, retry }
}
