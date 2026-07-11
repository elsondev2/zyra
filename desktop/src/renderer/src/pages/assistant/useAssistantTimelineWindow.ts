import { startTransition, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from 'react'

const INITIAL_WINDOW_SIZE = 72
const LOAD_MORE_SIZE = 48
const TOP_LOAD_THRESHOLD_PX = 220
const FOLLOW_LATEST_THRESHOLD_PX = 180

type PendingAnchor = {
    previousHeight: number
    previousTop: number
}

function isNearBottom(element: HTMLDivElement): boolean {
    return Math.max(0, element.scrollHeight - element.scrollTop - element.clientHeight) <= FOLLOW_LATEST_THRESHOLD_PX
}

export function useAssistantTimelineWindow({
    entryCount,
    resetKey,
    scrollContainerRef
}: {
    entryCount: number
    resetKey: string
    scrollContainerRef?: RefObject<HTMLDivElement | null>
}) {
    const [loadedEntryCount, setLoadedEntryCount] = useState(() => Math.min(entryCount, INITIAL_WINDOW_SIZE))
    const pendingAnchorRef = useRef<PendingAnchor | null>(null)
    const loadingOlderRef = useRef(false)
    const previousResetKeyRef = useRef(resetKey)
    const previousEntryCountRef = useRef(entryCount)

    useLayoutEffect(() => {
        if (previousResetKeyRef.current === resetKey) return
        previousResetKeyRef.current = resetKey
        pendingAnchorRef.current = null
        loadingOlderRef.current = false
        previousEntryCountRef.current = entryCount
        setLoadedEntryCount(Math.min(entryCount, INITIAL_WINDOW_SIZE))
    }, [entryCount, resetKey])

    useEffect(() => {
        const previousEntryCount = previousEntryCountRef.current
        previousEntryCountRef.current = entryCount

        setLoadedEntryCount((current) => {
            const safeCurrent = Math.max(0, Math.min(current, previousEntryCount))
            if (entryCount <= safeCurrent) return entryCount

            const appendedCount = entryCount - previousEntryCount
            if (appendedCount <= 0) return Math.min(entryCount, safeCurrent)

            const element = scrollContainerRef?.current
            const shouldFollowLatest = !element || isNearBottom(element)
            if (shouldFollowLatest) {
                return Math.min(entryCount, Math.max(INITIAL_WINDOW_SIZE, safeCurrent))
            }

            return Math.min(entryCount, safeCurrent + appendedCount)
        })
    }, [entryCount, scrollContainerRef])

    const startIndex = useMemo(
        () => Math.max(0, entryCount - loadedEntryCount),
        [entryCount, loadedEntryCount]
    )

    const hasHiddenEntries = useMemo(() => startIndex > 0, [startIndex])
    const hiddenEntryCount = useMemo(() => Math.max(0, entryCount - loadedEntryCount), [entryCount, loadedEntryCount])

    const loadOlder = useCallback(() => {
        if (!hasHiddenEntries || loadingOlderRef.current) return
        const element = scrollContainerRef?.current
        if (element) {
            pendingAnchorRef.current = {
                previousHeight: element.scrollHeight,
                previousTop: element.scrollTop
            }
        }
        loadingOlderRef.current = true
        startTransition(() => {
            setLoadedEntryCount((current) => Math.min(entryCount, current + LOAD_MORE_SIZE))
        })
    }, [entryCount, hasHiddenEntries, scrollContainerRef])

    const revealAll = useCallback(() => {
        pendingAnchorRef.current = null
        loadingOlderRef.current = false
        setLoadedEntryCount(entryCount)
    }, [entryCount])

    useEffect(() => {
        const element = scrollContainerRef?.current
        if (!element || !hasHiddenEntries) return

        const handleScroll = () => {
            if (element.scrollTop > TOP_LOAD_THRESHOLD_PX) return
            loadOlder()
        }

        element.addEventListener('scroll', handleScroll, { passive: true })
        return () => element.removeEventListener('scroll', handleScroll)
    }, [hasHiddenEntries, loadOlder, scrollContainerRef])

    useLayoutEffect(() => {
        const pendingAnchor = pendingAnchorRef.current
        const element = scrollContainerRef?.current
        if (!pendingAnchor || !element) return
        pendingAnchorRef.current = null
        const heightDelta = element.scrollHeight - pendingAnchor.previousHeight
        element.scrollTop = pendingAnchor.previousTop + heightDelta
        loadingOlderRef.current = false
    }, [loadedEntryCount, scrollContainerRef])

    useEffect(() => {
        if (!loadingOlderRef.current) return
        loadingOlderRef.current = false
    }, [loadedEntryCount])

    return {
        startIndex,
        loadedEntryCount,
        hiddenEntryCount,
        hasHiddenEntries,
        loadOlder,
        revealAll
    }
}
