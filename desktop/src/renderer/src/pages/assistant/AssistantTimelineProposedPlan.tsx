import { memo, useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { ArrowUpRight, ChevronUp, Loader2, Play } from 'lucide-react'
import { createPortal } from 'react-dom'
import type { AssistantProposedPlan } from '@shared/assistant/contracts'
import MarkdownRenderer from '@/components/ui/MarkdownRenderer'
import { cn } from '@/lib/utils'
import { formatAssistantDateTime } from '@/lib/assistant/selectors'
import { getDisplayedProposedPlanMarkdown, getProposedPlanTitle } from './assistant-proposed-plan'

export const TimelineProposedPlan = memo(({
    plan,
    canImplement = false,
    onImplement,
    onShowPlanPanel,
    scrollContainerRef,
    overlayContainerRef,
    filePath = null,
    onInternalLinkClick
}: {
    plan: AssistantProposedPlan
    canImplement?: boolean
    onImplement?: (plan: AssistantProposedPlan) => Promise<void> | void
    onShowPlanPanel?: () => void
    scrollContainerRef?: RefObject<HTMLDivElement | null>
    overlayContainerRef?: RefObject<HTMLDivElement | null>
    filePath?: string | null
    onInternalLinkClick?: (href: string) => Promise<void> | void
}) => {
    const [implementing, setImplementing] = useState(false)
    const [expanded, setExpanded] = useState(false)
    const [showFloatingCollapse, setShowFloatingCollapse] = useState(false)
    const planRef = useRef<HTMLElement | null>(null)
    const showFloatingCollapseRef = useRef(false)
    const floatingCollapseRafRef = useRef<number | null>(null)
    const previousScrollTopRef = useRef<number | null>(null)
    const displayedPlanMarkdown = useMemo(() => getDisplayedProposedPlanMarkdown(plan.planMarkdown || ''), [plan.planMarkdown])
    const planTitle = useMemo(() => getProposedPlanTitle(plan.planMarkdown || '') || 'Implementation Plan', [plan.planMarkdown])
    const previewClassName = 'text-[13px] leading-6 text-sparkle-text [&_p]:mb-3 [&_p]:leading-6 [&_li]:leading-6 [&_ul]:text-[13px] [&_ol]:text-[13px] [&_pre]:text-[12px] [&_code]:text-[12px]'
    const canExpandPlan = useMemo(() => displayedPlanMarkdown.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).length > 14, [displayedPlanMarkdown])

    const handleImplement = useCallback(async () => {
        if (!onImplement || !canImplement || implementing) return
        try {
            setImplementing(true)
            await onImplement(plan)
        } finally {
            setImplementing(false)
        }
    }, [canImplement, implementing, onImplement, plan])

    useEffect(() => {
        if (!expanded) {
            if (floatingCollapseRafRef.current !== null) {
                window.cancelAnimationFrame(floatingCollapseRafRef.current)
                floatingCollapseRafRef.current = null
            }
            previousScrollTopRef.current = null
            showFloatingCollapseRef.current = false
            setShowFloatingCollapse(false)
            return
        }

        const scrollContainer = scrollContainerRef?.current || planRef.current?.closest('.overflow-y-auto')
        const updateFloatingCollapse = (isScrollingUp: boolean) => {
            const node = planRef.current
            const container = scrollContainer instanceof HTMLElement ? scrollContainer : null
            if (!node || !container) return
            const nodeRect = node.getBoundingClientRect()
            const containerRect = container.getBoundingClientRect()
            const stillInsidePlan = nodeRect.bottom > containerRect.top + 72
            const nextVisible = isScrollingUp && nodeRect.top < containerRect.top - 32 && stillInsidePlan
            if (showFloatingCollapseRef.current !== nextVisible) {
                showFloatingCollapseRef.current = nextVisible
                setShowFloatingCollapse(nextVisible)
            }
        }

        const handleScroll = () => {
            if (floatingCollapseRafRef.current !== null) return
            floatingCollapseRafRef.current = window.requestAnimationFrame(() => {
                floatingCollapseRafRef.current = null
                if (!(scrollContainer instanceof HTMLElement)) return
                const currentScrollTop = scrollContainer.scrollTop
                const previousScrollTop = previousScrollTopRef.current
                const isScrollingUp = previousScrollTop !== null ? currentScrollTop < previousScrollTop : false
                previousScrollTopRef.current = currentScrollTop
                updateFloatingCollapse(isScrollingUp)
            })
        }

        if (scrollContainer instanceof HTMLElement) {
            previousScrollTopRef.current = scrollContainer.scrollTop
        }
        updateFloatingCollapse(false)
        if (!(scrollContainer instanceof HTMLElement)) {
            showFloatingCollapseRef.current = false
            setShowFloatingCollapse(false)
            return
        }
        scrollContainer.addEventListener('scroll', handleScroll, { passive: true })
        return () => {
            scrollContainer.removeEventListener('scroll', handleScroll)
            if (floatingCollapseRafRef.current !== null) {
                window.cancelAnimationFrame(floatingCollapseRafRef.current)
                floatingCollapseRafRef.current = null
            }
        }
    }, [expanded, scrollContainerRef])

    const floatingCollapseButton = overlayContainerRef?.current ? createPortal(
        <div className={cn('pointer-events-none absolute inset-0 z-30 transition-all duration-200', expanded && showFloatingCollapse ? 'translate-y-0 opacity-100' : 'translate-y-2 opacity-0')}>
            <div className="mx-auto flex h-full w-full max-w-3xl items-end justify-end px-4 pb-6">
                <button
                    type="button"
                    onClick={() => setExpanded(false)}
                    className={cn(
                        'inline-flex h-9 items-center gap-1.5 rounded-full border border-white/10 bg-sparkle-card/95 px-3 text-[11px] font-medium text-sparkle-text-secondary shadow-[0_16px_40px_rgba(0,0,0,0.28)] backdrop-blur-xl transition-colors hover:border-white/20 hover:bg-white/[0.05] hover:text-sparkle-text',
                        expanded && showFloatingCollapse ? 'pointer-events-auto' : 'pointer-events-none'
                    )}
                >
                    <span>Show less</span>
                    <ChevronUp size={12} />
                </button>
            </div>
        </div>,
        overlayContainerRef.current
    ) : null

    return (
        <div className="max-w-4xl py-1">
            <section ref={planRef} className="overflow-hidden rounded-2xl border border-white/10 bg-sparkle-card">
                <div className="flex items-start justify-between gap-3 border-b border-white/5 px-4 py-3">
                    <div className="min-w-0">
                        <div className="flex items-center gap-2">
                            <span className="rounded-full border border-violet-400/20 bg-violet-500/[0.10] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-violet-200">Plan</span>
                            <span className="text-[11px] text-sparkle-text-muted">{formatAssistantDateTime(plan.updatedAt)}</span>
                        </div>
                        <p className="mt-1 truncate text-[13px] font-medium text-sparkle-text">{planTitle}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                        {onShowPlanPanel ? (
                            <button type="button" onClick={onShowPlanPanel} className="inline-flex h-8 items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.03] px-3 text-[11px] font-medium text-sparkle-text-secondary transition-colors hover:border-white/20 hover:bg-white/[0.05] hover:text-sparkle-text" title="Open full plan in sidebar">
                                <ArrowUpRight size={12} />
                                <span>Show plan</span>
                            </button>
                        ) : null}
                        {onImplement && canImplement ? (
                            <button
                                type="button"
                                onClick={() => void handleImplement()}
                                disabled={implementing}
                                className={cn('inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-[11px] font-medium transition-colors', implementing ? 'cursor-not-allowed border-white/8 bg-white/[0.03] text-sparkle-text-muted' : 'border-emerald-400/20 bg-emerald-500/[0.08] text-emerald-200 hover:border-emerald-300/35 hover:bg-emerald-500/[0.12]')}
                                title="Start implementing this reviewed plan"
                            >
                                {implementing ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} />}
                                <span>{implementing ? 'Implementing...' : 'Implement'}</span>
                            </button>
                        ) : null}
                    </div>
                </div>
                <div className="relative px-4 py-3">
                    <div className={cn('transition-[max-height] duration-300 ease-out', expanded ? 'overflow-visible max-h-none' : 'overflow-hidden max-h-[22rem]')}>
                        <MarkdownRenderer
                            content={displayedPlanMarkdown || ''}
                            filePath={filePath || undefined}
                            onInternalLinkClick={onInternalLinkClick}
                            className={previewClassName}
                        />
                    </div>
                    {canExpandPlan && !expanded ? (
                        <div className="pointer-events-none absolute inset-x-4 bottom-3 h-20 bg-gradient-to-t from-sparkle-card via-sparkle-card/92 to-transparent">
                            <div className="pointer-events-auto absolute inset-x-0 bottom-0 flex justify-center pb-1">
                                <button type="button" onClick={() => setExpanded(true)} className="inline-flex h-8 items-center gap-1.5 rounded-full border border-white/10 bg-sparkle-card px-3 text-[11px] font-medium text-sparkle-text-secondary shadow-[0_10px_30px_rgba(0,0,0,0.22)] transition-colors hover:border-white/20 hover:bg-white/[0.05] hover:text-sparkle-text">
                                    <span>Show more</span>
                                    <ChevronUp size={12} className="rotate-180" />
                                </button>
                            </div>
                        </div>
                    ) : null}
                </div>
                <div className="relative z-10 flex items-start justify-between gap-3 border-t border-white/5 bg-sparkle-card px-4 pb-3.5 pt-3">
                    <p className="flex-1 text-[11px] leading-[1.15rem] text-sparkle-text-muted">Saved in conversation history as a standalone reviewable plan.</p>
                    <div className="flex shrink-0 items-start gap-2">
                        {expanded && canExpandPlan ? <button type="button" onClick={() => setExpanded(false)} className="shrink-0 pt-[1px] text-[11px] leading-[1.15rem] font-medium text-sparkle-text-muted underline decoration-white/25 underline-offset-4 transition-colors hover:text-sparkle-text">Show less</button> : null}
                        {!canImplement ? <span className="rounded-full bg-white/[0.04] px-2 py-0.5 text-[10px] leading-[1.15rem] text-sparkle-text-muted">Locked after newer messages</span> : null}
                    </div>
                </div>
            </section>
            {floatingCollapseButton}
        </div>
    )
})
