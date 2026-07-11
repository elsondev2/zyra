import { useCallback, useEffect } from 'react'
import type { UseProjectDataLifecycleParams } from './types'

type UseReadmeOverflowLifecycleParams = Pick<
    UseProjectDataLifecycleParams,
    | 'project'
    | 'activeTab'
    | 'readmeExpanded'
    | 'readmeCollapsedMaxHeight'
    | 'readmeContentRef'
    | 'setReadmeExpanded'
    | 'setReadmeNeedsExpand'
>

export function useReadmeOverflowLifecycle({
    project,
    activeTab,
    readmeExpanded,
    readmeCollapsedMaxHeight,
    readmeContentRef,
    setReadmeExpanded,
    setReadmeNeedsExpand
}: UseReadmeOverflowLifecycleParams): void {
    const measureReadmeOverflow = useCallback(() => {
        const element = readmeContentRef.current
        if (!element) {
            setReadmeNeedsExpand(false)
            return
        }

        const hasOverflow = element.scrollHeight > readmeCollapsedMaxHeight + 12
        setReadmeNeedsExpand(hasOverflow)
    }, [readmeCollapsedMaxHeight, readmeContentRef, setReadmeNeedsExpand])

    useEffect(() => {
        setReadmeExpanded(false)
    }, [project?.path, project?.readme, setReadmeExpanded])

    useEffect(() => {
        if (!project?.readme) {
            setReadmeNeedsExpand(false)
            return
        }

        const rafId = requestAnimationFrame(measureReadmeOverflow)
        const lateMeasure1 = window.setTimeout(measureReadmeOverflow, 120)
        const lateMeasure2 = window.setTimeout(measureReadmeOverflow, 600)

        let observer: ResizeObserver | null = null
        if (readmeContentRef.current && typeof ResizeObserver !== 'undefined') {
            observer = new ResizeObserver(() => measureReadmeOverflow())
            observer.observe(readmeContentRef.current)
        }

        return () => {
            cancelAnimationFrame(rafId)
            clearTimeout(lateMeasure1)
            clearTimeout(lateMeasure2)
            observer?.disconnect()
        }
    }, [project?.readme, activeTab, readmeExpanded, measureReadmeOverflow, readmeContentRef, setReadmeNeedsExpand])
}
