import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { AssistantActivity } from '@shared/assistant/contracts'
import {
    getAssistantRecoveryIssue,
    isRecoverableAssistantReconnectError,
    MAX_ASSISTANT_RECONNECT_ATTEMPTS,
    type AssistantRecoveryIssue
} from './assistant-runtime-recovery'
import { shouldAutoReconnectAssistantThread } from './assistant-connection-recovery-policy'

type AssistantConnectResult = { success: boolean; error?: string }

type AssistantConnectionRecoveryState = {
    phase: 'idle' | 'retrying' | 'exhausted'
    attempt: number
    maxAttempts: number
    sessionKey: string | null
}

const RECOVERY_BANNER_VISIBLE_AFTER_ATTEMPT = 0

export function getPausedAssistantRuntimeRecovery(activities: AssistantActivity[], turnId?: string | null, completedAt?: string | null): { attempt: number; maxAttempts: number } | null {
    const activity = activities.find((entry) => entry.payload?.['category'] === 'connection-recovery' && (!turnId || !entry.turnId || entry.turnId === turnId))
    if (!activity || activity.payload?.['status'] !== 'paused') return null
    if (completedAt && Date.parse(activity.createdAt) <= Date.parse(completedAt)) return null
    const attempt = Math.max(1, Math.floor(Number(activity.payload?.['attempt']) || 1))
    const maxAttempts = Math.max(attempt, Math.floor(Number(activity.payload?.['maxAttempts']) || MAX_ASSISTANT_RECONNECT_ATTEMPTS))
    return { attempt, maxAttempts }
}

function getReconnectDelayMs(attempt: number): number {
    return Math.min(5000, 700 + ((attempt - 1) * 500))
}

function wait(ms: number): Promise<void> {
    return new Promise((resolve) => {
        window.setTimeout(resolve, ms)
    })
}

export function useAssistantConnectionRecovery(input: {
    selectedSessionId: string | null
    activeThreadId: string | null
    threadState?: string | null
    threadWorking?: boolean
    latestTurnId?: string | null
    latestTurnCompletedAt?: string | null
    loading: boolean
    connected: boolean
    commandPending: boolean
    deferUntilFirstPrompt?: boolean
    threadLastError?: string | null
    commandError?: string | null
    activities: AssistantActivity[]
    connectResult: (sessionId?: string) => Promise<AssistantConnectResult>
    disconnect: (sessionId?: string) => Promise<void> | void
}) {
    const {
        selectedSessionId,
        activeThreadId,
        threadState,
        threadWorking = false,
        latestTurnId,
        latestTurnCompletedAt,
        loading,
        connected,
        commandPending,
        deferUntilFirstPrompt = false,
        threadLastError,
        commandError,
        activities,
        connectResult,
        disconnect
    } = input
    const [state, setState] = useState<AssistantConnectionRecoveryState>({
        phase: 'idle',
        attempt: 0,
        maxAttempts: MAX_ASSISTANT_RECONNECT_ATTEMPTS,
        sessionKey: null
    })
    const activeRunIdRef = useRef(0)
    const exhaustedSessionKeysRef = useRef<Set<string>>(new Set())

    const recoveryIssue = useMemo<AssistantRecoveryIssue | null>(() => (
        getAssistantRecoveryIssue({
            threadLastError,
            commandError,
            activities
        })
    ), [activities, commandError, threadLastError])
    const pausedRuntimeRecovery = useMemo(
        () => getPausedAssistantRuntimeRecovery(activities, latestTurnId, latestTurnCompletedAt),
        [activities, latestTurnId, latestTurnCompletedAt]
    )
    // Canonical turn progress can precede the attachment's connected update.
    // Historical failure UI must never reconnect over work that has resumed.
    const runtimeActive = connected || threadWorking

    const reconnectSessionKey = selectedSessionId
        ? `${selectedSessionId}:${activeThreadId || 'pending-thread'}`
        : null
    const recoveryContextRef = useRef({ sessionKey: reconnectSessionKey, runtimeActive })
    useLayoutEffect(() => {
        recoveryContextRef.current = { sessionKey: reconnectSessionKey, runtimeActive }
    }, [reconnectSessionKey, runtimeActive])
    const shouldAutoReconnect = shouldAutoReconnectAssistantThread({
        threadState,
        hasRecoverableIssue: recoveryIssue?.recoverable === true
    })

    const cancelReconnectRun = useCallback(() => {
        activeRunIdRef.current += 1
    }, [])

    const runReconnectCycle = useCallback(async (sessionId: string, sessionKey: string) => {
        if (recoveryContextRef.current.runtimeActive || recoveryContextRef.current.sessionKey !== sessionKey) return
        const runId = activeRunIdRef.current + 1
        activeRunIdRef.current = runId
        const isCurrentRun = () => activeRunIdRef.current === runId
            && recoveryContextRef.current.sessionKey === sessionKey
            && !recoveryContextRef.current.runtimeActive
        setState({
            phase: 'retrying',
            attempt: 0,
            maxAttempts: MAX_ASSISTANT_RECONNECT_ATTEMPTS,
            sessionKey
        })

        for (let attempt = 1; attempt <= MAX_ASSISTANT_RECONNECT_ATTEMPTS; attempt += 1) {
            if (!isCurrentRun()) return

            setState({
                phase: 'retrying',
                attempt,
                maxAttempts: MAX_ASSISTANT_RECONNECT_ATTEMPTS,
                sessionKey
            })

            try {
                await disconnect(sessionId)
            } catch {
                // best-effort disconnect before reconnecting
            }

            if (!isCurrentRun()) return
            const result = await connectResult(sessionId)
            if (!isCurrentRun()) return

            if (result.success) {
                exhaustedSessionKeysRef.current.delete(sessionKey)
                setState({
                    phase: 'idle',
                    attempt: 0,
                    maxAttempts: MAX_ASSISTANT_RECONNECT_ATTEMPTS,
                    sessionKey: null
                })
                return
            }

            const shouldContinue = isRecoverableAssistantReconnectError(result.error)
            if (!shouldContinue || attempt >= MAX_ASSISTANT_RECONNECT_ATTEMPTS) {
                exhaustedSessionKeysRef.current.add(sessionKey)
                setState({
                    phase: 'exhausted',
                    attempt,
                    maxAttempts: MAX_ASSISTANT_RECONNECT_ATTEMPTS,
                    sessionKey
                })
                return
            }

            await wait(getReconnectDelayMs(attempt))
        }
    }, [connectResult, disconnect])

    const reconnect = useCallback(() => {
        if (!selectedSessionId || !reconnectSessionKey) return
        exhaustedSessionKeysRef.current.delete(reconnectSessionKey)
        void runReconnectCycle(selectedSessionId, reconnectSessionKey)
    }, [selectedSessionId, reconnectSessionKey, runReconnectCycle])

    useEffect(() => {
        if ((runtimeActive || latestTurnCompletedAt) && reconnectSessionKey) {
            exhaustedSessionKeysRef.current.delete(reconnectSessionKey)
        }
        if (runtimeActive || latestTurnCompletedAt || !selectedSessionId) {
            cancelReconnectRun()
            setState((current) => (
                current.phase === 'idle'
                    ? current
                    : {
                        phase: 'idle',
                        attempt: 0,
                        maxAttempts: MAX_ASSISTANT_RECONNECT_ATTEMPTS,
                        sessionKey: null
                    }
            ))
        }
    }, [cancelReconnectRun, runtimeActive, selectedSessionId, reconnectSessionKey, latestTurnCompletedAt])

    useEffect(() => {
        return () => {
            cancelReconnectRun()
        }
    }, [cancelReconnectRun])

    useEffect(() => {
        if (!selectedSessionId || !reconnectSessionKey || deferUntilFirstPrompt) return
        if (loading || commandPending || runtimeActive) return
        if (threadState === 'interrupted') return
        if (!shouldAutoReconnect) return
        if (state.phase === 'retrying' && state.sessionKey === reconnectSessionKey) return
        if (pausedRuntimeRecovery) return
        if (exhaustedSessionKeysRef.current.has(reconnectSessionKey)) return
        void runReconnectCycle(selectedSessionId, reconnectSessionKey)
    }, [
        commandPending,
        runtimeActive,
        deferUntilFirstPrompt,
        loading,
        pausedRuntimeRecovery,
        shouldAutoReconnect,
        selectedSessionId,
        threadState,
        reconnectSessionKey,
        runReconnectCycle,
        state.phase,
        state.sessionKey
    ])

    const reconnectIsForSelectedThread = Boolean(
        reconnectSessionKey
        && state.sessionKey === reconnectSessionKey
    )
    const showRepeatedRetryBanner = state.phase === 'retrying'
        && reconnectIsForSelectedThread
        && state.attempt > RECOVERY_BANNER_VISIBLE_AFTER_ATTEMPT
    const showExhaustedRetryBanner = state.phase === 'exhausted'
        && reconnectIsForSelectedThread
    const showRuntimePausedBanner = Boolean(pausedRuntimeRecovery && !connected && state.phase !== 'retrying')
    const runtimeAttempt = pausedRuntimeRecovery?.attempt || 0
    const runtimeMaxAttempts = pausedRuntimeRecovery?.maxAttempts || MAX_ASSISTANT_RECONNECT_ATTEMPTS

    const showBanner = Boolean(
        selectedSessionId
        && !runtimeActive
        && recoveryIssue?.recoverable
        && (showRepeatedRetryBanner || showExhaustedRetryBanner || showRuntimePausedBanner)
    )

    return {
        issue: recoveryIssue,
        showBanner,
        reconnect,
        reconnectPending: !runtimeActive && reconnectIsForSelectedThread && state.phase === 'retrying',
        reconnectAttempt: state.phase === 'idle' ? runtimeAttempt : state.attempt,
        reconnectMaxAttempts: state.phase === 'idle' ? runtimeMaxAttempts : state.maxAttempts,
        reconnectExhausted: state.phase === 'exhausted' || showRuntimePausedBanner
    }
}
