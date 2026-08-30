import { useEffect, useMemo, useState } from 'react'
import type { FleetSnapshot } from '@shared/assistant/contracts'

export function resolveAssistantFleetSnapshot(
    projected: FleetSnapshot | null,
    refreshed: FleetSnapshot | null
): FleetSnapshot | null {
    if (!projected) return refreshed
    if (!refreshed) return projected
    if (projected.rootThreadId !== refreshed.rootThreadId) return projected
    if (projected.fleetId !== refreshed.fleetId) {
        return refreshed.updatedAt.localeCompare(projected.updatedAt) >= 0 ? refreshed : projected
    }
    if (refreshed.lastAppliedSequence !== projected.lastAppliedSequence) {
        return refreshed.lastAppliedSequence > projected.lastAppliedSequence ? refreshed : projected
    }
    const projectedRecords = Object.keys(projected.agents).length + Object.keys(projected.workflows).length
    const refreshedRecords = Object.keys(refreshed.agents).length + Object.keys(refreshed.workflows).length
    if (refreshedRecords !== projectedRecords) return refreshedRecords > projectedRecords ? refreshed : projected
    return refreshed.updatedAt.localeCompare(projected.updatedAt) > 0 ? refreshed : projected
}

export function useAssistantFleetSnapshot(input: {
    threadId: string | null
    projected: FleetSnapshot | null
    enabled: boolean
}): { snapshot: FleetSnapshot | null; loading: boolean } {
    const { threadId, projected, enabled } = input
    const [refreshed, setRefreshed] = useState<{ threadId: string; snapshot: FleetSnapshot | null } | null>(null)
    const [loadingThreadId, setLoadingThreadId] = useState<string | null>(null)

    useEffect(() => {
        if (!enabled || !threadId) return
        let cancelled = false
        setLoadingThreadId(threadId)
        void window.devscope.assistant.getFleetSnapshot(threadId).then((result) => {
            if (cancelled || !result.success) return
            setRefreshed({ threadId, snapshot: result.snapshot })
        }).catch(() => undefined).finally(() => {
            if (!cancelled) setLoadingThreadId((current) => current === threadId ? null : current)
        })
        return () => { cancelled = true }
    }, [enabled, threadId])

    const refreshedSnapshot = refreshed?.threadId === threadId ? refreshed.snapshot : null
    return {
        snapshot: useMemo(
            () => resolveAssistantFleetSnapshot(projected, refreshedSnapshot),
            [projected, refreshedSnapshot]
        ),
        loading: Boolean(threadId && loadingThreadId === threadId)
    }
}
