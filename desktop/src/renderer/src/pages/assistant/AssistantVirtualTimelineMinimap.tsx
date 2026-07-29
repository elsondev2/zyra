import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import type { LegendListRef } from '@legendapp/list/react'
import type { TimelineDisplayRow } from './assistant-timeline-helpers'

const MAX_MARKERS = 28

type Marker = { id: string; rowIndex: number; title: string; top: number }

function compactTitle(value: string): string {
    const title = value.replace(/\s+/g, ' ').trim()
    return title.length > 80 ? `${title.slice(0, 79)}…` : title || 'User message'
}

export const AssistantVirtualTimelineMinimap = memo(function AssistantVirtualTimelineMinimap(props: {
    rows: TimelineDisplayRow[]
    listRef: RefObject<LegendListRef | null>
    railHostRef?: RefObject<HTMLDivElement | null>
    scrollContainerRef?: RefObject<HTMLDivElement | null>
    hasOlder: boolean
}) {
    const [markers, setMarkers] = useState<Marker[]>([])
    const [activeId, setActiveId] = useState<string | null>(null)
    const [geometry, setGeometry] = useState<{ top: number; height: number } | null>(null)
    const frameRef = useRef<number | null>(null)
    const items = useMemo(() => props.rows.flatMap((row, rowIndex) => (
        row.kind === 'message' && row.message.role === 'user'
            ? [{ id: row.id, rowIndex, title: compactTitle(row.message.text) }]
            : []
    )), [props.rows])
    const displayedItems = useMemo(
        () => items.length <= MAX_MARKERS ? items : items.slice(items.length - MAX_MARKERS),
        [items]
    )

    useLayoutEffect(() => {
        const list = props.listRef.current
        const host = props.railHostRef?.current
        const viewport = props.scrollContainerRef?.current
        if (!list || !(host instanceof HTMLElement) || !(viewport instanceof HTMLElement) || displayedItems.length < 2) {
            setMarkers([])
            setGeometry(null)
            return
        }
        let disposed = false
        const measure = () => {
            const currentHost = props.railHostRef?.current
            const currentViewport = props.scrollContainerRef?.current
            if (disposed || !(currentHost instanceof HTMLElement) || !(currentViewport instanceof HTMLElement)) return
            const state = list.getState()
            const contentLength = Math.max(1, state.contentLength)
            setMarkers(displayedItems.map((item) => ({
                ...item,
                top: Math.max(0, Math.min(1, state.positionAtIndex(item.rowIndex) / contentLength))
            })))
            const hostRect = currentHost.getBoundingClientRect()
            const viewportRect = currentViewport.getBoundingClientRect()
            setGeometry({ top: viewportRect.top - hostRect.top, height: viewportRect.height })
        }
        const schedule = () => {
            if (frameRef.current !== null) return
            frameRef.current = window.requestAnimationFrame(() => {
                frameRef.current = null
                measure()
            })
        }
        schedule()
        const unsubscribePosition = list.getState().listen('lastPositionUpdate', schedule)
        const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(schedule) : null
        observer?.observe(viewport)
        return () => {
            disposed = true
            unsubscribePosition()
            observer?.disconnect()
            if (frameRef.current !== null) {
                window.cancelAnimationFrame(frameRef.current)
                frameRef.current = null
            }
        }
    }, [displayedItems, props.listRef, props.railHostRef, props.scrollContainerRef])

    useEffect(() => {
        const viewport = props.scrollContainerRef?.current
        const list = props.listRef.current
        if (!(viewport instanceof HTMLElement) || !list || markers.length === 0) return
        const sync = () => {
            const state = list.getState()
            const anchor = state.scroll + state.scrollLength * 0.34
            let active = markers[0]
            for (const marker of markers) {
                if (state.positionAtIndex(marker.rowIndex) <= anchor) active = marker
                else break
            }
            setActiveId((current) => current === active.id ? current : active.id)
        }
        sync()
        viewport.addEventListener('scroll', sync, { passive: true })
        return () => viewport.removeEventListener('scroll', sync)
    }, [markers, props.listRef, props.scrollContainerRef])

    const host = props.railHostRef?.current
    if (!host || !geometry || markers.length < 2) return null
    return createPortal(
        <div className="pointer-events-none absolute left-2 z-30 w-9" style={{ top: geometry.top, height: geometry.height }}>
            {props.hasOlder ? <span className="absolute left-0 top-3 text-[8px] font-medium text-white/35">↑ older</span> : null}
            <div className="absolute left-0 top-1/2 h-[min(220px,55%)] w-8 -translate-y-1/2">
                {markers.map((marker) => (
                    <button
                        key={marker.id}
                        type="button"
                        title={marker.title}
                        aria-label={`Jump to message: ${marker.title}`}
                        className="pointer-events-auto absolute left-0 h-3 w-7 -translate-y-1/2"
                        style={{ top: `${marker.top * 100}%` }}
                        onClick={() => {
                            props.scrollContainerRef?.current?.dispatchEvent(new CustomEvent('assistant:timeline-user-jump'))
                            void props.listRef.current?.scrollToIndex({ index: marker.rowIndex, viewPosition: 0.18, animated: true })
                        }}
                    >
                        <span className={`block h-[2px] rounded-full transition-all ${activeId === marker.id ? 'w-6 bg-white/85' : 'w-3 bg-white/40 hover:w-5 hover:bg-white/65'}`} />
                    </button>
                ))}
            </div>
        </div>,
        host
    )
})
