import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type {
    BeginOnboardingReviewInput,
    CancelOnboardingReviewInput,
    CommitOnboardingStepInput,
    NavigateOnboardingInput,
    OnboardingAuthStatus,
    OnboardingSnapshot
} from '@shared/onboarding/contracts'

type OnboardingContextValue = {
    snapshot: OnboardingSnapshot | null
    loading: boolean
    error: string | null
    refresh: () => Promise<void>
    getAuthStatus: () => Promise<OnboardingAuthStatus>
    connectChatGpt: () => Promise<OnboardingAuthStatus>
    connectApiKey: (apiKey: string) => Promise<OnboardingAuthStatus>
    commitStep: (input: CommitOnboardingStepInput) => Promise<OnboardingSnapshot>
    navigate: (input: NavigateOnboardingInput) => Promise<OnboardingSnapshot>
    beginReview: (input: BeginOnboardingReviewInput) => Promise<OnboardingSnapshot>
    cancelReview: (input: CancelOnboardingReviewInput) => Promise<OnboardingSnapshot>
}

const OnboardingContext = createContext<OnboardingContextValue | null>(null)

function requestError(result: { success: false; error: string } | null, fallback: string): Error {
    return new Error(result?.error || fallback)
}

export function OnboardingProvider({ children }: { children: ReactNode }) {
    const [snapshot, setSnapshot] = useState<OnboardingSnapshot | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    const refresh = useCallback(async () => {
        const result = await window.devscope.onboarding.getState()
        if (!result.success) throw requestError(result, 'Could not load setup state.')
        setSnapshot(result.snapshot)
        setError(null)
    }, [])

    useEffect(() => {
        let mounted = true
        const unsubscribe = window.devscope.onboarding.onChanged((nextSnapshot) => {
            if (!mounted) return
            setSnapshot(nextSnapshot)
            setError(null)
        })
        void refresh().catch((requestFailure) => {
            if (mounted) setError(requestFailure instanceof Error ? requestFailure.message : 'Could not load setup state.')
        }).finally(() => {
            if (mounted) setLoading(false)
        })
        return () => {
            mounted = false
            unsubscribe()
        }
    }, [refresh])

    const applySnapshotResult = useCallback(async (
        request: Promise<{ success: true; snapshot: OnboardingSnapshot } | { success: false; error: string }>,
        fallback: string
    ) => {
        const result = await request
        if (!result.success) throw requestError(result, fallback)
        setSnapshot(result.snapshot)
        setError(null)
        return result.snapshot
    }, [])

    const value = useMemo<OnboardingContextValue>(() => ({
        snapshot,
        loading,
        error,
        refresh,
        getAuthStatus: async () => {
            const result = await window.devscope.onboarding.getAuthStatus()
            if (!result.success) throw requestError(result, 'Could not verify OpenAI.')
            return result.status
        },
        connectChatGpt: async () => {
            const result = await window.devscope.onboarding.connectChatGpt()
            if (!result.success) throw requestError(result, 'Could not connect ChatGPT.')
            return result.status
        },
        connectApiKey: async (apiKey) => {
            const result = await window.devscope.onboarding.connectApiKey(apiKey)
            if (!result.success) throw requestError(result, 'Could not connect OpenAI.')
            return result.status
        },
        commitStep: (input) => applySnapshotResult(
            window.devscope.onboarding.commitStep(input),
            'Could not save this setup step.'
        ),
        navigate: (input) => applySnapshotResult(
            window.devscope.onboarding.navigate(input),
            'Could not move to that setup step.'
        ),
        beginReview: (input) => applySnapshotResult(
            window.devscope.onboarding.beginReview(input),
            'Could not start setup review.'
        ),
        cancelReview: (input) => applySnapshotResult(
            window.devscope.onboarding.cancelReview(input),
            'Could not close setup review.'
        )
    }), [applySnapshotResult, error, loading, refresh, snapshot])

    return <OnboardingContext.Provider value={value}>{children}</OnboardingContext.Provider>
}

export function useOnboarding(): OnboardingContextValue {
    const context = useContext(OnboardingContext)
    if (!context) throw new Error('useOnboarding must be used within OnboardingProvider')
    return context
}
