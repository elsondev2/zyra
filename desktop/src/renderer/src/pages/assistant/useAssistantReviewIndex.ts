import { useEffect, useRef, useState } from 'react'
import type { AssistantReviewIndex } from '@shared/assistant/contracts'

type ReviewIndexResult = Awaited<ReturnType<typeof window.devscope.assistant.getReviewIndex>>

const pendingReviewIndexRequests = new Map<string, Promise<ReviewIndexResult>>()

function requestAssistantReviewIndex(threadId: string, requestKey: string): Promise<ReviewIndexResult> {
    const pending = pendingReviewIndexRequests.get(requestKey)
    if (pending) return pending
    const request = window.devscope.assistant.getReviewIndex({ threadId }).finally(() => {
        if (pendingReviewIndexRequests.get(requestKey) === request) pendingReviewIndexRequests.delete(requestKey)
    })
    pendingReviewIndexRequests.set(requestKey, request)
    return request
}

export function useAssistantReviewIndex(args: {
    threadId: string | null
    enabled?: boolean
    prefetch?: boolean
    refreshKey?: string | null
}) {
    const { threadId, enabled = true, prefetch = false, refreshKey = null } = args
    const [reviewIndex, setReviewIndex] = useState<AssistantReviewIndex | null>(null)
    const [reviewIndexLoading, setReviewIndexLoading] = useState(false)
    const [reviewIndexError, setReviewIndexError] = useState<string | null>(null)
    const loadedRequestKeyRef = useRef<string | null>(null)

    useEffect(() => {
        if (!threadId || (!enabled && !prefetch)) {
            setReviewIndexLoading(false)
            setReviewIndexError(null)
            return
        }
        if (!enabled && reviewIndex?.threadId === threadId) return
        const requestKey = `${threadId}:${refreshKey || 'settled'}`
        if (reviewIndex?.threadId === threadId && loadedRequestKeyRef.current === requestKey) {
            setReviewIndexLoading(false)
            setReviewIndexError(null)
            return
        }

        let cancelled = false
        setReviewIndexLoading(true)
        setReviewIndexError(null)
        setReviewIndex((current) => current?.threadId === threadId ? current : null)

        void requestAssistantReviewIndex(threadId, requestKey).then((result) => {
            if (cancelled) return
            if (!result.success) throw new Error(result.error || 'Failed to load the Review index.')
            loadedRequestKeyRef.current = requestKey
            setReviewIndex(result.index)
        }).catch((error) => {
            if (cancelled) return
            setReviewIndexError(error instanceof Error ? error.message : 'Failed to load the Review index.')
        }).finally(() => {
            if (!cancelled) setReviewIndexLoading(false)
        })

        return () => { cancelled = true }
    }, [enabled, prefetch, refreshKey, reviewIndex, threadId])

    return {
        reviewIndex: reviewIndex?.threadId === threadId ? reviewIndex : null,
        reviewIndexLoading,
        reviewIndexError
    }
}
