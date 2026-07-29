import { useCallback, useLayoutEffect, useRef, useState } from 'react'
import {
    computePreviewVirtualRange,
    previewVirtualRangeCoversViewport,
    type PreviewVirtualRange
} from './previewVirtualTreeModel'

const PREVIEW_TREE_OVERSCAN_ROWS = 10
const PREVIEW_TREE_RANGE_GUARD_ROWS = 3

export function usePreviewVirtualWindow({
    rowCount,
    rowHeight
}: {
    rowCount: number
    rowHeight: number
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
            guardRows: PREVIEW_TREE_RANGE_GUARD_ROWS
        })) {
            return
        }

        const nextRange = computePreviewVirtualRange({
            rowCount,
            rowHeight,
            scrollTop,
            viewportHeight,
            overscan: PREVIEW_TREE_OVERSCAN_ROWS
        })
        if (nextRange.start === currentRange.start && nextRange.end === currentRange.end) return
        rangeRef.current = nextRange
        setRange(nextRange)
    }, [rowCount, rowHeight])

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
        if (scrollElement.scrollTop > maxScrollTop) scrollElement.scrollTop = maxScrollTop
        updateRange(true)

        scrollElement.addEventListener('scroll', scheduleRangeUpdate, { passive: true })
        const resizeObserver = typeof ResizeObserver === 'undefined'
            ? null
            : new ResizeObserver(() => updateRange(true))
        resizeObserver?.observe(scrollElement)
        const handleWindowResize = () => updateRange(true)
        if (!resizeObserver) window.addEventListener('resize', handleWindowResize)

        return () => {
            scrollElement.removeEventListener('scroll', scheduleRangeUpdate)
            resizeObserver?.disconnect()
            if (!resizeObserver) window.removeEventListener('resize', handleWindowResize)
            if (frameRef.current !== null) {
                window.cancelAnimationFrame(frameRef.current)
                frameRef.current = null
            }
        }
    }, [rowCount, rowHeight, scheduleRangeUpdate, updateRange])

    const scrollToIndex = useCallback((index: number, alignment: 'auto' | 'top' = 'auto') => {
        const scrollElement = scrollElementRef.current
        if (!scrollElement || rowCount <= 0) return
        const safeIndex = Math.max(0, Math.min(rowCount - 1, index))
        const rowTop = safeIndex * rowHeight
        const rowBottom = rowTop + rowHeight
        const viewportTop = scrollElement.scrollTop
        const viewportBottom = viewportTop + scrollElement.clientHeight

        if (alignment === 'top' || rowTop < viewportTop) {
            scrollElement.scrollTop = rowTop
        } else if (rowBottom > viewportBottom) {
            scrollElement.scrollTop = Math.max(0, rowBottom - scrollElement.clientHeight)
        } else {
            return
        }
        updateRange(true)
    }, [rowCount, rowHeight, updateRange])

    return {
        range,
        scrollElementRef,
        scrollToIndex
    }
}
