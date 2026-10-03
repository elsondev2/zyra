import { AnchoredNativeOverlay } from '@/components/ui/AnchoredNativeOverlay'
import { addOverlayEventListener, getOverlayActiveElement } from '@/components/ui/native-overlay-portal'
import { cn } from '@/lib/utils'
import type { DevScopeBrowserBookmark } from '@shared/contracts/devscope-api'
import { Bookmark, Plus, Search, Trash2, X } from 'lucide-react'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { AssistantBrowserPageIcon } from './AssistantBrowserPageIcon'

export function AssistantBrowserBookmarksPanel({ entries, onClose, onNavigate, onOpenInNewTab, onRemove }: {
    entries: DevScopeBrowserBookmark[]
    onClose: () => void
    onNavigate: (url: string) => void
    onOpenInNewTab: (url: string) => void
    onRemove: (url: string) => void
}) {
    const [query, setQuery] = useState('')
    const [closing, setClosing] = useState(false)
    const panelRef = useRef<HTMLElement | null>(null)
    const previousFocusRef = useRef<HTMLElement | null>(null)
    const closingRef = useRef(false)
    const closeTimerRef = useRef(0)
    const visible = useMemo(() => {
        const search = query.trim().toLowerCase()
        return search ? entries.filter((entry) => entry.title.toLowerCase().includes(search) || entry.url.toLowerCase().includes(search)) : entries
    }, [entries, query])

    useLayoutEffect(() => {
        previousFocusRef.current = getOverlayActiveElement()
        const frame = window.requestAnimationFrame(() => panelRef.current?.querySelector<HTMLInputElement>('input')?.focus())
        return () => {
            window.cancelAnimationFrame(frame)
            if (panelRef.current?.contains(getOverlayActiveElement())) {
                window.requestAnimationFrame(() => previousFocusRef.current?.isConnected && previousFocusRef.current?.focus())
            }
        }
    }, [])

    const exitWith = useCallback((action: () => void) => {
        if (closingRef.current) return
        closingRef.current = true
        setClosing(true)
        closeTimerRef.current = window.setTimeout(action, window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 220)
    }, [])

    useEffect(() => {
        const removeOutsideListener = addOverlayEventListener('pointerdown', (event) => {
            if (panelRef.current && !event.composedPath().includes(panelRef.current)) exitWith(onClose)
        }, true)
        const onKeyDown = (event: KeyboardEvent) => {
            if (!panelRef.current || (!event.composedPath().includes(panelRef.current) && event.target !== panelRef.current.ownerDocument)) return
            if (event.key === 'Escape') {
                exitWith(onClose)
                return
            }
            if (event.key !== 'Tab') return
            const focusable = [...panelRef.current.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled])')]
            if (!focusable.length) return
            if (event.shiftKey && getOverlayActiveElement() === focusable[0]) {
                event.preventDefault()
                focusable[focusable.length - 1].focus()
            } else if (!event.shiftKey && getOverlayActiveElement() === focusable[focusable.length - 1]) {
                event.preventDefault()
                focusable[0].focus()
            }
        }
        const removeKeyListener = addOverlayEventListener('keydown', onKeyDown)
        return () => { removeOutsideListener(); removeKeyListener() }
    }, [exitWith, onClose])

    useEffect(() => () => window.clearTimeout(closeTimerRef.current), [])

    return <AnchoredNativeOverlay scoped><div className="absolute inset-0 z-[80]" onPointerDown={(event) => {
        if (event.target === event.currentTarget) exitWith(onClose)
    }}>
        <section ref={panelRef} tabIndex={-1} role="dialog" aria-modal="false" aria-label="Browser bookmarks" className={cn('absolute bottom-3 right-3 top-3 flex w-[min(440px,calc(100%-24px))] flex-col overflow-hidden rounded-xl border border-[color-mix(in_srgb,var(--color-text)_12%,transparent)] bg-[color-mix(in_srgb,var(--color-card)_97%,var(--color-bg))] shadow-[0_24px_70px_rgba(0,0,0,0.38)] transition-transform duration-[220ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none', closing ? 'translate-x-[calc(100%+16px)]' : 'translate-x-0 animate-[assistant-browser-history-panel-in_180ms_cubic-bezier(0.22,1,0.36,1)_both] motion-reduce:animate-none')}>
            <header className="flex h-12 shrink-0 items-center gap-2 border-b border-[var(--surface-divider)] px-3">
                <Bookmark size={14} className="text-[var(--accent-primary)]/80" />
                <h3 className="text-[12px] font-semibold text-sparkle-text">Bookmarks</h3>
                <span className="ml-auto text-[9px] text-sparkle-text-muted/55">{entries.length}</span>
                <button type="button" onClick={() => exitWith(onClose)} className="inline-flex size-8 items-center justify-center rounded-md text-sparkle-text-muted/55 transition-colors hover:bg-[var(--surface-hover)] hover:text-sparkle-text" aria-label="Close bookmarks"><X size={13} /></button>
            </header>
            <div className="shrink-0 p-2.5">
                <label className="flex h-8 items-center gap-2 rounded-md border border-[var(--surface-divider)] bg-[color-mix(in_srgb,var(--color-text)_3%,transparent)] px-2.5 focus-within:border-[var(--accent-primary)]/35">
                    <Search size={12} className="text-sparkle-text-muted/45" />
                    <input data-native-overlay-autofocus value={query} onChange={(event) => setQuery(event.target.value)} aria-label="Search Browser bookmarks" className="min-w-0 flex-1 bg-transparent text-[10px] text-[var(--color-text)] outline-none placeholder:text-[color-mix(in_srgb,var(--color-text)_42%,transparent)]" placeholder="Search bookmarks" />
                </label>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
                {visible.length === 0 ? <div className="flex min-h-32 items-center justify-center text-[10px] text-sparkle-text-muted/55">{query ? 'No matching bookmarks.' : 'No bookmarks yet. Save a page with the star in the toolbar.'}</div> :
                    <div className="divide-y divide-[var(--surface-divider)] border-y border-[var(--surface-divider)]">
                        {visible.map((entry) => <div key={entry.url} className="group flex min-w-0 items-center hover:bg-[var(--surface-hover)]">
                            <button type="button" onClick={() => exitWith(() => onNavigate(entry.url))} className="flex h-12 min-w-0 flex-1 items-center gap-2.5 px-2 text-left outline-none focus-visible:bg-[var(--surface-hover)]" title={entry.url}>
                                <span className="inline-flex size-7 shrink-0 items-center justify-center"><AssistantBrowserPageIcon faviconUrl={entry.faviconUrl} pageUrl={entry.url} size={15} /></span>
                                <span className="min-w-0 flex-1"><span className="block truncate text-[11px] font-medium text-[var(--color-text)]">{entry.title}</span><span className="block truncate text-[9px] text-[color-mix(in_srgb,var(--color-text)_54%,transparent)]">{entry.url}</span></span>
                            </button>
                            <button type="button" onClick={() => exitWith(() => onOpenInNewTab(entry.url))} className="inline-flex size-9 shrink-0 items-center justify-center rounded-md text-sparkle-text-muted/45 hover:bg-[color-mix(in_srgb,var(--color-text)_7%,transparent)] hover:text-sparkle-text" title="Open in new Browser tab" aria-label={`Open ${entry.title} in a new Browser tab`}><Plus size={12} /></button>
                            <button type="button" onClick={() => onRemove(entry.url)} className="mr-1 inline-flex size-9 shrink-0 items-center justify-center rounded-md text-sparkle-text-muted/45 hover:bg-[color-mix(in_srgb,var(--color-text)_7%,transparent)] hover:text-red-300" title="Remove bookmark" aria-label={`Remove bookmark ${entry.title}`}><Trash2 size={12} /></button>
                        </div>)}
                    </div>}
            </div>
        </section>
    </div></AnchoredNativeOverlay>
}
