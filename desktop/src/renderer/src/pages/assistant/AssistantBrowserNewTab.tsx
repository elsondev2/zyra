import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowRight, ChevronDown, Clock3, Image as ImageIcon, LoaderCircle, Plus, RefreshCw, Search, Server } from 'lucide-react'
import type { DevScopeLocalServer } from '@shared/contracts/devscope-api'
import { cn } from '@/lib/utils'
import { AssistantBrowserBackgroundPicker } from './AssistantBrowserBackgroundPicker'
import { AssistantBrowserPageIcon } from './AssistantBrowserPageIcon'
import { useAssistantBrowserNewTabBackground } from './useAssistantBrowserNewTabBackground'
import { useAssistantBrowserNewTabContrast } from './useAssistantBrowserNewTabContrast'

const NEW_TAB_SUGGESTIONS_ID = 'assistant-browser-new-tab-suggestions'

function formatServerProcessName(value: string): string {
    const normalized = String(value || '').trim().replace(/\.exe$/i, '')
    if (!normalized || normalized === 'Local development server') return 'Development server'
    return normalized
}

function BrowserServerGroup({
    label,
    servers,
    onNavigate,
    onOpenInNewTab
}: {
    label: string
    servers: DevScopeLocalServer[]
    onNavigate: (url: string) => void
    onOpenInNewTab: (url: string) => void
}) {
    if (servers.length === 0) return null
    return (
        <section aria-label={label}>
            <div className="flex h-7 items-center justify-between px-1 text-[10px] font-medium text-sparkle-text-muted/75">
                <span>{label}</span>
                <span className="font-mono text-[10px] text-sparkle-text-muted/65">{servers.length}</span>
            </div>
            <div className="divide-y divide-[var(--surface-divider)]">
                {servers.map((server) => (
                    <div key={`${server.pid ?? 'unknown'}:${server.port}`} className="group/server flex min-w-0 items-center transition-colors hover:bg-[var(--surface-hover)]">
                        <button type="button" onClick={() => onNavigate(server.url)} className="flex h-11 min-w-0 flex-1 items-center gap-2.5 px-2 text-left outline-none focus-visible:bg-[var(--surface-hover)]" title={`Open localhost:${server.port}`}>
                            <span className="relative inline-flex size-6 shrink-0 items-center justify-center">
                                <AssistantBrowserPageIcon faviconUrl={null} pageUrl={server.url} size={14} />
                                <span className="absolute bottom-0 right-0 size-1.5 rounded-full bg-emerald-400 ring-2 ring-[var(--color-bg)]" aria-hidden="true" />
                            </span>
                            <span className="min-w-0 flex-1">
                                <span className="block truncate text-[11px] font-medium text-[var(--color-text)]">{formatServerProcessName(server.processName)}</span>
                                <span className="block truncate font-mono text-[10px] text-sparkle-text-muted/70">localhost:{server.port}</span>
                            </span>
                            <ArrowRight size={10} className="shrink-0 text-sparkle-text-muted/35 transition-transform group-hover/server:translate-x-0.5 group-hover/server:text-sparkle-text-muted/70" />
                        </button>
                        <button type="button" onClick={() => onOpenInNewTab(server.url)} className="mr-1 inline-flex size-9 shrink-0 items-center justify-center rounded-md text-sparkle-text-muted/45 transition-colors hover:bg-[color-mix(in_srgb,var(--color-text)_8%,transparent)] hover:text-sparkle-text focus:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent-primary)]/45" title={`Open localhost:${server.port} in a new Browser tab`} aria-label={`Open localhost:${server.port} in a new Browser tab`}><Plus size={12} /></button>
                    </div>
                ))}
            </div>
        </section>
    )
}

export function AssistantBrowserNewTab({
    projectServers,
    otherServers,
    loading,
    error,
    onRefresh,
    onNavigate,
    onOpenInNewTab,
    onOpenHistory,
    getSearchSuggestions
}: {
    projectServers: DevScopeLocalServer[]
    otherServers: DevScopeLocalServer[]
    loading: boolean
    error: string | null
    onRefresh: () => void
    onNavigate: (url: string) => void
    onOpenInNewTab: (url: string) => void
    onOpenHistory: () => void
    getSearchSuggestions: (query: string) => Promise<string[]>
}) {
    const [now, setNow] = useState(() => new Date())
    const [query, setQuery] = useState('')
    const [focused, setFocused] = useState(false)
    const [suggestionState, setSuggestionState] = useState<{ query: string; values: string[] }>({ query: '', values: [] })
    const [suggestionsLoading, setSuggestionsLoading] = useState(false)
    const [activeSuggestionIndex, setActiveSuggestionIndex] = useState(-1)
    const [backgroundPickerOpen, setBackgroundPickerOpen] = useState(false)
    const [serversExpanded, setServersExpanded] = useState(false)
    const backgroundImageRef = useRef<HTMLImageElement>(null)
    const surfaceRef = useRef<HTMLDivElement>(null)
    const background = useAssistantBrowserNewTabBackground()
    const normalizedQuery = query.trim()
    const suggestions = suggestionState.query === normalizedQuery ? suggestionState.values : []
    const suggestionsOpen = focused && normalizedQuery.length >= 2
    const totalServers = projectServers.length + otherServers.length
    const serverGroupCount = Number(projectServers.length > 0) + Number(otherServers.length > 0)
    const localServersPanelHeight = serversExpanded
        ? (totalServers > 0 ? Math.min(224, 50 + (serverGroupCount * 28) + (totalServers * 44)) : 112)
        : 34
    const timeLabel = useMemo(() => new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(now), [now])
    const dateLabel = useMemo(() => new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'short', day: 'numeric' }).format(now), [now])

    useEffect(() => {
        let interval = 0
        const updateClock = () => setNow(new Date())
        const timeout = window.setTimeout(() => {
            updateClock()
            interval = window.setInterval(updateClock, 60_000)
        }, 60_000 - (Date.now() % 60_000) + 25)
        const syncClock = () => updateClock()
        updateClock()
        window.addEventListener('focus', syncClock)
        document.addEventListener('visibilitychange', syncClock)
        return () => {
            window.clearTimeout(timeout)
            window.clearInterval(interval)
            window.removeEventListener('focus', syncClock)
            document.removeEventListener('visibilitychange', syncClock)
        }
    }, [])

    useEffect(() => {
        const normalized = query.trim()
        if (!focused || normalized.length < 2) {
            setSuggestionState({ query: '', values: [] })
            setSuggestionsLoading(false)
            setActiveSuggestionIndex(-1)
            return
        }
        let cancelled = false
        setSuggestionsLoading(true)
        const timer = window.setTimeout(() => {
            void getSearchSuggestions(normalized).then((next) => {
                if (!cancelled) {
                    setSuggestionState({ query: normalized, values: next })
                    setSuggestionsLoading(false)
                    setActiveSuggestionIndex(-1)
                }
            }).catch(() => {
                if (!cancelled) {
                    setSuggestionState({ query: normalized, values: [] })
                    setSuggestionsLoading(false)
                }
            })
        }, 180)
        return () => {
            cancelled = true
            window.clearTimeout(timer)
        }
    }, [focused, getSearchSuggestions, query])

    const submit = (value: string) => {
        const normalized = value.trim()
        if (!normalized) return
        setFocused(false)
        setSuggestionState({ query: '', values: [] })
        setSuggestionsLoading(false)
        setActiveSuggestionIndex(-1)
        onNavigate(normalized)
    }

    const activeBackground = background.activeBackground
    const contrast = useAssistantBrowserNewTabContrast({ background: activeBackground, imageRef: backgroundImageRef, surfaceRef })
    const clockUsesDarkForeground = contrast.clock === 'dark'
    const actionsUseDarkForeground = contrast.actions === 'dark'
    const attributionUsesDarkForeground = contrast.attribution === 'dark'
    const clockForegroundColor = clockUsesDarkForeground ? '#111820' : 'rgba(255,255,255,0.94)'
    const clockQuietForegroundColor = clockUsesDarkForeground ? 'rgba(17,24,32,0.78)' : 'rgba(255,255,255,0.76)'
    const clockTextShadow = clockUsesDarkForeground
        ? '0 1px 1px rgba(255,255,255,0.70), 0 3px 12px rgba(255,255,255,0.22)'
        : '0 1px 2px rgba(0,0,0,0.92), 0 7px 28px rgba(0,0,0,0.68)'
    const actionsForegroundColor = actionsUseDarkForeground ? 'rgba(11,17,23,0.88)' : 'rgba(255,255,255,0.92)'
    const actionsIconFilter = actionsUseDarkForeground
        ? 'drop-shadow(0 1px 1px rgba(255,255,255,0.95)) drop-shadow(0 4px 10px rgba(255,255,255,0.55))'
        : 'drop-shadow(0 1px 1px rgba(0,0,0,0.95)) drop-shadow(0 4px 10px rgba(0,0,0,0.72))'
    const attributionForegroundColor = attributionUsesDarkForeground ? 'rgba(11,17,23,0.88)' : 'rgba(255,255,255,0.90)'
    const attributionTextShadow = attributionUsesDarkForeground
        ? '0 1px 1px rgba(255,255,255,0.86), 0 2px 8px rgba(255,255,255,0.38)'
        : '0 1px 2px rgba(0,0,0,0.96), 0 3px 10px rgba(0,0,0,0.72)'
    const toggleLocalServers = () => {
        setServersExpanded((current) => !current)
    }
    return (
        <div ref={surfaceRef} className="no-drag pointer-events-auto absolute inset-0 z-10 overflow-y-auto bg-sparkle-bg">
            {activeBackground ? <><img ref={backgroundImageRef} crossOrigin={activeBackground.provider === 'unsplash' ? 'anonymous' : undefined} src={activeBackground.imageUrl} alt="" className="pointer-events-none absolute inset-0 size-full object-cover" style={activeBackground.provider === 'built-in' ? { objectPosition: `${activeBackground.focalPoint.x * 100}% ${activeBackground.focalPoint.y * 100}%` } : undefined} /><div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(3,6,10,0.28)_0%,rgba(3,6,10,0.10)_44%,rgba(3,6,10,0.58)_100%)]" /></> : null}
            <h1 className="sr-only">New tab</h1>

            <div className="absolute z-20 flex items-center gap-1" style={{ right: 20, top: 28 }}>
                <button type="button" onClick={() => setBackgroundPickerOpen(true)} className="inline-flex size-8 items-center justify-center transition-[color,transform] hover:scale-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)]/65" style={{ color: actionsForegroundColor, filter: actionsIconFilter }} title="Choose New Tab background" aria-label="Choose New Tab background"><ImageIcon size={14} /></button>
                <button type="button" onClick={onOpenHistory} className="inline-flex size-8 items-center justify-center transition-[color,transform] hover:scale-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)]/65" style={{ color: actionsForegroundColor, filter: actionsIconFilter }} title="Open Browser history" aria-label="Open Browser history"><Clock3 size={14} /></button>
            </div>

            <main className="relative z-10 mx-auto flex min-h-full w-full max-w-[720px] flex-col items-center px-4 pb-16 text-center" style={{ paddingTop: 'clamp(140px, 24vh, 220px)' }}>
                <div className="font-semibold leading-none tracking-[-0.055em] tabular-nums" style={{ color: clockForegroundColor, fontSize: 'clamp(64px, 8vw, 88px)', textShadow: clockTextShadow }}>{timeLabel}</div>
                <div className="mt-1.5 text-[11px] font-medium" style={{ color: clockQuietForegroundColor, textShadow: clockTextShadow }}>{dateLabel}</div>

                <form className="relative z-30 mt-7 h-[52px] w-full max-w-[520px]" onSubmit={(event) => {
                    event.preventDefault()
                    event.currentTarget.querySelector('input')?.blur()
                    submit(activeSuggestionIndex >= 0 ? suggestions[activeSuggestionIndex] || query : query)
                }}>
                    <div className={cn('absolute inset-x-0 top-0 z-30 overflow-hidden border-0 shadow-[0_18px_48px_rgba(0,0,0,0.34),inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur-xl transition-[border-radius,box-shadow] focus-within:shadow-[0_20px_56px_rgba(0,0,0,0.42),0_0_0_3px_color-mix(in_srgb,var(--accent-primary)_16%,transparent)]', suggestionsOpen ? 'rounded-[24px]' : 'rounded-full')} style={{ backgroundColor: 'rgba(5, 8, 12, 0.74)' }}>
                        <label className="flex items-center" style={{ height: 52 }}>
                            <Search size={15} className="shrink-0 text-white/45" style={{ marginLeft: 18 }} />
                            <input value={query} onChange={(event) => {
                                setQuery(event.target.value)
                                setActiveSuggestionIndex(-1)
                            }} onFocus={() => setFocused(true)} onBlur={() => window.setTimeout(() => setFocused(false), 0)} onKeyDown={(event) => {
                                if (event.key === 'ArrowDown' && suggestions.length > 0) {
                                    event.preventDefault()
                                    setActiveSuggestionIndex((current) => Math.min(suggestions.length - 1, current + 1))
                                } else if (event.key === 'ArrowUp' && suggestions.length > 0) {
                                    event.preventDefault()
                                    setActiveSuggestionIndex((current) => current <= 0 ? suggestions.length - 1 : current - 1)
                                } else if (event.key === 'Escape') {
                                    event.currentTarget.blur()
                                    setFocused(false)
                                    setSuggestionState({ query: '', values: [] })
                                    setSuggestionsLoading(false)
                                }
                            }} className="min-w-0 flex-1 bg-transparent px-3 text-[12px] text-white outline-none placeholder:text-white/38" placeholder="Search Google or enter an address" spellCheck={false} aria-label="New tab search" role="combobox" aria-autocomplete="list" aria-expanded={suggestionsOpen} aria-controls={suggestionsOpen ? NEW_TAB_SUGGESTIONS_ID : undefined} aria-activedescendant={activeSuggestionIndex >= 0 && suggestions[activeSuggestionIndex] ? `${NEW_TAB_SUGGESTIONS_ID}-option-${activeSuggestionIndex}` : undefined} />
                            <button type="submit" className="inline-flex w-11 items-center justify-center text-[var(--accent-primary)] transition-colors hover:bg-white/[0.06]" title="Open"><ArrowRight size={14} /></button>
                        </label>
                        {suggestionsOpen ? (
                            <div id={NEW_TAB_SUGGESTIONS_ID} role="listbox" aria-label="Google suggestions" className="max-h-72 overflow-y-auto border-t border-white/10 p-1.5 text-left">
                                {suggestions.length > 0 ? suggestions.map((suggestion, index) => (
                                    <button key={suggestion} id={`${NEW_TAB_SUGGESTIONS_ID}-option-${index}`} type="button" role="option" aria-selected={activeSuggestionIndex === index} onPointerDown={(event) => event.preventDefault()} onClick={() => submit(suggestion)} onPointerEnter={() => setActiveSuggestionIndex(index)} className={cn('flex h-9 w-full items-center gap-2 rounded-[7px] px-2.5 text-left text-white/78 transition-colors hover:bg-white/[0.07]', activeSuggestionIndex === index && 'bg-white/[0.10] text-white')}><Search size={11} className="text-white/45" /><span className="truncate text-[11px] font-medium">{suggestion}</span></button>
                                )) : (
                                    <div role="status" className="flex h-9 items-center gap-2 px-2.5 text-[10px] text-white/50"><Search size={11} /><span>{suggestionsLoading ? 'Finding suggestions…' : 'Press Enter to search'}</span></div>
                                )}
                            </div>
                        ) : null}
                    </div>
                </form>

                <section
                    className="relative z-10 w-full overflow-hidden text-white backdrop-blur-xl"
                    style={{
                        backgroundColor: serversExpanded ? 'rgba(5, 8, 12, 0.66)' : 'rgba(5, 8, 12, 0.52)',
                        borderBottomLeftRadius: 12,
                        borderBottomRightRadius: 12,
                        borderTopLeftRadius: 0,
                        borderTopRightRadius: 0,
                        boxShadow: serversExpanded
                            ? '0 24px 64px rgba(0,0,0,0.34), inset 0 1px 0 rgba(255,255,255,0.055)'
                            : '0 12px 32px rgba(0,0,0,0.22), inset 0 1px 0 rgba(255,255,255,0.05)',
                        height: localServersPanelHeight,
                        marginTop: -10,
                        maxWidth: 440,
                        transition: 'height 420ms cubic-bezier(0.22,1,0.36,1), background-color 300ms ease, box-shadow 360ms ease'
                    }}
                    aria-label="Running locally"
                >
                    <span className="sr-only">This project</span>
                    <span className="sr-only">Other local servers</span>
                    <div
                        id="assistant-browser-local-servers-content"
                        className="absolute inset-x-0 top-0 overflow-y-auto px-2 pb-1 pt-3 text-left custom-scrollbar"
                        style={{
                            bottom: 34,
                            opacity: serversExpanded ? 1 : 0,
                            pointerEvents: serversExpanded ? 'auto' : 'none',
                            transform: serversExpanded ? 'translateY(0)' : 'translateY(-10px)',
                            transition: serversExpanded
                                ? 'opacity 220ms ease 110ms, transform 360ms cubic-bezier(0.22,1,0.36,1) 70ms, visibility 0ms'
                                : 'opacity 130ms ease, transform 220ms ease, visibility 0ms 300ms',
                            visibility: serversExpanded ? 'visible' : 'hidden'
                        }}
                        aria-hidden={!serversExpanded}
                    >
                        {totalServers > 0 ? (
                            <>
                                <BrowserServerGroup label="This project" servers={projectServers} onNavigate={onNavigate} onOpenInNewTab={onOpenInNewTab} />
                                <BrowserServerGroup label="Other local servers" servers={otherServers} onNavigate={onNavigate} onOpenInNewTab={onOpenInNewTab} />
                            </>
                        ) : (
                            <div className="flex min-h-11 items-center justify-center gap-2 text-[10px] text-white/55 drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)]">
                                {loading ? <><LoaderCircle size={11} className="animate-spin" /><span>Looking for local servers…</span></> : <span>{error || 'No running local servers detected.'}</span>}
                            </div>
                        )}
                    </div>
                    <div className="absolute inset-x-0 bottom-0 flex items-center" style={{ height: 34, transform: serversExpanded ? 'translateY(0)' : 'translateY(3px)', transition: 'transform 220ms ease' }}>
                        <button
                            type="button"
                            onClick={toggleLocalServers}
                            className="flex h-full min-w-0 flex-1 items-center text-[10px] font-medium text-white/72 outline-none transition-colors hover:text-white focus-visible:text-white"
                            style={{ gap: 6, justifyContent: 'flex-start', padding: '0 14px' }}
                            aria-expanded={serversExpanded}
                            aria-controls="assistant-browser-local-servers-content"
                        >
                            <span className="inline-flex shrink-0 items-center justify-center text-white/58" style={{ height: 14, width: 14 }}><Server size={12} /></span>
                            <span className="inline-flex items-center whitespace-nowrap" style={{ height: 14, lineHeight: '14px' }}>Local servers</span>
                            <span className="inline-flex items-center text-[10px] font-medium text-white/55" style={{ height: 14, lineHeight: '14px' }}>{totalServers}</span>
                            <span className="inline-flex shrink-0 items-center justify-center" style={{ height: 14, marginLeft: 1, width: 14 }}><ChevronDown size={10} className="transition-transform duration-300" style={{ transform: serversExpanded ? 'rotate(180deg)' : 'rotate(-90deg)' }} /></span>
                        </button>
                        {serversExpanded ? <button type="button" onClick={onRefresh} disabled={loading} className="mr-1 inline-flex size-8 items-center justify-center text-white/55 transition-[color,transform] hover:rotate-12 hover:text-white disabled:opacity-35" title="Refresh running servers" aria-label="Refresh running servers"><RefreshCw size={11} className={cn(loading && 'animate-spin')} /></button> : null}
                    </div>
                </section>
            </main>

            {activeBackground?.provider === 'built-in' ? (
                <button type="button" onClick={() => void window.devscope.openBrowserPreviewExternal(activeBackground.sourceUrl)} className="absolute bottom-3 left-3 z-20 max-w-[min(520px,calc(100%-24px))] truncate text-[10px] opacity-80 transition-opacity hover:opacity-100" style={{ color: attributionForegroundColor, textShadow: attributionTextShadow }} title={activeBackground.attributionText}>{activeBackground.attributionText}</button>
            ) : activeBackground ? (
                <span className="absolute bottom-3 left-3 z-20 max-w-[min(520px,calc(100%-24px))] truncate text-[10px] opacity-80" style={{ color: attributionForegroundColor, textShadow: attributionTextShadow }}>Photo by <button type="button" onClick={() => void window.devscope.openBrowserPreviewExternal(activeBackground.photographerUrl)} className="hover:underline hover:opacity-100">{activeBackground.photographer}</button> on <button type="button" onClick={() => void window.devscope.openBrowserPreviewExternal('https://unsplash.com/?utm_source=zyra&utm_medium=referral')} className="hover:underline hover:opacity-100">Unsplash</button></span>
            ) : null}
            {backgroundPickerOpen ? <AssistantBrowserBackgroundPicker controller={background} onClose={() => setBackgroundPickerOpen(false)} /> : null}
        </div>
    )
}
