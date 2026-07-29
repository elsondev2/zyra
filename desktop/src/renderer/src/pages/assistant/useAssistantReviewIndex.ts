import { useEffect, useState } from 'react'
import type { AssistantReviewIndex } from '@shared/assistant/contracts'

export function useAssistantReviewIndex(args: {
    threadId: string | null
    enabled?: boolean
    refreshKey?: string | null
}) {
    const { threadId, enabled = true, refreshKey = null } = args
    const [reviewIndex, setReviewIndex] = useState<AssistantReviewIndex | null>(null)
    const [reviewIndexLoading, setReviewIndexLoading] = useState(false)
    const [reviewIndexError, setReviewIndexError] = useState<string | null>(null)

    useEffect(() => {
        if (!enabled || !threadId) {
            setReviewIndexLoading(false)
            setReviewIndexError(null)
            return
        }

        let cancelled = false
        setReviewIndexLoading(true)
        setReviewIndexError(null)
        setReviewIndex((current) => current?.threadId === threadId ? current : null)

        void window.devscope.assistant.getReviewIndex({ threadId }).then((result) => {
            if (cancelled) return
            if (!result.success) throw new Error(result.error || 'Failed to load the Review index.')
            setReviewIndex(result.index)
        }).catch((error) => {
            if (cancelled) return
            setReviewIndexError(error instanceof Error ? error.message : 'Failed to load the Review index.')
        }).finally(() => {
            if (!cancelled) setReviewIndexLoading(false)
        })

        return () => { cancelled = true }
    }, [enabled, refreshKey, threadId])

    return {
        reviewIndex: enabled && reviewIndex?.threadId === threadId ? reviewIndex : null,
        reviewIndexLoading,
        reviewIndexError
    }
}
