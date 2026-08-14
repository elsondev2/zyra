import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { GripVertical, LoaderCircle, Plus, X } from 'lucide-react'
import { FileActionsMenu, type FileActionsMenuItem } from '@/components/ui/FileActionsMenu'
import { usePublishAssistantTitleBarEndRegion } from '@/lib/assistant/assistant-title-bar'
import { cn } from '@/lib/utils'
import { ASSISTANT_MIN_INSPECTOR_WIDTH } from './assistant-pane-layout'

export type AssistantInspectorTab = {
    id: string
    label: string
    icon?: ReactNode
    statusIcon?: ReactNode
    count?: number
    closable?: boolean
    loading?: boolean
    attention?: boolean
    preview?: string
}

type ResizeState = {
    pointerId: number
    startX: number
    startWidth: number
    width: number
}

const MAX_WORKSPACE_TAB_WIDTH = 112
const MIN_WORKSPACE_TAB_WIDTH = 74
const TITLE_BAR_RESERVED_WIDTH = 188

function clampInspectorWidth(width: number, maxWidth: number): number {
    const resolvedMaxWidth = Math.max(ASSISTANT_MIN_INSPECTOR_WIDTH, Math.round(maxWidth))
    return Math.max(ASSISTANT_MIN_INSPECTOR_WIDTH, Math.min(resolvedMaxWidth, Math.round(width)))
}

export function AssistantInspectorSidebar({
    open,
    width,
    maxWidth,
    tabs,
    activeTabId,
    onWidthChange,
    onSelectTab,
    onCloseTab,
    onReorderTab,
    addTabItems,
    children
}: {
    open: boolean
    width: number
    maxWidth: number
    tabs: AssistantInspectorTab[]
    activeTabId: string
    onWidthChange: (width: number) => void
    onSelectTab: (tabId: string) => void
    onCloseTab: (tabId: string) => void
    onReorderTab: (fromTabId: string, toTabId: string) => void
    addTabItems: FileActionsMenuItem[]
    children: ReactNode
}) {
    const rootRef = useRef<HTMLDivElement | null>(null)
    const titleBarSurfaceRef = useRef<HTMLDivElement | null>(null)
    const tabRailRef = useRef<HTMLElement | null>(null)
    const resizeStateRef = useRef<ResizeState | null>(null)
    const resizeFrameRef = useRef(0)
    const previewTimerRef = useRef(0)
    const previewDismissTimerRef = useRef(0)
    const closeTimersRef = useRef(new Map<string, number>())
    const tabWidthAnimationsRef = useRef(new Map<string, Animation>())
    const previousTabWidthsRef = useRef(new Map<string, number>())
    const [resizing, setResizing] = useState(false)
    const [draggedTabId, setDraggedTabId] = useState<string | null>(null)
    const [dragTargetTabId, setDragTargetTabId] = useState<string | null>(null)
    const [closingTabIds, setClosingTabIds] = useState<Set<string>>(() => new Set())
    const [tabPreview, setTabPreview] = useState<{ label: string; detail: string; left: number } | null>(null)
    const resolvedWidth = clampInspectorWidth(width, maxWidth)
    const tabIdentity = tabs.map((tab) => tab.id).join('|')
    const availableTabWidth = Math.floor(
        (resolvedWidth - TITLE_BAR_RESERVED_WIDTH - Math.max(0, tabs.length - 1) * 4) / Math.max(1, tabs.length)
    )
    const targetWorkspaceTabWidth = Math.max(
        MIN_WORKSPACE_TAB_WIDTH,
        Math.min(MAX_WORKSPACE_TAB_WIDTH, availableTabWidth)
    )

    useLayoutEffect(() => {
        const rail = tabRailRef.current
        if (!rail) return
        const currentTabIds = new Set<string>()
        for (const element of rail.querySelectorAll<HTMLElement>('[data-inspector-tab-id]')) {
            const tabId = element.dataset.inspectorTabId
            if (!tabId) continue
            currentTabIds.add(tabId)
            const runningAnimation = tabWidthAnimationsRef.current.get(tabId)
            const displayedWidth = runningAnimation
                ? element.getBoundingClientRect().width
                : previousTabWidthsRef.current.get(tabId) ?? targetWorkspaceTabWidth
            runningAnimation?.cancel()
            tabWidthAnimationsRef.current.delete(tabId)
            if (Math.abs(displayedWidth - targetWorkspaceTabWidth) > 0.5) {
                const animation = element.animate(
                    [
                        { width: `${displayedWidth}px` },
                        { width: `${targetWorkspaceTabWidth}px` }
                    ],
                    {
                        duration: 240,
                        easing: 'cubic-bezier(0.22, 1, 0.36, 1)'
                    }
                )
                tabWidthAnimationsRef.current.set(tabId, animation)
                animation.addEventListener('finish', () => {
                    if (tabWidthAnimationsRef.current.get(tabId) === animation) {
                        tabWidthAnimationsRef.current.delete(tabId)
                    }
                }, { once: true })
            }
            previousTabWidthsRef.current.set(tabId, targetWorkspaceTabWidth)
        }
        for (const [tabId, animation] of tabWidthAnimationsRef.current) {
            if (currentTabIds.has(tabId)) continue
            animation.cancel()
            tabWidthAnimationsRef.current.delete(tabId)
            previousTabWidthsRef.current.delete(tabId)
        }
    }, [tabIdentity, targetWorkspaceTabWidth])

    const stopResize = useCallback((pointerId: number, handle: HTMLButtonElement) => {
        const state = resizeStateRef.current
        if (!state || state.pointerId !== pointerId) return
        resizeStateRef.current = null
        if (resizeFrameRef.current) window.cancelAnimationFrame(resizeFrameRef.current)
        resizeFrameRef.current = 0
        rootRef.current?.style.setProperty('width', `${state.width}px`)
        rootRef.current?.style.removeProperty('transition')
        titleBarSurfaceRef.current?.style.setProperty('width', `${state.width}px`)
        titleBarSurfaceRef.current?.style.removeProperty('transition')
        setResizing(false)
        onWidthChange(state.width)
        if (handle.hasPointerCapture(pointerId)) handle.releasePointerCapture(pointerId)
        document.body.style.removeProperty('cursor')
        document.body.style.removeProperty('user-select')
    }, [onWidthChange])

    const handleResizePointerDown = useCallback((event: React.PointerEvent<HTMLButtonElement>) => {
        if (!open || event.button !== 0) return
        event.preventDefault()
        event.currentTarget.setPointerCapture(event.pointerId)
        rootRef.current?.style.setProperty('transition', 'none')
        titleBarSurfaceRef.current?.style.setProperty('transition', 'none')
        resizeStateRef.current = {
            pointerId: event.pointerId,
            startX: event.clientX,
            startWidth: resolvedWidth,
            width: resolvedWidth
        }
        setResizing(true)
        document.body.style.cursor = 'col-resize'
        document.body.style.userSelect = 'none'
    }, [open, resolvedWidth])

    const handleResizePointerMove = useCallback((event: React.PointerEvent<HTMLButtonElement>) => {
        const state = resizeStateRef.current
        if (!state || state.pointerId !== event.pointerId) return
        state.width = clampInspectorWidth(state.startWidth + state.startX - event.clientX, maxWidth)
        if (resizeFrameRef.current) return
        resizeFrameRef.current = window.requestAnimationFrame(() => {
            resizeFrameRef.current = 0
            const latest = resizeStateRef.current
            if (!latest) return
            rootRef.current?.style.setProperty('width', `${latest.width}px`)
            titleBarSurfaceRef.current?.style.setProperty('width', `${latest.width}px`)
        })
    }, [maxWidth])

    const handleResizePointerEnd = useCallback((event: React.PointerEvent<HTMLButtonElement>) => {
        stopResize(event.pointerId, event.currentTarget)
    }, [stopResize])

    const dismissTabPreview = useCallback(() => {
        window.clearTimeout(previewTimerRef.current)
        window.clearTimeout(previewDismissTimerRef.current)
        setTabPreview(null)
    }, [])

    const requestTabClose = useCallback((tabId: string) => {
        if (closeTimersRef.current.has(tabId)) return
        dismissTabPreview()
        setClosingTabIds((current) => new Set(current).add(tabId))
        const timeoutId = window.setTimeout(() => {
            closeTimersRef.current.delete(tabId)
            onCloseTab(tabId)
            setClosingTabIds((current) => {
                if (!current.has(tabId)) return current
                const next = new Set(current)
                next.delete(tabId)
                return next
            })
        }, 130)
        closeTimersRef.current.set(tabId, timeoutId)
    }, [dismissTabPreview, onCloseTab])

    const handleTabPreviewEnter = useCallback((event: React.PointerEvent<HTMLDivElement>, tab: AssistantInspectorTab) => {
        dismissTabPreview()
        const visibleTabLeft = event.currentTarget.offsetLeft - (event.currentTarget.parentElement?.scrollLeft || 0)
        const left = Math.max(8, Math.min(visibleTabLeft, resolvedWidth - 190))
        previewTimerRef.current = window.setTimeout(() => {
            setTabPreview({ label: tab.label, detail: tab.preview || 'Inspector workspace', left })
            previewDismissTimerRef.current = window.setTimeout(() => setTabPreview(null), 1600)
        }, 650)
    }, [dismissTabPreview, resolvedWidth])

    const handleTabPreviewLeave = useCallback(() => {
        dismissTabPreview()
    }, [dismissTabPreview])

    useEffect(() => {
        dismissTabPreview()
        const rail = tabRailRef.current
        const activeTab = rail
            ? Array.from(rail.querySelectorAll<HTMLElement>('[data-inspector-tab-id]')).find((element) => element.dataset.inspectorTabId === activeTabId)
            : null
        if (!rail || !activeTab) return
        const timeoutId = window.setTimeout(() => {
            const tabLeft = activeTab.offsetLeft
            const tabRight = tabLeft + activeTab.offsetWidth
            if (tabLeft < rail.scrollLeft) rail.scrollLeft = tabLeft
            else if (tabRight > rail.scrollLeft + rail.clientWidth) rail.scrollLeft = tabRight - rail.clientWidth
        }, 250)
        return () => window.clearTimeout(timeoutId)
    }, [activeTabId, dismissTabPreview, tabIdentity, targetWorkspaceTabWidth])

    const handleTabRailWheel = useCallback((event: React.WheelEvent<HTMLElement>) => {
        const rail = event.currentTarget
        if (rail.scrollWidth <= rail.clientWidth) return
        const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY
        if (delta === 0) return
        event.preventDefault()
        dismissTabPreview()
        rail.scrollLeft += delta
    }, [dismissTabPreview])

    useEffect(() => {
        if (open) return
        for (const timeoutId of closeTimersRef.current.values()) window.clearTimeout(timeoutId)
        closeTimersRef.current.clear()
        setClosingTabIds((current) => current.size === 0 ? current : new Set())
    }, [open])

    useEffect(() => () => {
        window.cancelAnimationFrame(resizeFrameRef.current)
        window.clearTimeout(previewTimerRef.current)
        window.clearTimeout(previewDismissTimerRef.current)
        for (const timeoutId of closeTimersRef.current.values()) window.clearTimeout(timeoutId)
        closeTimersRef.current.clear()
        for (const animation of tabWidthAnimationsRef.current.values()) animation.cancel()
        tabWidthAnimationsRef.current.clear()
        previousTabWidthsRef.current.clear()
        document.body.style.removeProperty('cursor')
        document.body.style.removeProperty('user-select')
    }, [])

    const titleBarRegion = useMemo(() => (
        <div
            ref={titleBarSurfaceRef}
            className={cn(
                'drag-region relative h-full shrink-0 overflow-visible transition-[width,opacity] duration-[360ms] ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none',
                !open && 'pointer-events-none opacity-0'
            )}
            style={{ width: open ? `${resolvedWidth}px` : '0px' }}
            data-assistant-inspector-titlebar=""
            data-open={open ? 'true' : 'false'}
        >
            {open ? (
                <button
                    type="button"
                    className={cn(
                        'group absolute left-0 top-0 z-[4] flex h-full w-3 -translate-x-1/2 cursor-col-resize items-center justify-center outline-none',
                        resizing && 'bg-[var(--accent-primary)]/[0.04]'
                    )}
                    aria-label="Resize inspector workspace from title bar"
                    onPointerDown={handleResizePointerDown}
                    onPointerMove={handleResizePointerMove}
                    onPointerUp={handleResizePointerEnd}
                    onPointerCancel={handleResizePointerEnd}
                >
                    <span className="h-5 w-px bg-transparent transition-colors group-hover:bg-[var(--surface-panel-divider)]" />
                </button>
            ) : null}
            <div
                className="zyra-inspector-surface flex h-full min-w-0 items-center overflow-hidden border-l border-[var(--surface-panel-divider)]"
                style={{ paddingRight: 'var(--zyra-titlebar-controls-width, 120px)' }}
            >
                <nav
                    ref={tabRailRef}
                    onWheel={handleTabRailWheel}
                    className="no-scrollbar flex h-full min-w-0 flex-1 items-center gap-1 overflow-x-auto overscroll-x-contain px-2"
                    aria-label="Workspace tabs"
                >
                    {tabs.map((tab) => {
                        const active = tab.id === activeTabId
                        const closing = closingTabIds.has(tab.id)
                        return (
                            <div
                                key={tab.id}
                                data-inspector-tab-id={tab.id}
                                draggable={!closing}
                                onDragStart={(event) => {
                                    dismissTabPreview()
                                    setDraggedTabId(tab.id)
                                    setDragTargetTabId(null)
                                    event.dataTransfer.effectAllowed = 'move'
                                    event.dataTransfer.setData('text/plain', tab.id)
                                }}
                                onDragEnter={() => {
                                    if (draggedTabId && draggedTabId !== tab.id) setDragTargetTabId(tab.id)
                                }}
                                onDragOver={(event) => {
                                    if (!draggedTabId || draggedTabId === tab.id) return
                                    event.preventDefault()
                                    event.dataTransfer.dropEffect = 'move'
                                }}
                                onDrop={(event) => {
                                    event.preventDefault()
                                    if (draggedTabId && draggedTabId !== tab.id) onReorderTab(draggedTabId, tab.id)
                                    setDraggedTabId(null)
                                    setDragTargetTabId(null)
                                }}
                                onDragEnd={() => {
                                    setDraggedTabId(null)
                                    setDragTargetTabId(null)
                                }}
                                onPointerEnter={(event) => handleTabPreviewEnter(event, tab)}
                                onPointerLeave={handleTabPreviewLeave}
                                style={{ width: targetWorkspaceTabWidth }}
                                className={cn(
                                    'inspector-workspace-tab no-drag group/tab relative flex h-7 shrink-0 items-center rounded-md border border-transparent',
                                    closing
                                        ? 'pointer-events-none animate-[inspector-tab-out_130ms_ease-in_both]'
                                        : 'animate-[inspector-tab-in_150ms_ease-out_both]',
                                    draggedTabId === tab.id && 'opacity-45',
                                    dragTargetTabId === tab.id && 'bg-[color-mix(in_srgb,var(--accent-primary)_7%,var(--color-card))]',
                                    active
                                        ? 'bg-[var(--surface-inspector-tab)] text-sparkle-text shadow-[inset_0_1px_0_color-mix(in_srgb,var(--color-text)_5%,transparent)]'
                                        : tab.attention
                                            ? 'border-amber-300/20 bg-amber-400/[0.07] text-amber-100'
                                            : 'text-sparkle-text-muted/65 hover:bg-[var(--surface-hover)] hover:text-sparkle-text-secondary'
                                )}
                            >
                                <button
                                    type="button"
                                    onClick={() => {
                                        dismissTabPreview()
                                        onSelectTab(tab.id)
                                    }}
                                    className="inline-flex h-full min-w-0 flex-1 items-center justify-start gap-1.5 overflow-hidden pl-2 pr-1 text-left text-[10px] font-medium"
                                    aria-current={active ? 'page' : undefined}
                                >
                                    <span className={cn(active ? 'text-[var(--accent-primary)]/85' : 'text-current')}>
                                        {tab.loading ? <LoaderCircle size={11} className="animate-spin" /> : tab.icon}
                                    </span>
                                    <span className="min-w-0 flex-1 truncate text-left">{tab.label}</span>
                                    {tab.statusIcon ? <span className="shrink-0 text-[var(--accent-primary)]" title={`${tab.label} is playing audio`}>{tab.statusIcon}</span> : null}
                                    {tab.count !== undefined ? <span className="shrink-0 font-mono text-[8px] text-sparkle-text-muted/55">{tab.count}</span> : null}
                                </button>
                                {tab.loading ? (
                                    <span className="pointer-events-none absolute inset-x-1 bottom-0 h-px overflow-hidden rounded-full bg-[color-mix(in_srgb,var(--accent-primary)_12%,transparent)]">
                                        <span className="block h-full w-full origin-left bg-[var(--accent-primary)] inspector-tab-loading" />
                                    </span>
                                ) : null}
                                {tab.closable ? (
                                    <button
                                        type="button"
                                        onClick={() => requestTabClose(tab.id)}
                                        className="mr-1 inline-flex size-4 shrink-0 items-center justify-center rounded text-sparkle-text-muted/50 opacity-0 transition-opacity hover:bg-[var(--surface-hover)] hover:text-sparkle-text focus:opacity-100 group-hover/tab:opacity-100"
                                        aria-label={`Close ${tab.label}`}
                                    >
                                        <X size={9} />
                                    </button>
                                ) : null}
                            </div>
                        )
                    })}
                    <FileActionsMenu
                        items={addTabItems}
                        title="Add Inspector workspace"
                        triggerIcon={<Plus size={13} />}
                        presentation="portal"
                        preferredDirection="down"
                        density="compact"
                        buttonClassName="no-drag size-7 shrink-0 rounded-md text-sparkle-text-muted/60 hover:bg-[var(--surface-hover)] hover:text-sparkle-text"
                        openButtonClassName="bg-[var(--surface-hover)] text-sparkle-text"
                    />
                </nav>
            </div>
        </div>
    ), [
        activeTabId,
        closingTabIds,
        dismissTabPreview,
        draggedTabId,
        dragTargetTabId,
        handleResizePointerDown,
        handleResizePointerEnd,
        handleResizePointerMove,
        handleTabPreviewEnter,
        handleTabPreviewLeave,
        handleTabRailWheel,
        addTabItems,
        onReorderTab,
        onSelectTab,
        open,
        requestTabClose,
        resizing,
        resolvedWidth,
        tabs,
        targetWorkspaceTabWidth
    ])
    usePublishAssistantTitleBarEndRegion(titleBarRegion, open)

    return (
        <div
            ref={rootRef}
            className={cn(
                'relative shrink-0 overflow-visible [contain:layout]',
                !resizing && 'transition-[width] duration-[360ms] ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none',
                !open && 'pointer-events-none'
            )}
            style={{ width: open ? `${resolvedWidth}px` : '0px' }}
        >
            {open ? (
                <button
                    type="button"
                    className={cn(
                        'group absolute left-0 top-0 z-30 flex h-full w-3 -translate-x-1/2 cursor-col-resize items-center justify-center outline-none',
                        resizing && 'bg-[var(--accent-primary)]/[0.04]'
                    )}
                    aria-label="Resize inspector workspace"
                    onPointerDown={handleResizePointerDown}
                    onPointerMove={handleResizePointerMove}
                    onPointerUp={handleResizePointerEnd}
                    onPointerCancel={handleResizePointerEnd}
                >
                    <span className="flex h-10 w-2 items-center justify-center rounded-full text-transparent transition-colors group-hover:bg-white/[0.055] group-hover:text-sparkle-text-muted">
                        <GripVertical size={10} />
                    </span>
                </button>
            ) : null}

            <div className="absolute inset-0 overflow-hidden">
            <aside
                className={cn(
                    'flex h-full min-h-0 flex-col overflow-hidden border-l border-[var(--surface-panel-divider)] bg-sparkle-bg [contain:layout_paint] transform-gpu transition-[transform,opacity] duration-[320ms] ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none',
                    resizing ? 'relative w-full' : 'absolute inset-y-0 right-0',
                    open ? 'translate-x-0 opacity-100' : 'translate-x-4 opacity-0'
                )}
                style={resizing ? undefined : { width: `${resolvedWidth}px` }}
                aria-label="Assistant inspector workspace"
                aria-hidden={!open}
            >
                {tabPreview ? (
                    <div
                        className="pointer-events-none absolute top-2 z-40 w-[184px] rounded-2xl border border-[color-mix(in_srgb,var(--color-text)_11%,transparent)] bg-[color-mix(in_srgb,var(--color-card)_92%,var(--color-bg))] px-3 py-2.5 shadow-[0_14px_34px_rgba(0,0,0,0.28),inset_0_1px_0_color-mix(in_srgb,var(--color-text)_5%,transparent)] animate-[inspector-tab-in_140ms_ease-out_both]"
                        style={{ left: tabPreview.left }}
                        role="tooltip"
                    >
                        <div className="truncate text-[10px] font-semibold text-sparkle-text">{tabPreview.label}</div>
                        <div className="mt-0.5 line-clamp-2 text-[9px] leading-3.5 text-sparkle-text-muted/75">{tabPreview.detail}</div>
                    </div>
                ) : null}

                {children}
            </aside>
            </div>
        </div>
    )
}
