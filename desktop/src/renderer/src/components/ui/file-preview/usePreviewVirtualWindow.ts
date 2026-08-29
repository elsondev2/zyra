import { useCallback, useLayoutEffect, useRef, useState } from 'react'
import {
    computePreviewVirtualRange,
    previewTreeScrollTopForIndex,
    previewVirtualRangeCoversViewport,
    type PreviewTreeScrollAlignment,
    type PreviewVirtualRange
} from './previewVirtualTreeModel'

const PREVIEW_TREE_OVERSCAN_ROWS = 10
const PREVIEW_TREE_RANGE_GUARD_ROWS = 3
const PREVIEW_VIRTUAL_SCROLL_CACHE_LIMIT = 24
const previewVirtualScrollOffsets = new Map<string, number>()

function retainScrollOffset(key: string, offset: number): void {
    previewVirtualScrollOffsets.delete(key)
    previewVirtualScrollOffsets.set(key, Math.max(0, offset))
    while (previewVirtualScrollOffsets.size > PREVIEW_VIRTUAL_SCROLL_CACHE_LIMIT) {
        const oldestKey = previewVirtualScrollOffsets.keys().next().value
        if (typeof oldestKey !== 'string') break
        previewVirtualScrollOffsets.delete(oldestKey)
    }
}

export function usePreviewVirtualWindow({
    rowCount,
    rowHeight,
    restoreKey,
    overscanRows = PREVIEW_TREE_OVERSCAN_ROWS,
    guardRows = PREVIEW_TREE_RANGE_GUARD_ROWS
}: {
    rowCount: number
    rowHeight: number
    restoreKey?: string
    overscanRows?: number
    guardRows?: number
}) {
    const scrollElementRef = useRef<HTMLDivElement | null>(null)
    const frameRef = useRef<number | null>(null)
    const rangeRef = useRef<PreviewVirtualRange>({ start: 0, end: 0 })
    const [range, setRange] = useState<PreviewVirtualRange>(rangeRef.current)

    const updateRange = useCallback((force = false) => {
        const scrollElement = scrollElementRef.current
        if (!scrollElement) return
        const viewportHeight = scrollElement.clientHeight
        const scrollTop = scrollElement.scrollTop
        const currentRange = rangeRef.current
        if (!force && previewVirtualRangeCoversViewport({
            range: currentRange,
            rowCount,
            rowHeight,
            scrollTop,
            viewportHeight,
            guardRows
        })) {
            return
        }

        const nextRange = computePreviewVirtualRange({
            rowCount,
            rowHeight,
            scrollTop,
            viewportHeight,
            overscan: overscanRows
        })
        if (nextRange.start === currentRange.start && nextRange.end === currentRange.end) return
        rangeRef.current = nextRange
        setRange(nextRange)
    }, [guardRows, overscanRows, rowCount, rowHeight])

    const scheduleRangeUpdate = useCallback(() => {
        if (frameRef.current !== null) return
        frameRef.current = window.requestAnimationFrame(() => {
            frameRef.current = null
            updateRange(false)
        })
    }, [updateRange])

    useLayoutEffect(() => {
        const scrollElement = scrollElementRef.current
        if (!scrollElement) return
        const maxScrollTop = Math.max(0, rowCount * rowHeight - scrollElement.clientHeight)
        const restoredOffset = restoreKey ? previewVirtualScrollOffsets.get(restoreKey) : undefined
        if (typeof restoredOffset === 'number') scrollElement.scrollTop = Math.min(maxScrollTop, restoredOffset)
        else if (scrollElement.scrollTop > maxScrollTop) scrollElement.scrollTop = maxScrollTop
        updateRange(true)

        scrollElement.addEventListener('scroll', scheduleRangeUpdate, { passive: true })
        const retainCurrentOffset = () => {
            if (restoreKey) retainScrollOffset(restoreKey, scrollElement.scrollTop)
        }
        const resizeObserver = typeof ResizeObserver === 'undefined'
            ? null
            : new ResizeObserver(() => updateRange(true))
        resizeObserver?.observe(scrollElement)
        const handleWindowResize = () => updateRange(true)
        if (!resizeObserver) window.addEventListener('resize', handleWindowResize)

        return () => {
            retainCurrentOffset()
            scrollElement.removeEventListener('scroll', scheduleRangeUpdate)
            resizeObserver?.disconnect()
            if (!resizeObserver) window.removeEventListener('resize', handleWindowResize)
            if (frameRef.current !== null) {
                window.cancelAnimationFrame(frameRef.current)
                frameRef.current = null
            }
        }
    }, [restoreKey, rowCount, rowHeight, scheduleRangeUpdate, updateRange])

    const scrollToIndex = useCallback((index: number, alignment: PreviewTreeScrollAlignment = 'auto') => {
        const scrollElement = scrollElementRef.current
        if (!scrollElement || rowCount <= 0) return
        const nextScrollTop = previewTreeScrollTopForIndex({
            index,
            rowCount,
            rowHeight,
            viewportHeight: scrollElement.clientHeight,
            currentScrollTop: scrollElement.scrollTop,
            alignment
        })
        if (Math.abs(nextScrollTop - scrollElement.scrollTop) < 0.5) return
        scrollElement.scrollTop = nextScrollTop
        updateRange(true)
    }, [rowCount, rowHeight, updateRange])

    return {
        range,
        scrollElementRef,
        scrollToIndex
    }
}
