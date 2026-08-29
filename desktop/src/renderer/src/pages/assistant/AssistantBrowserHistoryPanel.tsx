import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, Clock3, Download, LoaderCircle, Plus, Search, Trash2, X } from 'lucide-react'
import type { DevScopeBrowserHistoryEntry } from '@shared/contracts/devscope-api'
import { cn } from '@/lib/utils'
import { AssistantBrowserPageIcon } from './AssistantBrowserPageIcon'
import {
    formatAssistantBrowserHistoryLocation,
    groupAssistantBrowserHistoryByDay
} from './assistant-browser-history'

export function AssistantBrowserHistoryPanel({
    entries,
    loading,
    query,
    onQueryChange,
    onClose,
    onNavigate,
    onOpenInNewTab,
    onClear,
    onImport
}: {
    entries: DevScopeBrowserHistoryEntry[]
    loading: boolean
    query: string
    onQueryChange: (query: string) => void
    onClose: () => void
    onNavigate: (url: string) => void
    onOpenInNewTab: (url: string) => void
    onClear: () => void
    onImport: () => void
}) {
    const [expandedClusters, setExpandedClusters] = useState<Set<string>>(() => new Set())
    const [closing, setClosing] = useState(false)
    const [emptyVisible, setEmptyVisible] = useState(false)
    const panelRef = useRef<HTMLElement | null>(null)
    const previousFocusRef = useRef<HTMLElement | null>(null)
    const closingRef = useRef(false)
    const closeTimerRef = useRef(0)
    const groups = useMemo(() => groupAssistantBrowserHistoryByDay(entries), [entries])

    useLayoutEffect(() => {
        previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
        const frame = window.requestAnimationFrame(() => panelRef.current?.querySelector<HTMLInputElement>('input')?.focus())
        return () => {
            window.cancelAnimationFrame(frame)
            window.requestAnimationFrame(() => previousFocusRef.current?.focus())
        }
    }, [])

    useEffect(() => {
        if (loading || groups.length > 0) {
            setEmptyVisible(false)
            return
        }
        const timer = window.setTimeout(() => setEmptyVisible(true), 220)
        return () => window.clearTimeout(timer)
    }, [groups.length, loading, query])

    const exitWith = useCallback((action: () => void) => {
        if (closingRef.current) return
        closingRef.current = true
        setClosing(true)
        const duration = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 220
        closeTimerRef.current = window.setTimeout(action, duration)
    }, [])

    useEffect(() => {
        const handleEscape = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                exitWith(onClose)
                return
            }
            if (event.key !== 'Tab' || !panelRef.current) return
            const focusable = [...panelRef.current.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])')]
            if (focusable.length === 0) return
            const first = focusable[0]
            const last = focusable[focusable.length - 1]
            if (event.shiftKey && document.activeElement === first) {
                event.preventDefault()
                last.focus()
            } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault()
                first.focus()
            }
        }
        window.addEventListener('keydown', handleEscape)
        return () => window.removeEventListener('keydown', handleEscape)
    }, [exitWith, onClose])

    useEffect(() => () => window.clearTimeout(closeTimerRef.current), [])

    return (
        <div className="absolute inset-0 z-[80]" onPointerDown={(event) => {
            if (event.target === event.currentTarget) exitWith(onClose)
        }}>
            <section ref={panelRef} tabIndex={-1} className={cn('absolute bottom-3 right-3 top-3 flex w-[min(440px,calc(100%-24px))] flex-col overflow-hidden rounded-xl border border-[color-mix(in_srgb,var(--color-text)_12%,transparent)] bg-[color-mix(in_srgb,var(--color-card)_97%,var(--color-bg))] shadow-[0_24px_70px_rgba(0,0,0,0.38)] transition-transform duration-[220ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none', closing ? 'translate-x-[calc(100%+16px)]' : 'translate-x-0 animate-[assistant-browser-history-panel-in_180ms_cubic-bezier(0.22,1,0.36,1)_both] motion-reduce:animate-none')} aria-label="Browser history" role="dialog" aria-modal="true">
                <header className="flex h-12 shrink-0 items-center gap-2 border-b border-[var(--surface-divider)] px-3">
                    <Clock3 size={14} className="text-[var(--accent-primary)]/80" />
                    <h3 className="text-[12px] font-semibold text-sparkle-text">History</h3>
                    <button type="button" onClick={() => {
                        previousFocusRef.current = null
                        exitWith(onImport)
                    }} className="ml-auto inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-[9px] text-sparkle-text-muted transition-colors hover:bg-[var(--surface-hover)] hover:text-sparkle-text" title="Import history from another browser"><Download size={11} />Import</button>
                    <button type="button" onClick={onClear} disabled={entries.length === 0} className="inline-flex size-8 items-center justify-center rounded-md text-sparkle-text-muted/55 transition-colors hover:bg-[var(--surface-hover)] hover:text-red-300 disabled:opacity-30" title="Clear Zyra Browser history"><Trash2 size={12} /></button>
                    <button type="button" onClick={() => exitWith(onClose)} className="inline-flex size-8 items-center justify-center rounded-md text-sparkle-text-muted/55 transition-colors hover:bg-[var(--surface-hover)] hover:text-sparkle-text" aria-label="Close history"><X size={13} /></button>
                </header>

                <div className="shrink-0 p-2.5">
                    <label className="flex h-8 items-center gap-2 rounded-md border border-[var(--surface-divider)] bg-[color-mix(in_srgb,var(--color-text)_3%,transparent)] px-2.5 focus-within:border-[var(--accent-primary)]/35">
                        <Search size={12} className="text-sparkle-text-muted/45" />
                        <input value={query} onChange={(event) => onQueryChange(event.target.value)} aria-label="Search Browser history" className="min-w-0 flex-1 bg-transparent text-[10px] text-[var(--color-text)] outline-none placeholder:text-[color-mix(in_srgb,var(--color-text)_42%,transparent)]" placeholder="Search history" />
                        {loading ? <LoaderCircle size={11} className="animate-spin text-sparkle-text-muted/50" /> : null}
                    </label>
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
                    {groups.length === 0 ? (
                        <div className="flex min-h-32 items-center justify-center text-[10px] text-sparkle-text-muted/55">
                            {loading || !emptyVisible ? 'Searching history…' : query ? 'No matching sites.' : 'No Browser history yet.'}
                        </div>
                    ) : groups.map((group) => (
                        <section key={group.id} className="mb-3" aria-label={group.label}>
                            <div className="flex h-7 items-center px-1.5 text-[10px] font-medium text-[var(--color-text)]">{group.label}</div>
                            <div className="divide-y divide-[var(--surface-divider)] border-y border-[var(--surface-divider)]">
                                {group.clusters.map((cluster) => {
                                    const clusterKey = `${group.id}:${cluster.id}`
                                    const expanded = expandedClusters.has(clusterKey)
                                    return (
                                        <div key={clusterKey}>
                                            <div className="group/cluster flex min-w-0 items-center hover:bg-[var(--surface-hover)]">
                                                <button type="button" onClick={() => exitWith(() => onNavigate(cluster.url))} className="flex h-12 min-w-0 flex-1 items-center gap-2.5 px-2 text-left outline-none focus-visible:bg-[var(--surface-hover)]" title={cluster.url}>
                                                    <span className="inline-flex size-7 shrink-0 items-center justify-center"><AssistantBrowserPageIcon faviconUrl={cluster.faviconUrl} pageUrl={cluster.url} size={15} /></span>
                                                    <span className="min-w-0 flex-1">
                                                        <span className="block truncate text-[11px] font-medium text-[var(--color-text)]">{cluster.title}</span>
                                                        <span className="block truncate text-[9px] text-[color-mix(in_srgb,var(--color-text)_54%,transparent)]">{cluster.hostname} · {cluster.pageCount} page{cluster.pageCount === 1 ? '' : 's'} · {cluster.visitCount} visit{cluster.visitCount === 1 ? '' : 's'}</span>
                                                    </span>
                                                </button>
                                                {cluster.pageCount > 1 ? (
                                                    <button type="button" onClick={() => setExpandedClusters((current) => {
                                                        const next = new Set(current)
                                                        if (next.has(clusterKey)) next.delete(clusterKey)
                                                        else next.add(clusterKey)
                                                        return next
                                                    })} className="inline-flex size-9 shrink-0 items-center justify-center rounded-md text-sparkle-text-muted/45 hover:bg-[color-mix(in_srgb,var(--color-text)_7%,transparent)] hover:text-sparkle-text" aria-label={`${expanded ? 'Hide' : 'Show'} pages from ${cluster.hostname}`} aria-expanded={expanded}><ChevronDown size={12} className={cn('transition-transform', expanded && 'rotate-180')} /></button>
                                                ) : null}
                                                <button type="button" onClick={() => exitWith(() => onOpenInNewTab(cluster.url))} className="mr-1 inline-flex size-9 shrink-0 items-center justify-center rounded-md text-sparkle-text-muted/45 hover:bg-[color-mix(in_srgb,var(--color-text)_7%,transparent)] hover:text-sparkle-text" title={`Open ${cluster.hostname} in a new Browser tab`} aria-label={`Open ${cluster.hostname} in a new Browser tab`}><Plus size={12} /></button>
                                            </div>
                                            {expanded ? (
                                                <div className="border-t border-[var(--surface-divider)] bg-[color-mix(in_srgb,var(--color-text)_2%,transparent)] py-1">
                                                    {cluster.pages.map((page) => (
                                                        <button key={page.url} type="button" onClick={() => exitWith(() => onNavigate(page.url))} className="flex h-9 w-full min-w-0 items-center gap-2 pl-11 pr-2 text-left hover:bg-[var(--surface-hover)]">
                                                            <span className="min-w-0 flex-1">
                                                                <span className="block truncate text-[10px] font-medium text-[var(--color-text)]">{page.title}</span>
                                                                <span className="block truncate text-[9px] text-[color-mix(in_srgb,var(--color-text)_52%,transparent)]">{formatAssistantBrowserHistoryLocation(page.url)}</span>
                                                            </span>
                                                        </button>
                                                    ))}
                                                </div>
                                            ) : null}
                                        </div>
                                    )
                                })}
                            </div>
                        </section>
                    ))}
                </div>
            </section>
        </div>
    )
}
