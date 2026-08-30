import { memo, useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { ArrowRight, ChevronDown, FileSearch, Files, LoaderCircle, Search, TriangleAlert } from 'lucide-react'
import { AnimatedHeight } from '@/components/ui/AnimatedHeight'
import { AssistantReviewTurnStatusBadge } from './AssistantReviewTurnStatusBadge'
import { FileEntryIcon } from '@/components/ui/FileEntryIcon'
import MarkdownRenderer from '@/components/ui/MarkdownRenderer'
import { formatAssistantRelativeTime } from '@/lib/assistant/selectors'
import { useSettings } from '@/lib/settings'
import { markdownToPlainText } from '@/lib/text-layout/markdown-blocks'
import { cn } from '@/lib/utils'
import type { AssistantDiffTarget, AssistantDiffTurn } from './assistant-diff-types'

type ReviewTurnFilter = 'all' | 'latest' | 'with-changes' | 'without-changes'
type ReviewPreviewMode = 'glance' | 'complete'

const INITIAL_VISIBLE_TURNS = 40
const LATEST_TURN_LIMIT = 10
const VISIBLE_FILE_LINK_LIMIT = 2
const MASTER_DETAIL_VISIBLE_FILE_LIMIT = 5
const INLINE_TOOLBAR_MIN_WIDTH = 720
const MASTER_DETAIL_MIN_WIDTH = 1120
const MASTER_RAIL_MIN_WIDTH = 260
const MASTER_RAIL_DEFAULT_WIDTH = 320
const MASTER_RAIL_MAX_WIDTH = 480
const MASTER_RAIL_MAX_RATIO = 0.44
const MASTER_RAIL_STORAGE_KEY = 'assistant-review-master-rail-width:v1'
const RESPONSE_DISCLOSURE_MOTION_MS = 380
const RESPONSE_DISCLOSURE_ROW_HEIGHT_PX = 28
const RESPONSE_DISCLOSURE_OVERFLOW_EPSILON_PX = 4

const FILTERS: Array<{ id: ReviewTurnFilter; label: string }> = [
    { id: 'all', label: 'All' },
    { id: 'latest', label: 'Latest' },
    { id: 'with-changes', label: 'Changes' },
    { id: 'without-changes', label: 'No changes' }
]

function fileCountLabel(count: number): string {
    return `${count} ${count === 1 ? 'file' : 'files'}`
}

function editCountLabel(count: number): string {
    return `${count} ${count === 1 ? 'edit' : 'edits'}`
}

function AgentDidNotRespondNotice({ className }: { className?: string }) {
    return (
        <span className={cn('inline-flex items-center text-amber-200/65', className)}>
            Agent did not respond
        </span>
    )
}

function readStoredMasterRailWidth(): number {
    if (typeof window === 'undefined') return MASTER_RAIL_DEFAULT_WIDTH
    const value = Number(window.localStorage.getItem(MASTER_RAIL_STORAGE_KEY))
    return Number.isFinite(value)
        ? Math.min(MASTER_RAIL_MAX_WIDTH, Math.max(MASTER_RAIL_MIN_WIDTH, value))
        : MASTER_RAIL_DEFAULT_WIDTH
}

function clampMasterRailWidth(width: number, containerWidth: number): number {
    const maxWidth = Math.max(
        MASTER_RAIL_MIN_WIDTH,
        Math.min(MASTER_RAIL_MAX_WIDTH, containerWidth * MASTER_RAIL_MAX_RATIO)
    )
    return Math.max(MASTER_RAIL_MIN_WIDTH, Math.min(maxWidth, width))
}

export const AssistantReviewLanding = memo(function AssistantReviewLanding({
    threadId,
    turns,
    activeTurnId,
    ready,
    loading,
    error,
    previewMode = 'glance',
    onPreviewTurn,
    onOpenTurn,
    onOpenFile
}: {
    threadId: string | null
    turns: AssistantDiffTurn[]
    activeTurnId: string | null
    ready: boolean
    loading: boolean
    error: string | null
    previewMode?: ReviewPreviewMode
    onPreviewTurn?: (turnId: string) => void
    onOpenTurn: (turnId: string) => void
    onOpenFile: (turnId: string, target: AssistantDiffTarget) => void
}) {
    const { settings } = useSettings()
    const iconTheme = settings.appearanceResolvedMode
    const rootRef = useRef<HTMLElement | null>(null)
    const masterDetailScrollRef = useRef<HTMLDivElement | null>(null)
    const responsePreviewViewportRef = useRef<HTMLDivElement | null>(null)
    const responsePreviewContentRef = useRef<HTMLDivElement | null>(null)
    const masterRailResizeFrameRef = useRef<number | null>(null)
    const masterRailResizeStartRef = useRef<{ pointerX: number; width: number } | null>(null)
    const pendingMasterRailWidthRef = useRef<number | null>(null)
    const [masterRailWidth, setMasterRailWidth] = useState(readStoredMasterRailWidth)
    const [query, setQuery] = useState('')
    const deferredQuery = useDeferredValue(query)
    const [filter, setFilter] = useState<ReviewTurnFilter>('all')
    const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE_TURNS)
    const [persistedSearchTurnIds, setPersistedSearchTurnIds] = useState<ReadonlySet<string> | null>(null)
    const [layoutWidth, setLayoutWidth] = useState<number | null>(null)
    const [previewTurnId, setPreviewTurnId] = useState<string | null>(null)
    const [expandedResponseTurnId, setExpandedResponseTurnId] = useState<string | null>(null)
    const [collapsingResponseTurnId, setCollapsingResponseTurnId] = useState<string | null>(null)
    const [expandableResponseTurnId, setExpandableResponseTurnId] = useState<string | null>(null)
    const filteredTurns = useMemo(() => {
        const normalizedQuery = deferredQuery.trim().toLowerCase()
        let next = filter === 'latest'
            ? turns.slice(0, LATEST_TURN_LIMIT)
            : filter === 'with-changes'
                ? turns.filter((turn) => turn.changes.length > 0)
                : filter === 'without-changes'
                    ? turns.filter((turn) => turn.changes.length === 0)
                    : turns
        if (normalizedQuery) {
            next = next.filter((turn) => turn.searchText.includes(normalizedQuery) || persistedSearchTurnIds?.has(turn.id))
        }
        return next
    }, [deferredQuery, filter, persistedSearchTurnIds, turns])
    const visibleTurns = filteredTurns.slice(0, visibleCount)
    const hiddenTurnCount = Math.max(0, filteredTurns.length - visibleTurns.length)
    const previewTurn = filteredTurns.find((turn) => turn.id === previewTurnId) || visibleTurns[0] || null
    const responseExpanded = Boolean(previewTurn && expandedResponseTurnId === previewTurn.id)
    const responseCollapsing = Boolean(previewTurn && collapsingResponseTurnId === previewTurn.id)
    const responseCanExpand = Boolean(previewTurn && expandableResponseTurnId === previewTurn.id)
    const responseDisclosureOpen = responseExpanded || responseCollapsing
    const masterDetail = layoutWidth !== null && layoutWidth >= MASTER_DETAIL_MIN_WIDTH
    const inlineToolbar = layoutWidth !== null && layoutWidth >= INLINE_TOOLBAR_MIN_WIDTH
    const responseExcerptByTurnId = useMemo(
        () => new Map(turns.map((turn) => [turn.id, markdownToPlainText(turn.response)])),
        [turns]
    )

    useEffect(() => {
        setVisibleCount(INITIAL_VISIBLE_TURNS)
    }, [filter, query])

    useLayoutEffect(() => {
        const root = rootRef.current
        if (!root) return
        const updateLayout = () => {
            const width = root.clientWidth
            if (width <= 0) return
            setLayoutWidth((current) => current === width ? current : width)
            if (width >= MASTER_DETAIL_MIN_WIDTH) {
                setMasterRailWidth((current) => clampMasterRailWidth(current, width))
            }
        }
        updateLayout()
        if (typeof ResizeObserver === 'undefined') {
            window.addEventListener('resize', updateLayout)
            return () => window.removeEventListener('resize', updateLayout)
        }
        const observer = new ResizeObserver(updateLayout)
        observer.observe(root)
        return () => observer.disconnect()
    }, [])

    useEffect(() => {
        if (!previewTurn || previewTurn.detailLoaded !== false || previewTurn.id === activeTurnId) return
        onPreviewTurn?.(previewTurn.id)
    }, [activeTurnId, onPreviewTurn, previewTurn])

    useEffect(() => {
        if (!previewTurn) return
        const pane = masterDetailScrollRef.current
        if (pane) pane.scrollTop = 0
    }, [previewTurn?.id])

    useEffect(() => {
        if (!collapsingResponseTurnId) return
        const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true
        const timeoutId = window.setTimeout(() => {
            setCollapsingResponseTurnId((current) => current === collapsingResponseTurnId ? null : current)
        }, reduceMotion ? 0 : RESPONSE_DISCLOSURE_MOTION_MS)
        return () => window.clearTimeout(timeoutId)
    }, [collapsingResponseTurnId])

    useEffect(() => {
        const turnId = previewTurn?.id || null
        const eligible = Boolean(
            turnId
            && previewMode === 'glance'
            && previewTurn?.files.length
            && masterDetail
        )
        if (!eligible) {
            setExpandableResponseTurnId(null)
            return
        }
        const viewport = responsePreviewViewportRef.current
        const content = responsePreviewContentRef.current
        if (!viewport || !content || !turnId) return

        let animationFrameId = 0
        const measureOverflow = () => {
            if (expandedResponseTurnId === turnId || collapsingResponseTurnId === turnId) return
            const reservedControlHeight = expandableResponseTurnId === turnId
                ? RESPONSE_DISCLOSURE_ROW_HEIGHT_PX
                : 0
            const collapsedThreshold = viewport.clientHeight + reservedControlHeight
            const overflows = content.scrollHeight > collapsedThreshold + RESPONSE_DISCLOSURE_OVERFLOW_EPSILON_PX
            setExpandableResponseTurnId((current) => overflows
                ? turnId
                : current === turnId ? null : current)
        }
        const scheduleMeasure = () => {
            window.cancelAnimationFrame(animationFrameId)
            animationFrameId = window.requestAnimationFrame(measureOverflow)
        }
        scheduleMeasure()
        if (typeof ResizeObserver === 'undefined') {
            window.addEventListener('resize', scheduleMeasure)
            return () => {
                window.cancelAnimationFrame(animationFrameId)
                window.removeEventListener('resize', scheduleMeasure)
            }
        }
        const observer = new ResizeObserver(scheduleMeasure)
        observer.observe(viewport)
        observer.observe(content)
        return () => {
            window.cancelAnimationFrame(animationFrameId)
            observer.disconnect()
        }
    }, [
        collapsingResponseTurnId,
        expandableResponseTurnId,
        expandedResponseTurnId,
        masterDetail,
        previewMode,
        previewTurn?.files.length,
        previewTurn?.id,
        previewTurn?.response
    ])

    useEffect(() => () => {
        if (masterRailResizeFrameRef.current !== null) window.cancelAnimationFrame(masterRailResizeFrameRef.current)
    }, [])

    useEffect(() => {
        const normalizedQuery = deferredQuery.trim()
        if (!threadId || !normalizedQuery) {
            setPersistedSearchTurnIds(null)
            return
        }
        setPersistedSearchTurnIds(null)
        let cancelled = false
        const timeoutId = window.setTimeout(() => {
            void window.devscope.assistant.searchTurns({ threadId, query: normalizedQuery }).then((result) => {
                if (cancelled || !result.success) return
                setPersistedSearchTurnIds(new Set(result.result.turnIds))
            })
        }, 160)
        return () => {
            cancelled = true
            window.clearTimeout(timeoutId)
        }
    }, [deferredQuery, threadId])

    const handleTurnIntent = (turn: AssistantDiffTurn) => {
        if (masterDetail) {
            setPreviewTurnId(turn.id)
            return
        }
        onOpenTurn(turn.id)
    }

    const handleResponseDisclosure = () => {
        if (!previewTurn || !responseCanExpand || responseCollapsing) return
        if (responseExpanded) {
            setCollapsingResponseTurnId(previewTurn.id)
            setExpandedResponseTurnId(null)
            return
        }
        setExpandedResponseTurnId(previewTurn.id)
    }

    const applyPendingMasterRailWidth = () => {
        masterRailResizeFrameRef.current = null
        const nextWidth = pendingMasterRailWidthRef.current
        if (nextWidth !== null) setMasterRailWidth(nextWidth)
    }

    const handleMasterRailResizePointerDown = (event: PointerEvent<HTMLButtonElement>) => {
        if (!rootRef.current) return
        event.preventDefault()
        event.currentTarget.setPointerCapture(event.pointerId)
        masterRailResizeStartRef.current = { pointerX: event.clientX, width: masterRailWidth }
        pendingMasterRailWidthRef.current = masterRailWidth
    }

    const handleMasterRailResizePointerMove = (event: PointerEvent<HTMLButtonElement>) => {
        const resizeStart = masterRailResizeStartRef.current
        const root = rootRef.current
        if (!resizeStart || !root) return
        pendingMasterRailWidthRef.current = clampMasterRailWidth(
            resizeStart.width + event.clientX - resizeStart.pointerX,
            root.clientWidth
        )
        if (masterRailResizeFrameRef.current === null) {
            masterRailResizeFrameRef.current = window.requestAnimationFrame(applyPendingMasterRailWidth)
        }
    }

    const finishMasterRailResize = (event: PointerEvent<HTMLButtonElement>) => {
        if (!masterRailResizeStartRef.current) return
        if (masterRailResizeFrameRef.current !== null) {
            window.cancelAnimationFrame(masterRailResizeFrameRef.current)
            masterRailResizeFrameRef.current = null
        }
        const nextWidth = pendingMasterRailWidthRef.current ?? masterRailWidth
        setMasterRailWidth(nextWidth)
        window.localStorage.setItem(MASTER_RAIL_STORAGE_KEY, String(Math.round(nextWidth)))
        masterRailResizeStartRef.current = null
        pendingMasterRailWidthRef.current = null
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            event.currentTarget.releasePointerCapture(event.pointerId)
        }
    }

    const handleMasterRailResizeKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
        if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
        const root = rootRef.current
        if (!root) return
        event.preventDefault()
        const step = event.shiftKey ? 24 : 8
        const nextWidth = clampMasterRailWidth(
            masterRailWidth + (event.key === 'ArrowRight' ? step : -step),
            root.clientWidth
        )
        setMasterRailWidth(nextWidth)
        window.localStorage.setItem(MASTER_RAIL_STORAGE_KEY, String(Math.round(nextWidth)))
    }

    const renderFilters = () => (
        <div className="no-scrollbar flex shrink-0 gap-1 overflow-x-auto" aria-label="Turn filters">
            {FILTERS.map((entry) => (
                <button
                    key={entry.id}
                    type="button"
                    onClick={() => setFilter(entry.id)}
                    className={cn(
                        'border-b-2 px-2.5 py-2 text-[10px] font-semibold transition-colors duration-75',
                        filter === entry.id
                            ? 'border-[var(--accent-primary)] text-sparkle-text'
                            : 'border-transparent text-sparkle-text-muted/60 hover:bg-[color-mix(in_srgb,var(--color-text)_4%,transparent)] hover:text-sparkle-text-secondary'
                    )}
                    aria-pressed={filter === entry.id}
                >
                    {entry.label}
                </button>
            ))}
        </div>
    )

    const renderLoadingOrEmpty = () => !ready ? (
        <div className="flex min-h-52 items-center justify-center px-7 text-center">
            {error ? (
                <div>
                    <TriangleAlert size={18} className="mx-auto text-amber-300/75" />
                    <p className="mt-3 text-[12px] font-medium text-sparkle-text-secondary">Could not build the Review index</p>
                    <p className="mt-1 text-[10px] leading-4 text-sparkle-text-muted/70">{error}</p>
                </div>
            ) : (
                <div>
                    <LoaderCircle size={18} className="mx-auto animate-spin text-[var(--accent-primary)]/70" />
                    <p className="mt-3 text-[11px] text-sparkle-text-muted/70">Building the complete turn index…</p>
                </div>
            )}
        </div>
    ) : visibleTurns.length === 0 ? (
        <div className="flex min-h-52 items-center justify-center px-7 text-center">
            <div>
                <FileSearch size={18} className="mx-auto text-sparkle-text-muted/55" />
                <p className="mt-3 text-[12px] font-medium text-sparkle-text-secondary">No matching turns</p>
                <p className="mt-1 text-[10px] leading-4 text-sparkle-text-muted/70">Try another search or filter.</p>
            </div>
        </div>
    ) : null

    const renderEarlierTurnsButton = () => hiddenTurnCount > 0 ? (
        <button
            type="button"
            onClick={() => setVisibleCount((current) => current + INITIAL_VISIBLE_TURNS)}
            className="flex h-10 w-full items-center justify-center border-b border-[color-mix(in_srgb,var(--color-text)_8%,transparent)] text-[10px] font-medium text-sparkle-text-muted/65 hover:bg-sparkle-card/40 hover:text-sparkle-text-secondary"
        >
            Show earlier turns · {hiddenTurnCount} remaining
        </button>
    ) : null

    const renderMasterTurnRow = (turn: AssistantDiffTurn) => {
        const selected = previewTurn?.id === turn.id
        return (
            <div
                key={turn.id}
                role="option"
                aria-selected={selected}
                tabIndex={0}
                onClick={() => handleTurnIntent(turn)}
                onKeyDown={(event) => {
                    if (event.key !== 'Enter' && event.key !== ' ') return
                    event.preventDefault()
                    handleTurnIntent(turn)
                }}
                className={cn(
                    'assistant-review-landing__master-turn group relative grid cursor-pointer grid-cols-[2.75rem_minmax(0,1fr)] gap-2.5 border-b border-[color-mix(in_srgb,var(--color-text)_8%,transparent)] px-3 py-3 outline-none transition-[background-color,box-shadow] duration-75',
                    selected
                        ? 'bg-[color-mix(in_srgb,var(--color-card)_74%,var(--color-bg))] shadow-[inset_2px_0_0_color-mix(in_srgb,var(--accent-primary)_68%,transparent)]'
                        : 'hover:bg-[color-mix(in_srgb,var(--color-card)_56%,var(--color-bg))] focus-visible:bg-[color-mix(in_srgb,var(--color-card)_68%,var(--color-bg))]'
                )}
            >
                <div className="min-w-0 font-mono">
                    <span className={cn('block text-[10px]', selected ? 'text-[var(--accent-primary)]' : 'text-sparkle-text-muted/65')}>#{turn.number}</span>
                    <span className="mt-1 block text-[8px] text-sparkle-text-muted/40">{formatAssistantRelativeTime(turn.updatedAt)}</span>
                </div>
                <div className="min-w-0">
                    <div className="min-w-0">
                        <p className="line-clamp-2 min-w-0 text-[11px] font-semibold leading-[1.45] text-sparkle-text">{turn.prompt}</p>
                    </div>
                    {turn.responseAvailable ? (
                        <p className="mt-1 line-clamp-1 text-[10px] leading-4 text-sparkle-text-muted/65">{responseExcerptByTurnId.get(turn.id) || turn.response}</p>
                    ) : <AgentDidNotRespondNotice className="mt-1 text-[9px] leading-4" />}
                    <div className="mt-2 flex min-h-4 items-center gap-2 font-mono text-[8px]">
                        {turn.files.length > 0 ? (
                            <>
                                <span className="inline-flex items-center gap-1 text-[var(--accent-primary)]/75">
                                    <Files size={9} /> {fileCountLabel(turn.files.length)}
                                </span>
                                <span className="text-emerald-300/80">+{turn.additions}</span>
                                <span className="text-red-300/70">−{turn.deletions}</span>
                                {turn.changes.length > turn.files.length ? <span className="text-sparkle-text-muted/45">· {editCountLabel(turn.changes.length)}</span> : null}
                            </>
                        ) : <span className="italic text-sparkle-text-muted/30">No diff</span>}
                        {turn.reviewStatus ? <span className="text-sparkle-text-muted/25">·</span> : null}
                        <AssistantReviewTurnStatusBadge status={turn.reviewStatus} compact />
                    </div>
                </div>
            </div>
        )
    }

    const renderMasterDetail = () => {
        const glance = previewMode === 'glance'
        const hasChangedFiles = Boolean(previewTurn?.files.length)
        const usePageScroll = !glance || !hasChangedFiles || responseDisclosureOpen
        const visibleFiles = previewTurn?.files.slice(0, MASTER_DETAIL_VISIBLE_FILE_LIMIT) || []
        const remainingFiles = Math.max(0, (previewTurn?.files.length || 0) - visibleFiles.length)
        return (
            <div className="relative flex min-h-0 flex-1">
                <div
                    data-assistant-capsule-scroll="review-turn-list"
                    className="assistant-review-landing__master-rail assistant-review-scroll-gutter shrink-0 overflow-y-auto border-r border-[color-mix(in_srgb,var(--color-text)_9%,transparent)] custom-scrollbar"
                    style={{ width: `${masterRailWidth}px` }}
                    role="listbox"
                    aria-label="Chat turns"
                >
                    {renderLoadingOrEmpty() || visibleTurns.map(renderMasterTurnRow)}
                    {renderEarlierTurnsButton()}
                </div>

                <button
                    type="button"
                    role="separator"
                    aria-orientation="vertical"
                    aria-label="Resize Review turn list"
                    aria-valuemin={MASTER_RAIL_MIN_WIDTH}
                    aria-valuemax={MASTER_RAIL_MAX_WIDTH}
                    aria-valuenow={Math.round(masterRailWidth)}
                    title="Resize turn list"
                    className="group/review-resizer absolute inset-y-0 z-20 w-2 -translate-x-1/2 cursor-col-resize touch-none outline-none"
                    style={{ left: `${masterRailWidth}px` }}
                    onPointerDown={handleMasterRailResizePointerDown}
                    onPointerMove={handleMasterRailResizePointerMove}
                    onPointerUp={finishMasterRailResize}
                    onPointerCancel={finishMasterRailResize}
                    onKeyDown={handleMasterRailResizeKeyDown}
                >
                    <span className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-transparent transition-colors group-hover/review-resizer:bg-[var(--accent-primary)]/35 group-focus-visible/review-resizer:bg-[var(--accent-primary)]/45" />
                </button>

                <div ref={masterDetailScrollRef} data-assistant-capsule-scroll="review-preview" className="assistant-review-landing__master-detail assistant-review-scroll-gutter min-w-0 flex-1 overflow-y-auto custom-scrollbar">
                    {previewTurn ? (
                        <div className={cn(
                            'mx-auto flex w-full max-w-[58rem] flex-col px-8 xl:px-12',
                            usePageScroll ? 'min-h-full py-6' : 'h-full min-h-0 overflow-hidden py-6'
                        )}>
                            <div className="assistant-review-sticky-turn-bar sticky top-0 z-10 flex h-7 shrink-0 flex-wrap items-center justify-between gap-3 bg-[color-mix(in_srgb,var(--color-bg)_98%,black)]">
                                <div className="flex items-center gap-2.5">
                                    <span className="text-[10px] font-bold tracking-[-0.01em] text-[var(--accent-primary)]">Turn #{previewTurn.number}</span>
                                    <span className="h-3 w-px bg-[color-mix(in_srgb,var(--color-text)_12%,transparent)]" aria-hidden="true" />
                                    <span className="font-mono text-[8px] text-sparkle-text-muted/45">{formatAssistantRelativeTime(previewTurn.updatedAt)}</span>
                                    {previewTurn.files.length > 0 ? (
                                        <>
                                            <span className="h-3 w-px bg-[color-mix(in_srgb,var(--color-text)_12%,transparent)]" aria-hidden="true" />
                                            <span className="inline-flex items-center gap-1 font-mono text-[8px] font-semibold uppercase tracking-[0.04em] text-emerald-300/80">
                                                <Files size={10} /> {fileCountLabel(previewTurn.files.length)} changed
                                            </span>
                                        </>
                                    ) : (
                                        <>
                                            <span className="h-3 w-px bg-[color-mix(in_srgb,var(--color-text)_9%,transparent)]" aria-hidden="true" />
                                            <span className="font-mono text-[8px] italic text-sparkle-text-muted/30">No diff</span>
                                        </>
                                    )}
                                    {previewTurn.reviewStatus ? <span className="text-sparkle-text-muted/25">·</span> : null}
                                    <AssistantReviewTurnStatusBadge status={previewTurn.reviewStatus} />
                                </div>
                                <button
                                    type="button"
                                    onClick={() => onOpenTurn(previewTurn.id)}
                                    className="inline-flex h-7 items-center gap-1.5 px-1.5 text-[10px] font-semibold text-[var(--accent-primary)]/85 hover:bg-white/[0.035] hover:text-[var(--accent-primary)]"
                                >
                                    View full turn <ArrowRight size={11} />
                                </button>
                            </div>
                            <header className="shrink-0 border-b border-[color-mix(in_srgb,var(--color-text)_8%,transparent)] pb-4">
                                <h2 className={cn(
                                    'mt-4 max-w-[50rem] text-[18px] font-semibold leading-[1.45] tracking-[-0.015em] text-sparkle-text',
                                    glance && 'line-clamp-2'
                                )} title={previewTurn.prompt}>
                                    {previewTurn.prompt}
                                </h2>
                            </header>

                            <section className={cn(
                                'max-w-[50rem]',
                                glance && hasChangedFiles ? 'mt-5 flex min-h-0 flex-1 flex-col' : 'mt-4 shrink-0'
                            )}>
                                <h3 className="mb-2 text-[9px] font-bold uppercase tracking-[0.08em] text-sparkle-text-muted/55">Agent response</h3>
                                {!previewTurn.responseAvailable ? (
                                    <AgentDidNotRespondNotice className="text-[11px]" />
                                ) : glance && hasChangedFiles ? (
                                    <div className="relative min-h-0 flex-1">
                                        <div
                                            ref={responsePreviewViewportRef}
                                            className={cn(
                                                'assistant-review-response-fade absolute inset-0 overflow-hidden transition-opacity duration-[380ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none',
                                                responseExpanded ? 'opacity-0' : 'opacity-100 delay-75'
                                            )}
                                            aria-hidden={responseExpanded}
                                            inert={responseExpanded ? true : undefined}
                                        >
                                            <div ref={responsePreviewContentRef}>
                                                <MarkdownRenderer
                                                    content={previewTurn.response || 'No response recorded.'}
                                                    lightweight
                                                    className="assistant-review-landing__preview-markdown text-[12px] leading-[1.65] text-sparkle-text-secondary/82 [&_h1]:border-0 [&_h1]:pb-0 [&_h1]:text-sm [&_h2]:border-0 [&_h2]:pb-0 [&_h2]:text-[13px] [&_h3]:text-[12px] [&_li]:leading-[1.65] [&_p]:mb-2.5 [&_p]:leading-[1.65] [&_pre]:text-[10px] [&_code]:text-[10px]"
                                                />
                                            </div>
                                        </div>
                                        <AnimatedHeight
                                            isOpen={responseExpanded}
                                            duration={RESPONSE_DISCLOSURE_MOTION_MS}
                                            crispContent
                                            className="relative z-[1]"
                                            contentClassName="bg-[color-mix(in_srgb,var(--color-bg)_98%,black)]"
                                        >
                                            <MarkdownRenderer
                                                content={previewTurn.response || 'No response recorded.'}
                                                lightweight
                                                className="assistant-review-landing__preview-markdown text-[12px] leading-[1.65] text-sparkle-text-secondary/82 [&_h1]:border-0 [&_h1]:pb-0 [&_h1]:text-sm [&_h2]:border-0 [&_h2]:pb-0 [&_h2]:text-[13px] [&_h3]:text-[12px] [&_li]:leading-[1.65] [&_p]:mb-2.5 [&_p]:leading-[1.65] [&_pre]:text-[10px] [&_code]:text-[10px]"
                                            />
                                        </AnimatedHeight>
                                    </div>
                                ) : (
                                    <MarkdownRenderer
                                        content={previewTurn.response || 'No response recorded.'}
                                        lightweight
                                        className="assistant-review-landing__preview-markdown text-[12px] leading-[1.65] text-sparkle-text-secondary/82 [&_h1]:border-0 [&_h1]:pb-0 [&_h1]:text-sm [&_h2]:border-0 [&_h2]:pb-0 [&_h2]:text-[13px] [&_h3]:text-[12px] [&_li]:leading-[1.65] [&_p]:mb-2.5 [&_p]:leading-[1.65] [&_pre]:text-[10px] [&_code]:text-[10px]"
                                    />
                                )}
                                {glance && hasChangedFiles && responseCanExpand ? (
                                    <div
                                        className="assistant-review-response-collapse-anchor relative flex h-7 shrink-0 items-center justify-center"
                                        data-collapsing={responseCollapsing ? 'true' : 'false'}
                                    >
                                        <div className="assistant-review-response-collapse-scrim" aria-hidden="true" />
                                        <button
                                            type="button"
                                            onClick={handleResponseDisclosure}
                                            disabled={responseCollapsing}
                                            className="relative z-[1] inline-flex h-6 items-center gap-1 px-2 text-[9px] font-medium text-[var(--accent-primary)]/75 transition-colors hover:bg-white/[0.03] hover:text-[var(--accent-primary)] disabled:cursor-default motion-reduce:transition-none"
                                            aria-expanded={responseExpanded}
                                        >
                                            {responseDisclosureOpen ? 'Show less' : 'See more'}
                                            <ChevronDown
                                                size={10}
                                                className={cn(
                                                    'transition-transform duration-[380ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none',
                                                    responseExpanded && 'rotate-180'
                                                )}
                                            />
                                        </button>
                                    </div>
                                ) : null}
                            </section>

                            {hasChangedFiles ? (
                                <div className="flex max-w-[50rem] shrink-0 flex-col">
                                <section className={cn('max-w-[50rem]', glance ? 'pt-4' : 'pt-8')}>
                                    <div className="mb-2.5 flex items-center justify-between gap-3">
                                        <h3 className="text-[9px] font-bold uppercase tracking-[0.08em] text-sparkle-text-muted/55">Files changed · {previewTurn.files.length}</h3>
                                        <span className="font-mono text-[9px] text-sparkle-text-muted/55">
                                            <span className="text-emerald-300/80">+{previewTurn.additions}</span>{' '}
                                            <span className="text-red-300/70">−{previewTurn.deletions}</span>
                                            {previewTurn.changes.length > previewTurn.files.length ? ` · ${editCountLabel(previewTurn.changes.length)}` : ''}
                                        </span>
                                    </div>
                                    <div className="border border-[color-mix(in_srgb,var(--color-text)_9%,transparent)]">
                                        {visibleFiles.map((file) => (
                                            <button
                                                key={`${file.target.activityId}:${file.target.filePath}`}
                                                type="button"
                                                onClick={() => onOpenFile(previewTurn.id, file.target)}
                                                className="group/file flex h-9 w-full min-w-0 items-center gap-2.5 border-b border-[color-mix(in_srgb,var(--color-text)_7%,transparent)] px-3 text-left last:border-b-0 hover:bg-[color-mix(in_srgb,var(--color-card)_62%,var(--color-bg))]"
                                                title={`Open ${file.target.displayPath} in the full Review`}
                                            >
                                                <FileEntryIcon pathValue={file.target.filePath} kind="file" theme={iconTheme} className="size-3.5 shrink-0" />
                                                <span className="min-w-0 flex-1 truncate font-mono text-[10px] text-sparkle-text-secondary group-hover/file:text-sparkle-text">{file.target.displayPath}</span>
                                                <span className="inline-flex shrink-0 gap-1.5 font-mono text-[9px]">
                                                    <span className="text-emerald-300/80">+{file.additions}</span>
                                                    <span className="text-red-300/70">−{file.deletions}</span>
                                                </span>
                                                <ArrowRight size={10} className="shrink-0 text-sparkle-text-muted/35 group-hover/file:text-[var(--accent-primary)]" />
                                            </button>
                                        ))}
                                        {remainingFiles > 0 ? (
                                            <button
                                                type="button"
                                                onClick={() => onOpenTurn(previewTurn.id)}
                                                className="flex h-9 w-full items-center justify-between px-3 text-[9px] text-sparkle-text-muted/60 hover:bg-white/[0.025] hover:text-sparkle-text-secondary"
                                            >
                                                <span>+{remainingFiles} more {remainingFiles === 1 ? 'file' : 'files'}</span>
                                                <span>View full turn</span>
                                            </button>
                                        ) : null}
                                    </div>
                                </section>
                                </div>
                            ) : null}
                        </div>
                    ) : renderLoadingOrEmpty()}
                </div>
            </div>
        )
    }

    const renderTable = () => (
        <div data-assistant-capsule-scroll="review-turn-index" className="assistant-review-scroll-gutter custom-scrollbar min-h-0 flex-1 overflow-y-auto bg-[color-mix(in_srgb,var(--color-bg)_92%,black)] pb-10" role="table" aria-label="Complete chat turn index">
            <div className="sr-only" role="row">
                <span role="columnheader">Turn</span>
                <span role="columnheader">Conversation</span>
                <span role="columnheader">Files</span>
            </div>

            {renderLoadingOrEmpty() || visibleTurns.map((turn) => {
                const active = turn.id === activeTurnId
                const visibleFiles = turn.files.slice(0, VISIBLE_FILE_LINK_LIMIT)
                return (
                    <div
                        key={turn.id}
                        role="row"
                        tabIndex={0}
                        onClick={() => onOpenTurn(turn.id)}
                        onKeyDown={(event) => {
                            if (event.key !== 'Enter' && event.key !== ' ') return
                            event.preventDefault()
                            onOpenTurn(turn.id)
                        }}
                        className={cn(
                            'assistant-review-landing__turn-row group grid cursor-pointer grid-cols-[3rem_minmax(0,1fr)_minmax(12rem,15rem)] gap-2 border-b border-[color-mix(in_srgb,var(--color-text)_8%,transparent)] px-3 py-2.5 outline-none transition-[background-color,box-shadow] duration-75',
                            active
                                ? 'bg-[color-mix(in_srgb,var(--accent-primary)_5%,var(--color-bg))] shadow-[inset_2px_0_0_color-mix(in_srgb,var(--accent-primary)_58%,transparent)]'
                                : 'hover:bg-[color-mix(in_srgb,var(--color-card)_64%,var(--color-bg))] focus-visible:bg-[color-mix(in_srgb,var(--color-card)_72%,var(--color-bg))]'
                        )}
                    >
                        <div className="assistant-review-landing__turn-cell min-w-0" role="cell">
                            <span className={cn('block font-mono text-[10px]', active ? 'text-[var(--accent-primary)]' : 'text-sparkle-text-muted/65')}>#{turn.number}</span>
                            <span className="mt-1 block font-mono text-[8px] text-sparkle-text-muted/40">{formatAssistantRelativeTime(turn.updatedAt)}</span>
                        </div>

                        <div className="assistant-review-landing__conversation-cell min-w-0" role="cell">
                            <div
                                className={cn(
                                    'assistant-review-landing__prompt min-w-0 text-[11px] font-semibold leading-[1.4] text-sparkle-text',
                                    turn.files.length > 0 ? 'line-clamp-2 whitespace-normal' : 'truncate'
                                )}
                                title={turn.prompt}
                            >
                                {turn.prompt}
                            </div>
                            {turn.responseAvailable ? (
                                <div
                                    className={cn(
                                        'assistant-review-landing__response mt-1 min-w-0 text-[10px] leading-[1.45] text-sparkle-text-muted/72',
                                        turn.files.length > 0 ? 'line-clamp-2 whitespace-normal' : 'truncate'
                                    )}
                                    title={responseExcerptByTurnId.get(turn.id) || turn.response}
                                >
                                    {responseExcerptByTurnId.get(turn.id) || turn.response}
                                </div>
                            ) : <AgentDidNotRespondNotice className="mt-1 text-[9px] leading-[1.45]" />}
                        </div>

                        <div className="assistant-review-landing__files-cell min-w-0" role="cell">
                            {visibleFiles.length > 0 ? (
                                <div className="space-y-1">
                                    {visibleFiles.map((file) => (
                                        <button
                                            key={`${file.target.activityId}:${file.target.filePath}`}
                                            type="button"
                                            onClick={(event) => {
                                                event.stopPropagation()
                                                onOpenFile(turn.id, file.target)
                                            }}
                                            className="flex h-5 w-full min-w-0 items-center gap-1.5 rounded-[4px] border border-[color-mix(in_srgb,var(--color-text)_8%,transparent)] bg-[color-mix(in_srgb,var(--color-card)_76%,var(--color-bg))] px-1.5 text-left font-mono text-[8px] text-sparkle-text-secondary/80 transition-colors hover:border-[color-mix(in_srgb,var(--accent-primary)_24%,transparent)] hover:bg-[color-mix(in_srgb,var(--color-card)_90%,var(--color-bg))] hover:text-sparkle-text"
                                            title={`Open ${file.target.displayPath}`}
                                        >
                                            <FileEntryIcon pathValue={file.target.filePath} kind="file" theme={iconTheme} className="size-3 shrink-0 opacity-80" />
                                            <span className="min-w-0 flex-1 truncate">{file.target.displayPath.split('/').pop()}</span>
                                        </button>
                                    ))}
                                    <span className="block truncate px-1 font-mono text-[8px] text-sparkle-text-muted/45">
                                        {turn.files.length > visibleFiles.length ? `+${turn.files.length - visibleFiles.length} more · ` : ''}
                                        <span className="text-emerald-300/80">+{turn.additions}</span>{' '}
                                        <span className="text-red-300/70">−{turn.deletions}</span>
                                        {turn.changes.length > turn.files.length ? ` · ${turn.changes.length} edits` : ''}
                                        {turn.reviewStatus ? <span className="mx-1 text-sparkle-text-muted/25">·</span> : null}
                                        <AssistantReviewTurnStatusBadge status={turn.reviewStatus} compact />
                                    </span>
                                </div>
                            ) : (
                                <span className="inline-flex items-center gap-1 px-1 pt-0.5 text-[9px]">
                                    <span className="italic text-sparkle-text-muted/30">No diff</span>
                                    {turn.reviewStatus ? <span className="text-sparkle-text-muted/25">·</span> : null}
                                    <AssistantReviewTurnStatusBadge status={turn.reviewStatus} compact />
                                </span>
                            )}
                        </div>
                    </div>
                )
            })}

            {renderEarlierTurnsButton()}
        </div>
    )

    return (
        <section
            ref={rootRef}
            className={cn(
                'assistant-review-landing flex min-h-0 min-w-0 flex-1 flex-col bg-[color-mix(in_srgb,var(--color-bg)_94%,black)] text-sparkle-text-secondary',
                layoutWidth === null && 'invisible'
            )}
            aria-label="Review this chat"
            aria-busy={layoutWidth === null}
        >
            <div className={cn(
                'shrink-0 border-b border-[color-mix(in_srgb,var(--color-text)_8%,transparent)] bg-[var(--color-bg)] px-3 py-3',
                inlineToolbar && 'flex items-center gap-3'
            )}>
                <label className={cn(
                    'flex h-9 items-center gap-2.5 border border-[color-mix(in_srgb,var(--color-text)_10%,transparent)] bg-[color-mix(in_srgb,var(--color-card)_94%,var(--color-bg))] px-3 transition-colors focus-within:border-[var(--accent-primary)]/45',
                    inlineToolbar ? 'min-w-0 flex-1' : 'mb-3 w-full'
                )}>
                    <Search size={14} className="shrink-0 text-sparkle-text-muted/65" />
                    <input
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                        placeholder="Search prompts, final responses, and files"
                        className="min-w-0 flex-1 bg-transparent text-[12px] text-sparkle-text outline-none placeholder:text-sparkle-text-muted/55"
                    />
                    {loading ? <LoaderCircle size={11} className="shrink-0 animate-spin text-[var(--accent-primary)]/65" /> : null}
                    <span className="ml-auto shrink-0 font-mono text-[9px] text-sparkle-text-muted/50">{ready ? turns.length : '—'} turns</span>
                </label>
                <div className={cn('flex shrink-0 items-center gap-3', !inlineToolbar && 'justify-between')}>
                    {renderFilters()}
                </div>
            </div>

            {ready && error ? (
                <div className="flex shrink-0 items-start gap-2 border-b border-amber-400/15 bg-amber-500/[0.06] px-3 py-2 text-[10px] leading-4 text-amber-100/75">
                    <TriangleAlert size={12} className="mt-0.5 shrink-0" />
                    <span>{error}</span>
                </div>
            ) : null}

            {masterDetail ? renderMasterDetail() : renderTable()}
        </section>
    )
})
