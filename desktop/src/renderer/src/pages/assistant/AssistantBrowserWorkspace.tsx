import { memo, useCallback, useEffect, useRef, useState } from 'react'
import {
    ArrowLeft,
    ArrowRight,
    ExternalLink,
    FolderX,
    Globe2,
    LoaderCircle,
    Plus,
    RefreshCw,
    Search,
    Server,
    ShieldCheck,
    Square,
    Trash2,
    Volume2,
    X
} from 'lucide-react'
import type { DevScopeBrowserPreviewConfig, DevScopeProcessInfo } from '@shared/contracts/devscope-api'
import { cn } from '@/lib/utils'
import { AssistantBrowserPageIcon } from './AssistantBrowserPageIcon'
import { AssistantBrowserWebview, type AssistantBrowserWebviewHandle } from './AssistantBrowserWebview'
import {
    activateAssistantBrowserTab,
    addAssistantBrowserTab,
    ASSISTANT_BROWSER_TAB_LIMIT,
    browserTabFallbackTitle,
    closeAssistantBrowserTab,
    loadAssistantBrowserWorkspaceState,
    normalizeAssistantBrowserNavigation,
    persistAssistantBrowserWorkspaceState,
    updateAssistantBrowserTab,
    type AssistantBrowserTabState,
    type AssistantBrowserWorkspaceState
} from './assistant-browser-workspace-state'

type LocalServerSuggestion = {
    port: number
    url: string
    processName: string
    pid: number
}

function collectProjectServers(processes: DevScopeProcessInfo[]): LocalServerSuggestion[] {
    const seen = new Set<number>()
    return processes.flatMap((process): LocalServerSuggestion[] => {
        const port = Number(process.port)
        if (!Number.isInteger(port) || port < 1 || port > 65535 || seen.has(port)) return []
        seen.add(port)
        return [{
            port,
            url: `http://localhost:${port}/`,
            processName: process.name || 'Development server',
            pid: process.pid
        }]
    }).sort((left, right) => left.port - right.port)
}

function tabSequenceSeed(state: AssistantBrowserWorkspaceState): number {
    return state.tabs.reduce((maximum, tab) => {
        const suffix = Number(tab.id.split(':').pop())
        return Number.isFinite(suffix) ? Math.max(maximum, suffix + 1) : maximum
    }, 1)
}

export const AssistantBrowserWorkspace = memo(function AssistantBrowserWorkspace({
    workspaceKey,
    projectPath,
    active,
    navigationRequest,
    onNavigationRequestHandled,
    onAudibleChange,
    onActiveFaviconChange
}: {
    workspaceKey: string
    projectPath: string | null
    active: boolean
    navigationRequest: { id: number; url: string } | null
    onNavigationRequestHandled: (requestId: number) => void
    onAudibleChange: (audible: boolean) => void
    onActiveFaviconChange: (faviconUrl: string | null) => void
}) {
    const normalizedProjectPath = String(projectPath || '').trim()
    const [workspaceState, setWorkspaceState] = useState<AssistantBrowserWorkspaceState>(() => (
        loadAssistantBrowserWorkspaceState(workspaceKey)
    ))
    const [config, setConfig] = useState<DevScopeBrowserPreviewConfig | null>(null)
    const [configLoading, setConfigLoading] = useState(Boolean(normalizedProjectPath))
    const [configError, setConfigError] = useState<string | null>(null)
    const [addressValue, setAddressValue] = useState('')
    const [addressError, setAddressError] = useState<string | null>(null)
    const [profileMenuOpen, setProfileMenuOpen] = useState(false)
    const [clearProfileArmed, setClearProfileArmed] = useState(false)
    const [clearingProfile, setClearingProfile] = useState(false)
    const [profileNotice, setProfileNotice] = useState<{ tone: 'info' | 'error'; message: string } | null>(null)
    const [localServers, setLocalServers] = useState<LocalServerSuggestion[]>([])
    const [serversLoading, setServersLoading] = useState(false)
    const [serversError, setServersError] = useState<string | null>(null)
    const workspaceStateRef = useRef(workspaceState)
    const webviewRefs = useRef(new Map<string, AssistantBrowserWebviewHandle>())
    const webviewRefCallbacks = useRef(new Map<string, (handle: AssistantBrowserWebviewHandle | null) => void>())
    const pendingNavigationRef = useRef(new Map<string, string>())
    const consumedNavigationRequestsRef = useRef(new Set<number>())
    const tabSequenceRef = useRef(tabSequenceSeed(workspaceState))
    const addressFocusedRef = useRef(false)
    const profileMenuRef = useRef<HTMLDivElement | null>(null)

    workspaceStateRef.current = workspaceState
    const activeTab = workspaceState.tabs.find((tab) => tab.id === workspaceState.activeTabId)
        || workspaceState.tabs[0]
    const hasAudibleTab = workspaceState.tabs.some((tab) => tab.audible)

    const commitWorkspaceState = useCallback((nextState: AssistantBrowserWorkspaceState) => {
        workspaceStateRef.current = nextState
        setWorkspaceState(nextState)
        persistAssistantBrowserWorkspaceState(workspaceKey, nextState)
    }, [workspaceKey])

    const mutateWorkspaceState = useCallback((
        updater: (current: AssistantBrowserWorkspaceState) => AssistantBrowserWorkspaceState
    ) => {
        const nextState = updater(workspaceStateRef.current)
        if (nextState !== workspaceStateRef.current) commitWorkspaceState(nextState)
    }, [commitWorkspaceState])

    useEffect(() => {
        onAudibleChange(hasAudibleTab)
    }, [hasAudibleTab, onAudibleChange])

    useEffect(() => () => onAudibleChange(false), [onAudibleChange])

    useEffect(() => {
        onActiveFaviconChange(activeTab?.faviconUrl || null)
    }, [activeTab?.faviconUrl, onActiveFaviconChange])

    useEffect(() => () => onActiveFaviconChange(null), [onActiveFaviconChange])

    useEffect(() => {
        if (!addressFocusedRef.current) setAddressValue(activeTab?.url || '')
        setAddressError(null)
    }, [activeTab?.id, activeTab?.url])

    useEffect(() => {
        if (!normalizedProjectPath) {
            setConfig(null)
            setConfigLoading(false)
            setConfigError(null)
            return
        }
        let cancelled = false
        setConfigLoading(true)
        setConfigError(null)
        void window.devscope.getBrowserPreviewConfig()
            .then((result) => {
                if (cancelled) return
                if (!result.success) {
                    setConfig(null)
                    setConfigError(result.error || 'Integrated Browser is unavailable.')
                    return
                }
                setConfig({
                    partition: result.partition,
                    webPreferences: result.webPreferences,
                    profileScope: result.profileScope,
                    persistent: result.persistent
                })
            })
            .catch((error: unknown) => {
                if (!cancelled) {
                    setConfig(null)
                    setConfigError(error instanceof Error ? error.message : 'Integrated Browser is unavailable.')
                }
            })
            .finally(() => {
                if (!cancelled) setConfigLoading(false)
            })
        return () => {
            cancelled = true
        }
    }, [normalizedProjectPath])

    useEffect(() => {
        if (!profileMenuOpen) return
        const handlePointerDown = (event: PointerEvent) => {
            const target = event.target
            if (target instanceof Node && profileMenuRef.current?.contains(target)) return
            setProfileMenuOpen(false)
            setClearProfileArmed(false)
        }
        document.addEventListener('pointerdown', handlePointerDown)
        return () => document.removeEventListener('pointerdown', handlePointerDown)
    }, [profileMenuOpen])

    const refreshLocalServers = useCallback(async () => {
        if (!normalizedProjectPath) return
        setServersLoading(true)
        setServersError(null)
        try {
            const result = await window.devscope.getProjectProcesses(normalizedProjectPath)
            if (!result.success) {
                setLocalServers([])
                setServersError(result.error || 'Could not inspect project servers.')
                return
            }
            setLocalServers(collectProjectServers(result.processes || []))
        } catch (error: unknown) {
            setLocalServers([])
            setServersError(error instanceof Error ? error.message : 'Could not inspect project servers.')
        } finally {
            setServersLoading(false)
        }
    }, [normalizedProjectPath])

    useEffect(() => {
        if (normalizedProjectPath) void refreshLocalServers()
    }, [normalizedProjectPath, refreshLocalServers])

    useEffect(() => {
        if (active && activeTab) webviewRefs.current.get(activeTab.id)?.focus()
    }, [active, activeTab?.id])

    const handleWebviewStateChange = useCallback((tabId: string, patch: Partial<Omit<AssistantBrowserTabState, 'id'>>) => {
        mutateWorkspaceState((current) => updateAssistantBrowserTab(current, tabId, patch))
        if (tabId === workspaceStateRef.current.activeTabId && patch.url && !addressFocusedRef.current) {
            setAddressValue(patch.url)
        }
    }, [mutateWorkspaceState])

    const navigateActiveTab = useCallback(async (rawInput: string) => {
        const target = normalizeAssistantBrowserNavigation(rawInput)
        if (!target.success) {
            setAddressError(target.error)
            return
        }
        const tabId = workspaceStateRef.current.activeTabId
        const handle = webviewRefs.current.get(tabId)
        setAddressValue(target.url)
        setAddressError(null)
        mutateWorkspaceState((current) => updateAssistantBrowserTab(current, tabId, {
            url: target.url,
            title: browserTabFallbackTitle(target.url),
            status: 'loading',
            error: null,
            faviconUrl: null
        }))
        if (!handle) {
            pendingNavigationRef.current.set(tabId, target.url)
            return
        }
        try {
            await handle.navigate(target.url)
        } catch (error: unknown) {
            mutateWorkspaceState((current) => updateAssistantBrowserTab(current, tabId, {
                status: 'error',
                error: error instanceof Error ? error.message : 'The page could not be loaded.'
            }))
        }
    }, [mutateWorkspaceState])

    const createTab = useCallback((url = '') => {
        const tabId = `browser:${tabSequenceRef.current++}`
        mutateWorkspaceState((current) => addAssistantBrowserTab(current, tabId, url))
        setAddressValue(url)
        setAddressError(null)
    }, [mutateWorkspaceState])

    useEffect(() => {
        if (!config || !navigationRequest || consumedNavigationRequestsRef.current.has(navigationRequest.id)) return
        consumedNavigationRequestsRef.current.add(navigationRequest.id)
        if (consumedNavigationRequestsRef.current.size > 100) {
            const oldestRequestId = consumedNavigationRequestsRef.current.values().next().value
            if (oldestRequestId !== undefined) consumedNavigationRequestsRef.current.delete(oldestRequestId)
        }
        void navigateActiveTab(navigationRequest.url).finally(() => {
            onNavigationRequestHandled(navigationRequest.id)
        })
    }, [config, navigateActiveTab, navigationRequest, onNavigationRequestHandled])

    const closeTab = useCallback((tabId: string) => {
        webviewRefs.current.delete(tabId)
        webviewRefCallbacks.current.delete(tabId)
        pendingNavigationRef.current.delete(tabId)
        const replacementTabId = `browser:${tabSequenceRef.current++}`
        mutateWorkspaceState((current) => closeAssistantBrowserTab(current, tabId, replacementTabId))
    }, [mutateWorkspaceState])

    const activateTab = useCallback((tabId: string) => {
        mutateWorkspaceState((current) => activateAssistantBrowserTab(current, tabId))
    }, [mutateWorkspaceState])

    const getWebviewRefCallback = useCallback((tabId: string) => {
        const existing = webviewRefCallbacks.current.get(tabId)
        if (existing) return existing
        const callback = (handle: AssistantBrowserWebviewHandle | null) => {
            if (!handle) {
                webviewRefs.current.delete(tabId)
                return
            }
            webviewRefs.current.set(tabId, handle)
            const pendingUrl = pendingNavigationRef.current.get(tabId)
            if (!pendingUrl) return
            pendingNavigationRef.current.delete(tabId)
            void handle.navigate(pendingUrl).catch((error: unknown) => {
                mutateWorkspaceState((current) => updateAssistantBrowserTab(current, tabId, {
                    status: 'error',
                    error: error instanceof Error ? error.message : 'The page could not be loaded.'
                }))
            })
        }
        webviewRefCallbacks.current.set(tabId, callback)
        return callback
    }, [mutateWorkspaceState])

    const openExternal = useCallback(async () => {
        if (!activeTab?.url) return
        const result = await window.devscope.openBrowserPreviewExternal(activeTab.url)
        if (!result.success) setAddressError(result.error || 'Could not open the page externally.')
    }, [activeTab?.url])

    const clearLocalBrowserProfile = useCallback(async () => {
        if (!clearProfileArmed) {
            setClearProfileArmed(true)
            setProfileNotice({ tone: 'info', message: 'Click Clear now to sign every integrated Browser tab out.' })
            return
        }
        setClearingProfile(true)
        setProfileNotice(null)
        try {
            const result = await window.devscope.clearBrowserPreviewData()
            if (!result.success) {
                setProfileNotice({ tone: 'error', message: result.error || 'Could not clear local Browser data.' })
                return
            }
            for (const handle of webviewRefs.current.values()) handle.reload()
            setClearProfileArmed(false)
            setProfileNotice({ tone: 'info', message: 'Local Browser cookies and site data were cleared.' })
        } catch (error: unknown) {
            setProfileNotice({
                tone: 'error',
                message: error instanceof Error ? error.message : 'Could not clear local Browser data.'
            })
        } finally {
            setClearingProfile(false)
        }
    }, [clearProfileArmed])

    if (!normalizedProjectPath) {
        return (
            <section className="flex min-h-0 flex-1 items-center justify-center px-6 text-center" aria-label="Browser workspace">
                <div className="max-w-[250px]">
                    <span className="mx-auto inline-flex size-10 items-center justify-center rounded-xl border border-white/[0.07] bg-white/[0.025] text-sparkle-text-muted/55"><FolderX size={18} /></span>
                    <h3 className="mt-3 text-[12px] font-semibold text-sparkle-text-secondary">No project attached</h3>
                    <p className="mt-1 text-[10px] leading-4 text-sparkle-text-muted/65">Open a project chat to preview its development server.</p>
                </div>
            </section>
        )
    }

    if (configLoading) {
        return <div className="flex min-h-0 flex-1 items-center justify-center"><LoaderCircle size={18} className="animate-spin text-[var(--accent-primary)]/75" /></div>
    }

    if (!config || configError) {
        return (
            <section className="flex min-h-0 flex-1 items-center justify-center px-6 text-center" aria-label="Browser workspace unavailable">
                <div className="max-w-[270px]">
                    <Globe2 size={20} className="mx-auto text-sparkle-text-muted/55" />
                    <h3 className="mt-3 text-[12px] font-semibold text-sparkle-text-secondary">Integrated Browser unavailable</h3>
                    <p className="mt-1 text-[10px] leading-4 text-sparkle-text-muted/65">{configError || 'Restart the Zyra desktop app to load its browser bridge.'}</p>
                </div>
            </section>
        )
    }

    return (
        <section className="flex min-h-0 flex-1 flex-col overflow-hidden bg-[color-mix(in_srgb,var(--color-bg)_96%,black)]" aria-label="Browser workspace">
            <div className="flex h-7 shrink-0 items-end gap-px overflow-x-auto border-b border-white/[0.07] bg-[color-mix(in_srgb,var(--color-bg)_92%,black)] px-1 pt-1 [scrollbar-width:none]">
                {workspaceState.tabs.map((tab) => {
                    const tabActive = tab.id === activeTab?.id
                    return (
                        <div key={tab.id} className={cn('group/tab flex h-6 min-w-[92px] max-w-[150px] items-center gap-1 border-x border-t px-1.5', tabActive ? 'border-white/[0.09] bg-[color-mix(in_srgb,var(--color-bg)_96%,black)] text-sparkle-text' : 'border-transparent bg-white/[0.018] text-sparkle-text-muted hover:bg-white/[0.04] hover:text-sparkle-text-secondary')}>
                            <button type="button" onClick={() => activateTab(tab.id)} className="flex min-w-0 flex-1 items-center gap-1 text-left" title={tab.title || tab.url || 'New tab'}>
                                {tab.status === 'loading' ? <LoaderCircle size={9} className="shrink-0 animate-spin text-[var(--accent-primary)]" /> : <AssistantBrowserPageIcon faviconUrl={tab.faviconUrl} size={9} />}
                                <span className="min-w-0 flex-1 truncate text-[9px]">{tab.title || 'New tab'}</span>
                            </button>
                            {tab.audible ? <Volume2 size={10} className="shrink-0 text-[var(--accent-primary)]" aria-label="This tab is playing audio" /> : null}
                            <button type="button" onClick={() => closeTab(tab.id)} className="inline-flex size-4 shrink-0 items-center justify-center opacity-0 hover:bg-white/[0.06] hover:text-sparkle-text group-hover/tab:opacity-100" title={`Close ${tab.title || 'tab'}`}><X size={9} /></button>
                        </div>
                    )
                })}
                <button type="button" onClick={() => createTab()} disabled={workspaceState.tabs.length >= ASSISTANT_BROWSER_TAB_LIMIT} className="mb-0.5 inline-flex size-5 shrink-0 items-center justify-center text-sparkle-text-muted hover:bg-white/[0.05] hover:text-sparkle-text disabled:opacity-30" title="New browser tab"><Plus size={11} /></button>
            </div>

            <form
                className="relative z-30 flex h-8 shrink-0 items-center gap-1 border-b border-white/[0.07] bg-[color-mix(in_srgb,var(--color-bg)_94%,black)] px-1.5"
                onSubmit={(event) => {
                    event.preventDefault()
                    void navigateActiveTab(addressValue)
                }}
            >
                <button type="button" onClick={() => activeTab && webviewRefs.current.get(activeTab.id)?.goBack()} disabled={!activeTab?.canGoBack} className="inline-flex size-5 items-center justify-center text-sparkle-text-muted hover:bg-white/[0.05] hover:text-sparkle-text disabled:opacity-25" title="Back"><ArrowLeft size={11} /></button>
                <button type="button" onClick={() => activeTab && webviewRefs.current.get(activeTab.id)?.goForward()} disabled={!activeTab?.canGoForward} className="inline-flex size-5 items-center justify-center text-sparkle-text-muted hover:bg-white/[0.05] hover:text-sparkle-text disabled:opacity-25" title="Forward"><ArrowRight size={11} /></button>
                <button
                    type="button"
                    onClick={() => {
                        if (!activeTab) return
                        const handle = webviewRefs.current.get(activeTab.id)
                        if (activeTab.status === 'loading') handle?.stop()
                        else handle?.reload()
                    }}
                    disabled={!activeTab?.url}
                    className="inline-flex size-5 items-center justify-center text-sparkle-text-muted hover:bg-white/[0.05] hover:text-sparkle-text disabled:opacity-25"
                    title={activeTab?.status === 'loading' ? 'Stop loading' : 'Reload'}
                >
                    {activeTab?.status === 'loading' ? <Square size={9} fill="currentColor" /> : <RefreshCw size={10} />}
                </button>
                <div className={cn('flex h-5 min-w-0 flex-1 items-center gap-1 border bg-white/[0.025] px-1.5', addressError ? 'border-red-400/35' : 'border-white/[0.08] focus-within:border-[var(--accent-primary)]/35')}>
                    {activeTab?.url ? <AssistantBrowserPageIcon faviconUrl={activeTab.faviconUrl} size={9} /> : <Search size={9} className="shrink-0 text-sparkle-text-muted/45" />}
                    <input
                        value={addressValue}
                        onChange={(event) => {
                            setAddressValue(event.target.value)
                            setAddressError(null)
                        }}
                        onFocus={(event) => {
                            addressFocusedRef.current = true
                            event.currentTarget.select()
                        }}
                        onBlur={() => {
                            addressFocusedRef.current = false
                            if (!addressError) setAddressValue(activeTab?.url || '')
                        }}
                        onKeyDown={(event) => {
                            if (event.key === 'Escape') {
                                setAddressValue(activeTab?.url || '')
                                setAddressError(null)
                                event.currentTarget.blur()
                            }
                        }}
                        className="min-w-0 flex-1 bg-transparent text-[9px] text-sparkle-text-secondary outline-none placeholder:text-sparkle-text-muted/40"
                        placeholder="Search or enter address"
                        spellCheck={false}
                        aria-label="Browser address"
                    />
                </div>
                <button type="button" onClick={() => void openExternal()} disabled={!activeTab?.url} className="inline-flex size-5 items-center justify-center text-sparkle-text-muted hover:bg-white/[0.05] hover:text-sparkle-text disabled:opacity-25" title="Open in default browser"><ExternalLink size={10} /></button>
                <div ref={profileMenuRef} className="relative">
                    <button
                        type="button"
                        onClick={() => {
                            setProfileMenuOpen((current) => !current)
                            setClearProfileArmed(false)
                            setProfileNotice(null)
                        }}
                        className={cn(
                            'inline-flex size-5 items-center justify-center text-sparkle-text-muted hover:bg-white/[0.05] hover:text-sparkle-text',
                            profileMenuOpen && 'bg-white/[0.05] text-emerald-200/80'
                        )}
                        title="Local Zyra Browser profile"
                        aria-expanded={profileMenuOpen}
                    >
                        <ShieldCheck size={10} />
                    </button>
                    {profileMenuOpen ? (
                        <div className="absolute right-0 top-6 z-[380] w-64 border border-white/[0.10] bg-[#111927] p-2.5 text-left shadow-xl shadow-black/35">
                            <div className="flex items-start gap-2">
                                <ShieldCheck size={13} className="mt-0.5 shrink-0 text-emerald-300/75" />
                                <div>
                                    <p className="text-[10px] font-semibold text-sparkle-text-secondary">Local Zyra profile</p>
                                    <p className="mt-1 text-[9px] leading-4 text-sparkle-text-muted/70">
                                        Cookies and site logins stay on this device and are shared across Zyra threads, chats, and projects. They are never used for Resources previews.
                                    </p>
                                </div>
                            </div>
                            {profileNotice ? (
                                <p className={cn('mt-2 border px-2 py-1.5 text-[9px] leading-4', profileNotice.tone === 'error' ? 'border-red-400/20 bg-red-500/[0.06] text-red-200/80' : 'border-sky-300/15 bg-sky-500/[0.05] text-sky-100/70')}>
                                    {profileNotice.message}
                                </p>
                            ) : null}
                            <button
                                type="button"
                                onClick={() => void clearLocalBrowserProfile()}
                                disabled={clearingProfile}
                                className={cn(
                                    'mt-2 inline-flex h-6 w-full items-center justify-center gap-1.5 border text-[9px] font-medium transition-colors disabled:opacity-45',
                                    clearProfileArmed
                                        ? 'border-red-400/25 bg-red-500/[0.08] text-red-200 hover:bg-red-500/[0.13]'
                                        : 'border-white/[0.08] bg-white/[0.025] text-sparkle-text-muted hover:bg-white/[0.05] hover:text-sparkle-text-secondary'
                                )}
                            >
                                {clearingProfile ? <LoaderCircle size={10} className="animate-spin" /> : <Trash2 size={10} />}
                                {clearingProfile ? 'Clearing' : clearProfileArmed ? 'Clear now' : 'Clear local browsing data'}
                            </button>
                        </div>
                    ) : null}
                </div>
            </form>

            {addressError ? <div className="shrink-0 border-b border-red-500/15 bg-red-500/[0.06] px-2 py-1 text-[9px] text-red-300">{addressError}</div> : null}

            <div className="relative min-h-0 flex-1 overflow-hidden bg-white">
                {workspaceState.tabs.map((tab) => (
                    <AssistantBrowserWebview
                        key={tab.id}
                        ref={getWebviewRefCallback(tab.id)}
                        tab={tab}
                        config={config}
                        active={active && tab.id === activeTab?.id}
                        onStateChange={handleWebviewStateChange}
                    />
                ))}

                {activeTab?.status === 'idle' && !activeTab.url ? (
                    <div className="absolute inset-0 z-10 flex items-center justify-center overflow-y-auto bg-[color-mix(in_srgb,var(--color-bg)_96%,black)] p-5 text-center">
                        <div className="w-full max-w-[310px]">
                            <Globe2 size={20} className="mx-auto text-[var(--accent-primary)]/65" />
                            <h3 className="mt-3 text-[12px] font-semibold text-sparkle-text-secondary">Preview your project</h3>
                            <p className="mt-1 text-[10px] leading-4 text-sparkle-text-muted/65">Start a development server in Terminal, then refresh the local server list.</p>
                            <form className="mt-3 flex h-7 border border-white/[0.08] bg-white/[0.025]" onSubmit={(event) => {
                                event.preventDefault()
                                const form = new FormData(event.currentTarget)
                                void navigateActiveTab(String(form.get('address') || ''))
                            }}>
                                <input name="address" className="min-w-0 flex-1 bg-transparent px-2 text-[10px] text-sparkle-text-secondary outline-none placeholder:text-sparkle-text-muted/40" placeholder="localhost:5173 or a web address" />
                                <button type="submit" className="inline-flex w-7 items-center justify-center border-l border-white/[0.07] text-[var(--accent-primary)] hover:bg-white/[0.05]" title="Open address"><ArrowRight size={11} /></button>
                            </form>

                            <div className="mt-4 border-t border-white/[0.06] pt-3 text-left">
                                <div className="mb-1.5 flex items-center justify-between">
                                    <span className="text-[8px] font-semibold uppercase tracking-[0.1em] text-sparkle-text-muted/50">Local servers</span>
                                    <button type="button" onClick={() => void refreshLocalServers()} disabled={serversLoading} className="inline-flex size-5 items-center justify-center text-sparkle-text-muted hover:bg-white/[0.05] hover:text-sparkle-text disabled:opacity-35" title="Refresh local servers"><RefreshCw size={9} className={serversLoading ? 'animate-spin' : ''} /></button>
                                </div>
                                {localServers.length > 0 ? (
                                    <div className="space-y-1">
                                        {localServers.map((server) => (
                                            <button key={`${server.pid}:${server.port}`} type="button" onClick={() => void navigateActiveTab(server.url)} className="flex w-full items-center gap-2 border border-white/[0.06] bg-white/[0.018] px-2 py-1.5 text-left hover:border-[var(--accent-primary)]/25 hover:bg-white/[0.04]">
                                                <Server size={11} className="shrink-0 text-emerald-300/75" />
                                                <span className="min-w-0 flex-1">
                                                    <span className="block truncate text-[9px] text-sparkle-text-secondary">{server.processName}</span>
                                                    <span className="block truncate text-[8px] text-sparkle-text-muted/55">localhost:{server.port}</span>
                                                </span>
                                                <ArrowRight size={9} className="shrink-0 text-sparkle-text-muted/45" />
                                            </button>
                                        ))}
                                    </div>
                                ) : (
                                    <p className="text-[9px] leading-4 text-sparkle-text-muted/55">{serversLoading ? 'Looking for project servers…' : serversError || 'No project-linked development servers found.'}</p>
                                )}
                            </div>
                        </div>
                    </div>
                ) : null}

                {activeTab?.status === 'error' && activeTab.error ? (
                    <div className="pointer-events-none absolute inset-x-0 top-0 z-20 border-b border-red-500/15 bg-[color-mix(in_srgb,var(--color-bg)_94%,black)] px-2 py-1 text-[9px] text-red-300 shadow-sm">
                        {activeTab.error}
                    </div>
                ) : null}

                {activeTab?.status === 'loading' ? <div className="pointer-events-none absolute inset-x-0 top-0 z-30 h-px overflow-hidden bg-[var(--accent-primary)]/15 after:block after:h-full after:w-1/3 after:animate-[browser-loading-slide_1.1s_ease-in-out_infinite] after:bg-[var(--accent-primary)]" /> : null}
            </div>
        </section>
    )
})
