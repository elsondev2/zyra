import { useEffect, useState } from 'react'
import type { AssistantSessionTurnUsagePayload } from '@shared/assistant/contracts'

export function useAssistantSessionTurnUsage(args: {
    sessionId: string | null
    enabled?: boolean
    refreshKey?: string | null
}) {
    const {
        sessionId,
        enabled = true,
        refreshKey = null
    } = args
    const [sessionTurnUsage, setSessionTurnUsage] = useState<AssistantSessionTurnUsagePayload | null>(null)
    const [sessionTurnUsageLoading, setSessionTurnUsageLoading] = useState(false)
    const [sessionTurnUsageError, setSessionTurnUsageError] = useState<string | null>(null)

    useEffect(() => {
        if (!enabled || !sessionId) {
            setSessionTurnUsageLoading(false)
            setSessionTurnUsageError(null)
            return
        }

        let cancelled = false
        setSessionTurnUsageLoading(true)
        setSessionTurnUsageError(null)

        void (async () => {
            try {
                const result = await window.devscope.assistant.getSessionTurnUsage({ sessionId })
                if (cancelled) return
                if (!result.success) {
                    throw new Error(result.error || 'Failed to load assistant turn usage.')
                }
                setSessionTurnUsage(result.usage)
                setSessionTurnUsageError(null)
            } catch (error) {
                if (cancelled) return
                setSessionTurnUsageError(error instanceof Error ? error.message : 'Failed to load assistant turn usage.')
            } finally {
                if (!cancelled) setSessionTurnUsageLoading(false)
            }
        })()

        return () => {
            cancelled = true
        }
    }, [enabled, refreshKey, sessionId])

    return {
        sessionTurnUsage: enabled && sessionTurnUsage?.sessionId === sessionId ? sessionTurnUsage : null,
        sessionTurnUsageLoading,
        sessionTurnUsageError
    }
}
