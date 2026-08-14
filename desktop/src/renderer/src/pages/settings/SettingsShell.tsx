import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { ArrowLeft, PanelLeftOpen, Pin, Search, X } from 'lucide-react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useSettings } from '@/lib/settings'
import { cn } from '@/lib/utils'
import {
    ASSISTANT_SIDEBAR_COLLAPSE_MORPH_MS,
    ASSISTANT_SIDEBAR_PREVIEW_CLOSE_MS,
    readAssistantBubblePreviewPinned,
    writeAssistantBubblePreviewPinned
} from '../assistant/assistant-sidebar-preview-state'
import { findSettingsNavigationItem, SETTINGS_NAVIGATION_GROUPS, type SettingsNavigationItem } from './settings-navigation'
import {
    findSettingsSearchTargets,
    getSettingsSearchTarget,
    isSettingsSearchTargetId,
    type SettingsSearchTarget
} from './settings-search'

const SETTINGS_SIDEBAR_MIN_WIDTH = 260
const SETTINGS_SIDEBAR_MAX_WIDTH = 420
const SETTINGS_SIDEBAR_WIDTH_KEY = 'assistant-left-sidebar-width'

function clampSidebarWidth(width: number) {
    return Math.max(SETTINGS_SIDEBAR_MIN_WIDTH, Math.min(SETTINGS_SIDEBAR_MAX_WIDTH, Math.round(width || 322)))
}

function settingsPageMatches(item: SettingsNavigationItem, query: string): boolean {
    const tokens = query.split(/\s+/).filter(Boolean)
    const haystack = `${item.label} ${item.description} ${item.keywords || ''}`.toLowerCase()
    return tokens.every((token) => haystack.includes(token))
}

function groupSettingsSearchTargets(targets: SettingsSearchTarget[]): Array<{ section: string; targets: SettingsSearchTarget[] }> {
    const groups = new Map<string, SettingsSearchTarget[]>()
    for (const target of targets) {
        const entries = groups.get(target.section) || []
        entries.push(target)
        groups.set(target.section, entries)
    }
    return [...groups].map(([section, entries]) => ({ section, targets: entries }))
}

export default function SettingsShell() {
    const location = useLocation()
    const navigate = useNavigate()
    const { settings, updateSettings } = useSettings()
    const [query, setQuery] = useState('')
    const [sidebarWidth, setSidebarWidth] = useState(() => clampSidebarWidth(Number(localStorage.getItem(SETTINGS_SIDEBAR_WIDTH_KEY))))
    const [resizingSidebar, setResizingSidebar] = useState(false)
    const resizeStateRef = useRef<{ pointerId: number; startX: number; startWidth: number } | null>(null)
    const contentScrollRef = useRef<HTMLElement | null>(null)
    const previewCloseTimerRef = useRef<number | null>(null)
    const wasCollapsedRef = useRef(settings.sidebarCollapsed)
    const [previewPinned, setPreviewPinned] = useState(readAssistantBubblePreviewPinned)
    const [previewOpen, setPreviewOpen] = useState(previewPinned)
    const normalizedQuery = query.trim().toLowerCase()
    const activeItem = findSettingsNavigationItem(location.pathname)
    const requestedSearchTarget = useMemo(() => {
        const value = new URLSearchParams(location.search).get('setting') || ''
        return isSettingsSearchTargetId(value) ? value : null
    }, [location.search])
    const searchMatchesByPage = useMemo<Record<string, SettingsSearchTarget[]>>(() => {
        if (!normalizedQuery) return {}
        return Object.fromEntries(SETTINGS_NAVIGATION_GROUPS.flatMap((group) => (
            group.items.map((item) => [item.id, findSettingsSearchTargets(item.id, normalizedQuery)] as const)
        )))
    }, [normalizedQuery])
    const visibleGroups = useMemo(() => SETTINGS_NAVIGATION_GROUPS
        .map((group) => ({
            ...group,
            items: normalizedQuery
                ? group.items.filter((item) => settingsPageMatches(item, normalizedQuery) || searchMatchesByPage[item.id]?.length > 0)
                : group.items
        }))
        .filter((group) => group.items.length > 0), [normalizedQuery, searchMatchesByPage])

    useLayoutEffect(() => {
        if (requestedSearchTarget) return
        const scrollContainer = contentScrollRef.current
        if (!scrollContainer) return
        scrollContainer.scrollTop = 0
        scrollContainer.scrollLeft = 0
    }, [location.pathname, requestedSearchTarget])

    useEffect(() => {
        if (!requestedSearchTarget) return
        const scrollContainer = contentScrollRef.current
        if (!scrollContainer) return
        const searchTarget = getSettingsSearchTarget(activeItem.id, requestedSearchTarget)
        const fallbackTargetId = searchTarget?.sectionTargetId || null
        let frameId = 0
        let clearTimer = 0
        let highlighted: HTMLElement | null = null
        let attempts = 0

        const findTarget = (targetId: string | null) => targetId
            ? scrollContainer.querySelector<HTMLElement>(`[data-settings-search-target="${targetId}"]`)
            : null
        const focusTarget = () => {
            const exactTarget = findTarget(requestedSearchTarget)
            const fallbackTarget = exactTarget ? null : findTarget(fallbackTargetId)
            const target = exactTarget || fallbackTarget
            if (!target) {
                attempts += 1
                if (attempts < 120) frameId = window.requestAnimationFrame(focusTarget)
                return
            }
            highlighted = target
            target.classList.add('zyra-settings-search-target')
            target.focus({ preventScroll: true })
            target.scrollIntoView({
                block: 'center',
                behavior: settings.accessibilityReduceMotion ? 'auto' : 'smooth'
            })
            clearTimer = window.setTimeout(() => target.classList.remove('zyra-settings-search-target'), 2_200)
        }

        frameId = window.requestAnimationFrame(focusTarget)
        return () => {
            window.cancelAnimationFrame(frameId)
            window.clearTimeout(clearTimer)
            highlighted?.classList.remove('zyra-settings-search-target')
        }
    }, [activeItem.id, location.key, requestedSearchTarget, settings.accessibilityReduceMotion])

    useEffect(() => {
        const toggleSidebar = () => updateSettings({ sidebarCollapsed: !settings.sidebarCollapsed })
        window.addEventListener('zyra:toggle-assistant-sidebar', toggleSidebar)
        return () => window.removeEventListener('zyra:toggle-assistant-sidebar', toggleSidebar)
    }, [settings.sidebarCollapsed, updateSettings])

    useEffect(() => {
        window.dispatchEvent(new CustomEvent('zyra:assistant-sidebar-state', {
            detail: { collapsed: settings.sidebarCollapsed, width: sidebarWidth }
        }))
    }, [settings.sidebarCollapsed, sidebarWidth])

    useEffect(() => {
        writeAssistantBubblePreviewPinned(previewPinned)
    }, [previewPinned])

    const openPreview = useCallback(() => {
        if (previewCloseTimerRef.current !== null) {
            window.clearTimeout(previewCloseTimerRef.current)
            previewCloseTimerRef.current = null
        }
        setPreviewOpen(true)
    }, [])

    const schedulePreviewClose = useCallback((delayMs = ASSISTANT_SIDEBAR_PREVIEW_CLOSE_MS) => {
        if (previewPinned) return
        if (previewCloseTimerRef.current !== null) window.clearTimeout(previewCloseTimerRef.current)
        previewCloseTimerRef.current = window.setTimeout(() => {
            previewCloseTimerRef.current = null
            setPreviewOpen(false)
        }, delayMs)
    }, [previewPinned])

    const forceSchedulePreviewClose = useCallback((delayMs = ASSISTANT_SIDEBAR_PREVIEW_CLOSE_MS) => {
        if (previewCloseTimerRef.current !== null) window.clearTimeout(previewCloseTimerRef.current)
        previewCloseTimerRef.current = window.setTimeout(() => {
            previewCloseTimerRef.current = null
            setPreviewOpen(false)
        }, delayMs)
    }, [])

    useEffect(() => {
        const wasCollapsed = wasCollapsedRef.current
        wasCollapsedRef.current = settings.sidebarCollapsed

        if (!settings.sidebarCollapsed) {
            if (previewCloseTimerRef.current !== null) {
                window.clearTimeout(previewCloseTimerRef.current)
                previewCloseTimerRef.current = null
            }
            setPreviewOpen(false)
            setPreviewPinned(false)
            return
        }

        if (!wasCollapsed) {
            setPreviewOpen(true)
            schedulePreviewClose(ASSISTANT_SIDEBAR_COLLAPSE_MORPH_MS)
        }
    }, [schedulePreviewClose, settings.sidebarCollapsed])

    const expandCollapsedSidebar = useCallback(() => {
        setPreviewPinned(false)
        window.dispatchEvent(new CustomEvent('zyra:toggle-assistant-sidebar'))
    }, [])

    const togglePreviewPinned = useCallback(() => {
        if (previewPinned) {
            setPreviewPinned(false)
            forceSchedulePreviewClose()
            return
        }
        setPreviewPinned(true)
        openPreview()
    }, [forceSchedulePreviewClose, openPreview, previewPinned])

    const handleResizePointerDown = useCallback((event: ReactPointerEvent<HTMLButtonElement>) => {
        if (settings.sidebarCollapsed || event.button !== 0) return
        event.preventDefault()
        event.currentTarget.setPointerCapture(event.pointerId)
        resizeStateRef.current = { pointerId: event.pointerId, startX: event.clientX, startWidth: sidebarWidth }
        setResizingSidebar(true)
        document.body.style.cursor = 'col-resize'
        document.body.style.userSelect = 'none'
    }, [settings.sidebarCollapsed, sidebarWidth])

    const handleResizePointerMove = useCallback((event: ReactPointerEvent<HTMLButtonElement>) => {
        const resizeState = resizeStateRef.current
        if (!resizeState || resizeState.pointerId !== event.pointerId) return
        event.preventDefault()
        setSidebarWidth(clampSidebarWidth(resizeState.startWidth + event.clientX - resizeState.startX))
    }, [])

    const handleResizePointerEnd = useCallback((event: ReactPointerEvent<HTMLButtonElement>) => {
        const resizeState = resizeStateRef.current
        if (!resizeState || resizeState.pointerId !== event.pointerId) return
        event.preventDefault()
        resizeStateRef.current = null
        setResizingSidebar(false)
        if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
        const nextWidth = clampSidebarWidth(resizeState.startWidth + event.clientX - resizeState.startX)
        setSidebarWidth(nextWidth)
        localStorage.setItem(SETTINGS_SIDEBAR_WIDTH_KEY, String(nextWidth))
        document.body.style.removeProperty('cursor')
        document.body.style.removeProperty('user-select')
    }, [])

    useEffect(() => () => {
        if (previewCloseTimerRef.current !== null) window.clearTimeout(previewCloseTimerRef.current)
        document.body.style.removeProperty('cursor')
        document.body.style.removeProperty('user-select')
    }, [])

    const sidebarLayoutStyle = {
        width: settings.sidebarCollapsed ? '0px' : `${sidebarWidth}px`,
        willChange: 'width'
    } as const
    const sidebarSurfaceStyle = settings.sidebarCollapsed
        ? {
            width: `${sidebarWidth}px`,
            opacity: previewOpen ? 1 : 0,
            pointerEvents: previewOpen ? 'auto' : 'none',
            transform: previewOpen ? 'translate3d(0, 0, 0)' : 'translate3d(-18px, 0, 0)',
            transformOrigin: 'left center',
            willChange: 'opacity, transform'
        } as const
        : {
            width: `${sidebarWidth}px`,
            opacity: 1,
            pointerEvents: 'auto',
            transform: 'translate3d(0, 0, 0)',
            transformOrigin: 'left center',
            willChange: 'width, opacity'
        } as const

    return (
        <div className="zyra-settings-shell flex h-full min-h-0 overflow-hidden bg-[var(--settings-bg)] text-[var(--settings-text)]">
            {settings.sidebarCollapsed ? (
                <div
                    className="pointer-events-auto fixed bottom-0 left-0 top-[34px] z-[59] w-6"
                    onMouseEnter={openPreview}
                    onMouseLeave={() => schedulePreviewClose()}
                    aria-hidden="true"
                    data-settings-sidebar-peek="true"
                >
                    <div
                        className={cn(
                            'absolute left-1 top-1/2 h-16 w-1.5 -translate-y-1/2 rounded-full border border-[var(--surface-divider)] bg-[var(--surface-scrollbar)] transition-[opacity,transform,background-color] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none',
                            previewOpen ? '-translate-x-1 opacity-0' : 'translate-x-0 opacity-100 hover:bg-[var(--surface-scrollbar-hover)]'
                        )}
                    />
                </div>
            ) : null}
            <div
                className={cn(
                    'relative h-full shrink-0 overflow-visible transition-[width] duration-[520ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none',
                    !settings.sidebarCollapsed && '[contain:layout]',
                    resizingSidebar && 'transition-none'
                )}
                style={sidebarLayoutStyle}
                aria-hidden={settings.sidebarCollapsed && !previewOpen}
            >
                <aside
                    onMouseEnter={() => {
                        if (settings.sidebarCollapsed) openPreview()
                    }}
                    onMouseLeave={() => {
                        if (settings.sidebarCollapsed) schedulePreviewClose()
                    }}
                    aria-hidden={settings.sidebarCollapsed && !previewOpen}
                    className={cn(
                        settings.sidebarCollapsed
                            ? 'zyra-sidebar-floating-surface absolute bottom-3 left-2 top-2 z-[60] flex h-auto flex-col overflow-hidden rounded-[22px] transition-[opacity,transform,border-radius,box-shadow,top,bottom,left] duration-[520ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none'
                            : 'zyra-sidebar-surface absolute bottom-0 left-0 top-0 flex h-full flex-col overflow-hidden rounded-none shadow-none [contain:layout_paint] transition-[opacity,transform,border-radius,box-shadow,top,bottom,left] duration-[520ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none',
                        resizingSidebar && 'transition-none'
                    )}
                    style={sidebarSurfaceStyle}
                    data-settings-sidebar-bubble={settings.sidebarCollapsed ? 'true' : 'false'}
                >
                    <div className="flex h-full flex-col">
                <div className="shrink-0 px-2.5 pb-2 pt-2.5">
                    <div className="flex items-center gap-1">
                    <label className="flex h-8 min-w-0 flex-1 items-center gap-2 rounded-md border border-[var(--settings-border)] bg-[var(--settings-control)] px-2 text-[var(--settings-text-muted)] transition-colors hover:border-[var(--settings-border-strong)] focus-within:border-[var(--accent-primary)] focus-within:text-[var(--settings-text-secondary)]">
                        <Search size={13} strokeWidth={1.8} className="shrink-0" />
                        <input
                            value={query}
                            onChange={(event) => setQuery(event.target.value)}
                            placeholder="Find settings"
                            aria-label="Find settings"
                            className="min-w-0 flex-1 bg-transparent text-[12px] text-[var(--settings-text)] outline-none placeholder:text-[var(--settings-text-faint)]"
                        />
                        {query ? (
                            <button
                                type="button"
                                onClick={() => setQuery('')}
                                className="inline-flex size-5 shrink-0 items-center justify-center rounded text-[var(--settings-text-muted)] hover:bg-[var(--settings-nav-hover)] hover:text-[var(--settings-text)]"
                                aria-label="Clear settings search"
                            >
                                <X size={11} strokeWidth={2} />
                            </button>
                        ) : null}
                    </label>
                    {settings.sidebarCollapsed ? (
                        <div className="flex shrink-0 items-center gap-0.5">
                            <button
                                type="button"
                                onClick={togglePreviewPinned}
                                className={cn(
                                    'inline-flex size-8 items-center justify-center rounded-md text-[var(--settings-text-muted)] transition-colors hover:bg-[var(--settings-nav-hover)] hover:text-[var(--settings-text)]',
                                    previewPinned && 'text-[var(--settings-text-secondary)]'
                                )}
                                title={previewPinned ? 'Unpin bubble sidebar' : 'Pin bubble sidebar'}
                                aria-label={previewPinned ? 'Unpin bubble sidebar' : 'Pin bubble sidebar'}
                                aria-pressed={previewPinned}
                            >
                                <Pin size={14} strokeWidth={1.8} className={cn(previewPinned && 'rotate-45 fill-current')} />
                            </button>
                            <button
                                type="button"
                                onClick={expandCollapsedSidebar}
                                className="inline-flex size-8 items-center justify-center rounded-md text-[var(--settings-text-muted)] transition-colors hover:bg-[var(--settings-nav-hover)] hover:text-[var(--settings-text)]"
                                title="Expand sidebar"
                                aria-label="Expand sidebar"
                            >
                                <PanelLeftOpen size={14} strokeWidth={1.8} />
                            </button>
                        </div>
                    ) : null}
                    </div>
                </div>

                <nav className="settings-sidebar-scrollbar min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 pb-3" aria-label="Settings sections">
                    {visibleGroups.length ? visibleGroups.map((group) => (
                        <div key={group.id} className="mb-3 last:mb-0">
                            <div className="px-2 pb-1 pt-1 text-[10px] font-semibold uppercase tracking-[0.09em] text-[var(--settings-text-faint)]">
                                {group.label}
                            </div>
                            <div className="space-y-0.5">
                                {group.items.map((item) => {
                                    const Icon = item.icon
                                    const isActive = location.pathname === item.to
                                        || location.pathname.startsWith(`${item.to}/`)
                                        || item.legacyPaths?.some((path) => location.pathname === path || location.pathname.startsWith(`${path}/`))
                                    const resultGroups = normalizedQuery
                                        ? groupSettingsSearchTargets(searchMatchesByPage[item.id] || [])
                                        : []
                                    return (
                                        <div key={item.id}>
                                            <NavLink
                                                to={item.to}
                                                aria-current={isActive ? 'page' : undefined}
                                                className={cn(
                                                    'group flex min-h-8 items-center gap-2 rounded-md px-2 text-[12px] transition-colors duration-100',
                                                    isActive
                                                        ? 'bg-[var(--settings-nav-active)] font-medium text-[var(--settings-text)]'
                                                        : 'text-[var(--settings-text-secondary)] hover:bg-[var(--settings-nav-hover)] hover:text-[var(--settings-text)]'
                                                )}
                                            >
                                                <Icon
                                                    size={14}
                                                    strokeWidth={isActive ? 1.9 : 1.7}
                                                    className={cn('shrink-0 transition-colors', isActive ? 'text-[var(--settings-text-secondary)]' : 'text-[var(--settings-text-faint)] group-hover:text-[var(--settings-text-secondary)]')}
                                                />
                                                <span className="min-w-0 flex-1 truncate">{item.label}</span>
                                                {resultGroups.length > 0 ? <span className="font-mono text-[9px] font-normal tabular-nums text-[var(--settings-text-faint)]">{resultGroups.reduce((count, resultGroup) => count + resultGroup.targets.length, 0)}</span> : null}
                                            </NavLink>
                                            {resultGroups.length > 0 ? (
                                                <div className="ml-[15px] border-l border-[var(--settings-divider)] pb-1 pl-2 pt-0.5" role="group" aria-label={`${item.label} setting results`}>
                                                    {resultGroups.map((resultGroup) => (
                                                        <div key={resultGroup.section} className="pb-1 last:pb-0">
                                                            <div className="px-2 pb-0.5 pt-1 text-[9px] font-medium text-[var(--settings-text-faint)]">{resultGroup.section}</div>
                                                            <div className="space-y-px">
                                                                {resultGroup.targets.map((target) => {
                                                                    const targetActive = isActive && requestedSearchTarget === target.targetId
                                                                    return (
                                                                        <Link
                                                                            key={`${target.section}:${target.label}`}
                                                                            to={`${item.to}?setting=${encodeURIComponent(target.targetId)}`}
                                                                            state={{ settingsSearchRequest: target.targetId }}
                                                                            aria-current={targetActive ? 'location' : undefined}
                                                                            className={cn(
                                                                                'group/result flex min-h-7 items-center gap-2 rounded-md px-2 py-1 text-[11px] leading-4 transition-colors',
                                                                                targetActive
                                                                                    ? 'bg-[var(--settings-nav-active)] font-medium text-[var(--settings-text)]'
                                                                                    : 'text-[var(--settings-text-muted)] hover:bg-[var(--settings-nav-hover)] hover:text-[var(--settings-text)]'
                                                                            )}
                                                                        >
                                                                            <span className={cn('size-1 shrink-0 rounded-full bg-[var(--settings-text-faint)]', targetActive && 'bg-[var(--accent-primary)]')} />
                                                                            <span className="min-w-0 flex-1 truncate">{target.label}</span>
                                                                        </Link>
                                                                    )
                                                                })}
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            ) : null}
                                        </div>
                                    )
                                })}
                            </div>
                        </div>
                    )) : (
                        <div className="px-2 py-6 text-center text-[12px] text-[var(--settings-text-muted)]">No matching sections</div>
                    )}
                </nav>

                <div className="mx-2 mt-auto shrink-0 border-t border-[var(--surface-divider)] pb-2.5 pt-2">
                    <button
                        type="button"
                        onClick={() => navigate('/assistant')}
                        className="group flex h-8 w-full items-center gap-2 rounded-md px-2.5 text-left text-[13px] font-medium text-[var(--settings-text-secondary)] transition-colors hover:bg-[var(--settings-nav-hover)] hover:text-[var(--settings-text)]"
                    >
                        <ArrowLeft size={14} strokeWidth={1.8} className="text-[var(--settings-text-faint)] transition-[color,transform] group-hover:-translate-x-0.5 group-hover:text-[var(--settings-text-secondary)]" />
                        <span className="min-w-0 flex-1 truncate">Back to chats</span>
                    </button>
                </div>
                {!settings.sidebarCollapsed ? (
                    <button
                        type="button"
                        aria-label="Resize settings sidebar"
                        title="Drag to resize sidebar"
                        onPointerDown={handleResizePointerDown}
                        onPointerMove={handleResizePointerMove}
                        onPointerUp={handleResizePointerEnd}
                        onPointerCancel={handleResizePointerEnd}
                        className="absolute inset-y-0 right-0 z-20 w-3 translate-x-1/2 cursor-col-resize touch-none bg-transparent"
                    />
                ) : null}
                    </div>
                </aside>
            </div>

            <section ref={contentScrollRef} className="settings-content-scrollbar min-w-0 flex-1 overflow-y-auto overscroll-contain bg-[var(--settings-bg)]" aria-labelledby="settings-active-page-title">
                <h2 id="settings-active-page-title" className="sr-only">{activeItem.label}</h2>
                <Outlet />
            </section>
        </div>
    )
}
