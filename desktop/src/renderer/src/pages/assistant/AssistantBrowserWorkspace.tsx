import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
    ArrowLeft,
    ArrowRight,
    Camera,
    Circle,
    Code2,
    Crosshair,
    Ellipsis,
    ExternalLink,
    FolderX,
    Globe2,
    LoaderCircle,
    Minus,
    MonitorSmartphone,
    Plus,
    RefreshCw,
    RotateCcw,
    Search,
    Server,
    ShieldAlert,
    ShieldCheck,
    Square,
    Trash2
} from 'lucide-react'
import type {
    DevScopeBrowserAnnotationTheme,
    DevScopeBrowserColorScheme,
    DevScopeBrowserPreviewConfig,
    DevScopeProcessInfo
} from '@shared/contracts/devscope-api'
import type { ControlStateSnapshot, ControlWorkspaceSnapshot } from '@shared/agent-control/contracts'
import type { BrowserSurfaceOpenRequest } from '@shared/agent-control/protocol'
import { TRANSIENT_MENU_DISMISS_EVENT } from '@/lib/transient-menu'
import { cn } from '@/lib/utils'
import { AssistantBrowserDeviceToolbar } from './AssistantBrowserDeviceToolbar'
import { AssistantBrowserPageIcon } from './AssistantBrowserPageIcon'
import { AssistantBrowserViewportFrame } from './AssistantBrowserViewportFrame'
import { AssistantBrowserWebview, type AssistantBrowserWebviewHandle } from './AssistantBrowserWebview'
import type { AssistantInspectorDeveloperToastInput } from './AssistantInspectorDeveloperToast'
import { publishAssistantBrowserAnnotationAttachment } from './assistant-browser-annotation-composer'
import {
    readActiveAssistantBrowserRecordingTabId,
    startAssistantBrowserRecording,
    stopAssistantBrowserRecording
} from './assistant-browser-recording'
import {
    findRememberedBrowserControlApproval,
    rememberBrowserControlApproval
} from './assistant-control-approval-preferences'
import {
    activateAssistantBrowserTab,
    addAssistantBrowserTab,
    ASSISTANT_BROWSER_TAB_LIMIT,
    browserTabFallbackTitle,
    closeAssistantBrowserTab,
    loadAssistantBrowserWorkspaceState,
    normalizeAssistantBrowserNavigation,
    normalizeAssistantBrowserZoom,
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

const BROWSER_CHROME_BUTTON_CLASS = 'inline-flex size-7 shrink-0 items-center justify-center rounded-md text-sparkle-text-muted/70 transition-colors hover:bg-[var(--surface-hover)] hover:text-sparkle-text disabled:pointer-events-none disabled:opacity-25'

function readBrowserAnnotationTheme(): DevScopeBrowserAnnotationTheme {
    const root = getComputedStyle(document.documentElement)
    const read = (property: string, fallback: string) => root.getPropertyValue(property).trim() || fallback
    const colorScheme = document.documentElement.classList.contains('light')
        || (!document.documentElement.classList.contains('dark') && window.matchMedia('(prefers-color-scheme: light)').matches)
        ? 'light'
        : 'dark'
    return {
        colorScheme,
        background: read('--color-bg', colorScheme === 'light' ? '#ffffff' : '#111318'),
        foreground: read('--color-text', colorScheme === 'light' ? '#202124' : '#f4f5f7'),
        popover: read('--color-card', colorScheme === 'light' ? '#ffffff' : '#181b21'),
        mutedForeground: read('--color-text-muted', colorScheme === 'light' ? '#667085' : '#9ba3b0'),
        border: read('--surface-divider', colorScheme === 'light' ? 'rgba(0,0,0,.12)' : 'rgba(255,255,255,.12)'),
        primary: read('--accent-primary', '#7c3aed'),
        primaryForeground: read('--accent-contrast', '#ffffff'),
        fontFamily: root.fontFamily || 'system-ui, sans-serif'
    }
}

export type AssistantBrowserWorkspaceController = {
    createTab: (url?: string) => string
    closeTab: (tabId: string) => AssistantBrowserWorkspaceState
    activateTab: (tabId: string) => void
}

export const AssistantBrowserWorkspace = memo(function AssistantBrowserWorkspace({
    workspaceKey,
    threadId,
    projectPath,
    active,
    selectedTabId,
    controlState,
    navigationRequest,
    surfaceRequest,
    onNavigationRequestHandled,
    onSurfaceRequestHandled,
    onWorkspaceStateChange,
    onTabsChange,
    onControllerChange,
    onDeveloperToast
}: {
    workspaceKey: string
    threadId: string
    projectPath: string | null
    active: boolean
    selectedTabId: string | null
    controlState: ControlStateSnapshot | null
    navigationRequest: { id: number; url: string } | null
    surfaceRequest: BrowserSurfaceOpenRequest | null
    onNavigationRequestHandled: (requestId: number) => void
    onSurfaceRequestHandled: (requestId: string) => void
    onWorkspaceStateChange: (state: ControlWorkspaceSnapshot['browser']) => void
    onTabsChange: (state: AssistantBrowserWorkspaceState) => void
    onControllerChange: (controller: AssistantBrowserWorkspaceController | null) => void
    onDeveloperToast: (toast: AssistantInspectorDeveloperToastInput) => void
}) {
    const normalizedProjectPath = String(projectPath || '').trim()
    const [workspaceState, setWorkspaceState] = useState<AssistantBrowserWorkspaceState>(() => ({
        ...loadAssistantBrowserWorkspaceState(workspaceKey),
        splitTabId: null
    }))
    const [viewportRects, setViewportRects] = useState<Record<string, { x: number; y: number; width: number; height: number }>>({})
    const [config, setConfig] = useState<DevScopeBrowserPreviewConfig | null>(null)
    const [configLoading, setConfigLoading] = useState(Boolean(normalizedProjectPath))
    const [configError, setConfigError] = useState<string | null>(null)
    const [addressValue, setAddressValue] = useState('')
    const [addressError, setAddressError] = useState<string | null>(null)
    const [profileMenuOpen, setProfileMenuOpen] = useState(false)
    const [clearProfileArmed, setClearProfileArmed] = useState(false)
    const [clearingProfile, setClearingProfile] = useState(false)
    const [profileNotice, setProfileNotice] = useState<{ tone: 'info' | 'error'; message: string } | null>(null)
    const [annotationTabId, setAnnotationTabId] = useState<string | null>(null)
    const [recordingTabId, setRecordingTabId] = useState<string | null>(() => readActiveAssistantBrowserRecordingTabId())
    const [localServers, setLocalServers] = useState<LocalServerSuggestion[]>([])
    const [serversLoading, setServersLoading] = useState(false)
    const [serversError, setServersError] = useState<string | null>(null)
    const [rememberApproval, setRememberApproval] = useState(false)
    const workspaceStateRef = useRef(workspaceState)
    const controlTargetsByTab = useMemo<Record<string, string>>(() => Object.fromEntries(
        (controlState?.targets || []).flatMap((target): Array<[string, string]> => (
            target.kind === 'zyra-browser' && target.ownerThreadId === threadId ? [[target.tabId, target.targetId]] : []
        ))
    ), [controlState?.targets, threadId])
    const controlTargetsByTabRef = useRef(controlTargetsByTab)
    const webviewRefs = useRef(new Map<string, AssistantBrowserWebviewHandle>())
    const webviewRefCallbacks = useRef(new Map<string, (handle: AssistantBrowserWebviewHandle | null) => void>())
    const pendingNavigationRef = useRef(new Map<string, string>())
    const consumedNavigationRequestsRef = useRef(new Set<number>())
    const consumedSurfaceRequestsRef = useRef(new Set<string>())
    const cancelledSurfaceRequestsRef = useRef(new Set<string>())
    const pendingSurfaceRequestsRef = useRef(new Map<string, BrowserSurfaceOpenRequest>())
    const attemptedRememberedApprovalsRef = useRef(new Set<string>())
    const onSurfaceRequestHandledRef = useRef(onSurfaceRequestHandled)
    const tabSequenceRef = useRef(tabSequenceSeed(workspaceState))
    const addressFocusedRef = useRef(false)
    const profileMenuRef = useRef<HTMLDivElement | null>(null)
    const annotationTabIdRef = useRef<string | null>(annotationTabId)

    workspaceStateRef.current = workspaceState
    annotationTabIdRef.current = annotationTabId
    controlTargetsByTabRef.current = controlTargetsByTab
    onSurfaceRequestHandledRef.current = onSurfaceRequestHandled
    const activeTab = workspaceState.tabs.find((tab) => tab.id === workspaceState.activeTabId)
        || workspaceState.tabs[0]
    const activeControlTargetId = activeTab ? controlTargetsByTab[activeTab.id] : undefined
    const activeControlGrant = controlState?.grants.find((grant) => grant.targetId === activeControlTargetId && grant.state === 'active') || null
    const activePendingGrant = controlState?.pendingGrants.find((grant) => grant.targetId === activeControlTargetId) || null
    const activeControlTarget = controlState?.targets.find((target) => target.targetId === activeControlTargetId) || null
    const canRememberApproval = Boolean(
        activePendingGrant?.principal.type === 'root'
        && activeControlTarget?.kind === 'zyra-browser'
        && activeControlTarget.origin
    )
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

    const cancelAnnotation = useCallback(() => {
        const tabId = annotationTabIdRef.current
        annotationTabIdRef.current = null
        setAnnotationTabId(null)
        if (!tabId) return
        const handle = webviewRefs.current.get(tabId)
        if (!handle) return
        try {
            void window.devscope.cancelBrowserPreviewAnnotation(handle.getDeveloperTarget()).catch(() => undefined)
        } catch {
            // A closing or navigating guest is already tearing its isolated annotation world down.
        }
    }, [])

    const failSurfaceRequest = useCallback((request: BrowserSurfaceOpenRequest, error: string) => {
        pendingSurfaceRequestsRef.current.delete(request.requestId)
        void window.devscope.agentControl.completeBrowserSurfaceRequest({
            requestId: request.requestId,
            threadId: request.threadId,
            tabId: request.tabId,
            success: false,
            error
        }).finally(() => onSurfaceRequestHandledRef.current(request.requestId))
    }, [])

    useEffect(() => {
        if (!configError) return
        for (const request of [...pendingSurfaceRequestsRef.current.values()]) {
            failSurfaceRequest(request, configError)
        }
    }, [configError, failSurfaceRequest])

    useEffect(() => window.devscope.agentControl.onBrowserSurfaceCancel((requestId) => {
        cancelledSurfaceRequestsRef.current.add(requestId)
        pendingSurfaceRequestsRef.current.delete(requestId)
        if (cancelledSurfaceRequestsRef.current.size > 100) {
            const oldest = cancelledSurfaceRequestsRef.current.values().next().value
            if (oldest) cancelledSurfaceRequestsRef.current.delete(oldest)
        }
    }), [])

    useEffect(() => {
        setRememberApproval(false)
    }, [activePendingGrant?.requestId])

    useEffect(() => {
        if (!controlState) return
        for (const request of controlState.pendingGrants) {
            if (attemptedRememberedApprovalsRef.current.has(request.requestId)) continue
            const target = controlState.targets.find((entry) => entry.targetId === request.targetId)
            if (!target) continue
            const preference = findRememberedBrowserControlApproval(request, target)
            if (!preference) continue
            attemptedRememberedApprovalsRef.current.add(request.requestId)
            const remainingMs = Math.max(1_000, Date.parse(request.expiresAt) - Date.now())
            void window.devscope.agentControl.approveGrant({
                pendingRequestId: request.requestId,
                targetId: request.targetId,
                capabilities: request.capabilities,
                durationMs: Math.min(preference.durationMs, remainingMs),
                maxActions: Math.min(preference.maxActions, request.maxActions),
                allowedOrigins: request.allowedOrigins,
                allowedExecutableIdentities: request.allowedExecutableIdentities
            })
        }
    }, [controlState])

    const handleViewportRectChange = useCallback((tabId: string, rect: { x: number; y: number; width: number; height: number } | null) => {
        setViewportRects((current) => {
            if (!rect) {
                if (!current[tabId]) return current
                const next = { ...current }
                delete next[tabId]
                return next
            }
            const previous = current[tabId]
            if (previous && previous.x === rect.x && previous.y === rect.y && previous.width === rect.width && previous.height === rect.height) return current
            return { ...current, [tabId]: rect }
        })
    }, [])

    const handleControlTargetChange = useCallback((tabId: string, targetId: string | null) => {
        if (!targetId) return
        const request = [...pendingSurfaceRequestsRef.current.values()].find((entry) => entry.tabId === tabId)
        if (!request) return
        pendingSurfaceRequestsRef.current.delete(request.requestId)
        onSurfaceRequestHandledRef.current(request.requestId)
    }, [])

    useEffect(() => {
        onTabsChange(workspaceState)
    }, [onTabsChange, workspaceState])

    useEffect(() => {
        if (!selectedTabId || workspaceStateRef.current.activeTabId === selectedTabId) return
        mutateWorkspaceState((current) => {
            const withSelectedTab = current.tabs.some((tab) => tab.id === selectedTabId)
                ? current
                : addAssistantBrowserTab(current, selectedTabId)
            return activateAssistantBrowserTab(withSelectedTab, selectedTabId)
        })
    }, [mutateWorkspaceState, selectedTabId])

    useEffect(() => {
        const visibleTabIds = active && activeTab ? [activeTab.id] : []
        onWorkspaceStateChange({
            open: true,
            activeTabId: activeTab?.id || null,
            splitTabId: null,
            visibleTabIds,
            tabs: workspaceState.tabs.map((tab) => {
                const targetId = controlTargetsByTab[tab.id] || null
                const target = targetId ? controlState?.targets.find((entry) => entry.targetId === targetId) : null
                return {
                    tabId: tab.id,
                    targetId,
                    trusted: Boolean(targetId && target?.kind === 'zyra-browser' && target.tabId === tab.id),
                    url: tab.url || null,
                    title: tab.title || null,
                    origin: target?.kind === 'zyra-browser' ? target.origin : null,
                    status: tab.status,
                    position: active && tab.id === activeTab?.id ? 'primary' : null,
                    visible: visibleTabIds.includes(tab.id),
                    viewportRect: viewportRects[tab.id] || null
                }
            })
        })
    }, [active, activeTab?.id, controlState?.targets, controlTargetsByTab, onWorkspaceStateChange, viewportRects, workspaceState.tabs])

    useEffect(() => {
        if (!addressFocusedRef.current) setAddressValue(activeTab?.url || '')
        setAddressError(null)
        const activeAnnotationTabId = annotationTabIdRef.current
        if (activeAnnotationTabId && activeAnnotationTabId !== activeTab?.id) cancelAnnotation()
    }, [activeTab?.id, activeTab?.url, cancelAnnotation])

    useEffect(() => {
        if (active) return
        cancelAnnotation()
    }, [active, cancelAnnotation])

    useEffect(() => () => cancelAnnotation(), [cancelAnnotation])

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
        const dismissProfileMenu = () => {
            setProfileMenuOpen(false)
            setClearProfileArmed(false)
        }
        const handlePointerDown = (event: PointerEvent) => {
            const target = event.target
            if (target instanceof Node && profileMenuRef.current?.contains(target)) return
            dismissProfileMenu()
        }
        const handleEscape = (event: KeyboardEvent) => {
            if (event.key === 'Escape') dismissProfileMenu()
        }
        document.addEventListener('pointerdown', handlePointerDown, true)
        window.addEventListener('keydown', handleEscape)
        window.addEventListener('blur', dismissProfileMenu)
        window.addEventListener(TRANSIENT_MENU_DISMISS_EVENT, dismissProfileMenu)
        return () => {
            document.removeEventListener('pointerdown', handlePointerDown, true)
            window.removeEventListener('keydown', handleEscape)
            window.removeEventListener('blur', dismissProfileMenu)
            window.removeEventListener(TRANSIENT_MENU_DISMISS_EVENT, dismissProfileMenu)
        }
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


    const handleWebviewStateChange = useCallback((tabId: string, patch: Partial<Omit<AssistantBrowserTabState, 'id'>>) => {
        const previous = workspaceStateRef.current.tabs.find((tab) => tab.id === tabId)
        mutateWorkspaceState((current) => updateAssistantBrowserTab(current, tabId, patch))
        if (annotationTabIdRef.current === tabId && (
            (patch.url !== undefined && patch.url !== previous?.url)
            || (patch.status === 'loading' && previous?.status !== 'loading')
            || patch.status === 'error'
        )) cancelAnnotation()
        if (tabId === workspaceStateRef.current.activeTabId && patch.url && !addressFocusedRef.current) {
            setAddressValue(patch.url)
        }
    }, [cancelAnnotation, mutateWorkspaceState])

    const navigateActiveTab = useCallback(async (rawInput: string) => {
        const target = normalizeAssistantBrowserNavigation(rawInput)
        if (!target.success) {
            setAddressError(target.error)
            return
        }
        const tabId = workspaceStateRef.current.activeTabId
        const handle = webviewRefs.current.get(tabId)
        if (annotationTabIdRef.current === tabId) cancelAnnotation()
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
    }, [cancelAnnotation, mutateWorkspaceState])

    const createTab = useCallback((url = '') => {
        const tabId = `browser:${tabSequenceRef.current++}`
        mutateWorkspaceState((current) => addAssistantBrowserTab(current, tabId, url))
        setAddressValue(url)
        setAddressError(null)
        return tabId
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

    const closeTab = useCallback((tabId: string): AssistantBrowserWorkspaceState => {
        if (!workspaceStateRef.current.tabs.some((tab) => tab.id === tabId)) return workspaceStateRef.current
        const closingHandle = webviewRefs.current.get(tabId)
        if (annotationTabIdRef.current === tabId) cancelAnnotation()
        if (closingHandle && recordingTabId === tabId) {
            try {
                const target = closingHandle.getDeveloperTarget()
                setRecordingTabId(null)
                void stopAssistantBrowserRecording(target).then((artifact) => {
                    onDeveloperToast({ message: 'Browser recording saved before the tab closed.', artifact })
                }).catch((error: unknown) => {
                    onDeveloperToast({ tone: 'error', message: error instanceof Error ? error.message : 'Could not save the closing Browser recording.' })
                })
            } catch (error) {
                setRecordingTabId(readActiveAssistantBrowserRecordingTabId())
                onDeveloperToast({ tone: 'error', message: error instanceof Error ? error.message : 'Could not stop the closing Browser recording.' })
            }
        }
        webviewRefs.current.delete(tabId)
        webviewRefCallbacks.current.delete(tabId)
        pendingNavigationRef.current.delete(tabId)
        const replacementTabId = `browser:${tabSequenceRef.current++}`
        let nextState = workspaceStateRef.current
        mutateWorkspaceState((current) => {
            nextState = closeAssistantBrowserTab(current, tabId, replacementTabId)
            return nextState
        })
        return nextState
    }, [cancelAnnotation, mutateWorkspaceState, onDeveloperToast, recordingTabId])

    const activateTab = useCallback((tabId: string) => {
        mutateWorkspaceState((current) => activateAssistantBrowserTab(current, tabId))
    }, [mutateWorkspaceState])

    const controller = useMemo<AssistantBrowserWorkspaceController>(() => ({
        createTab,
        closeTab,
        activateTab
    }), [activateTab, closeTab, createTab])

    useEffect(() => {
        onControllerChange(controller)
        return () => onControllerChange(null)
    }, [controller, onControllerChange])

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

    useEffect(() => {
        if (!surfaceRequest || consumedSurfaceRequestsRef.current.has(surfaceRequest.requestId) || cancelledSurfaceRequestsRef.current.has(surfaceRequest.requestId)) return
        if (surfaceRequest.threadId !== threadId) {
            failSurfaceRequest(surfaceRequest, 'The Browser surface request belongs to another chat thread.')
            return
        }
        const mode = surfaceRequest.mode || 'open'
        const knownTargetId = controlTargetsByTabRef.current[surfaceRequest.tabId]
        const knownSecondaryTargetId = surfaceRequest.secondaryTabId
            ? controlTargetsByTabRef.current[surfaceRequest.secondaryTabId]
            : undefined
        if (surfaceRequest.targetId && !knownTargetId) return
        if (surfaceRequest.secondaryTargetId && !knownSecondaryTargetId) return
        consumedSurfaceRequestsRef.current.add(surfaceRequest.requestId)
        if (consumedSurfaceRequestsRef.current.size > 100) {
            const oldest = consumedSurfaceRequestsRef.current.values().next().value
            if (oldest) consumedSurfaceRequestsRef.current.delete(oldest)
        }
        if (surfaceRequest.targetId && knownTargetId !== surfaceRequest.targetId) {
            failSurfaceRequest(surfaceRequest, 'The selected Browser tab no longer matches its trusted target.')
            return
        }
        if (surfaceRequest.secondaryTargetId && knownSecondaryTargetId !== surfaceRequest.secondaryTargetId) {
            failSurfaceRequest(surfaceRequest, 'The secondary Browser tab no longer matches its trusted target.')
            return
        }
        if (!normalizedProjectPath) {
            failSurfaceRequest(surfaceRequest, 'Attach a project to this chat before using the in-app Browser.')
            return
        }
        if (configError) {
            failSurfaceRequest(surfaceRequest, configError)
            return
        }
        const complete = (success: true | false, error?: string) => window.devscope.agentControl.completeBrowserSurfaceRequest({
            requestId: surfaceRequest.requestId,
            threadId: surfaceRequest.threadId,
            tabId: surfaceRequest.tabId,
            ...(success ? { success: true as const, targetId: knownTargetId! } : { success: false as const, error: error || 'Browser command failed.' })
        })

        if (mode === 'close' || mode === 'refresh' || mode === 'external') {
            if (!knownTargetId) {
                failSurfaceRequest(surfaceRequest, 'The selected Browser tab is no longer registered.')
                return
            }
            void (async () => {
                try {
                    if (cancelledSurfaceRequestsRef.current.has(surfaceRequest.requestId)) return
                    const claim = await window.devscope.agentControl.claimBrowserSurfaceRequest({
                        requestId: surfaceRequest.requestId,
                        threadId: surfaceRequest.threadId,
                        tabId: surfaceRequest.tabId
                    })
                    if (!claim.success) throw new Error(claim.error || 'The Browser command was cancelled before it started.')
                    if (!claim.claimed) throw new Error('The Browser command was cancelled before it started.')
                    if (mode === 'external') {
                        const url = surfaceRequest.url || workspaceStateRef.current.tabs.find((tab) => tab.id === surfaceRequest.tabId)?.url || ''
                        const result = await window.devscope.openBrowserPreviewExternal(url)
                        if (!result.success) throw new Error(result.error || 'Could not open the default browser.')
                    } else if (mode !== 'close') {
                        const handle = webviewRefs.current.get(surfaceRequest.tabId)
                        if (!handle) throw new Error('The selected Browser view is not ready.')
                        handle.reload()
                    }
                    if (mode === 'close') {
                        closeTab(surfaceRequest.tabId)
                        if (workspaceStateRef.current.tabs.some((tab) => tab.id === surfaceRequest.tabId)) {
                            throw new Error('The selected Browser tab did not leave the retained workspace.')
                        }
                    }
                    const result = await complete(true)
                    if (!result.success) throw new Error(result.error || 'Could not finish the Browser command.')
                } catch (error) {
                    await complete(false, error instanceof Error ? error.message : 'Browser command failed.')
                } finally {
                    onSurfaceRequestHandledRef.current(surfaceRequest.requestId)
                }
            })()
            return
        }

        const requestedTabIds = [surfaceRequest.tabId, surfaceRequest.secondaryTabId]
            .filter((tabId): tabId is string => Boolean(tabId))
        const missingCount = requestedTabIds.filter((tabId) => !workspaceStateRef.current.tabs.some((tab) => tab.id === tabId)).length
        if (workspaceStateRef.current.tabs.length + missingCount > ASSISTANT_BROWSER_TAB_LIMIT) {
            failSurfaceRequest(surfaceRequest, `Close a Browser tab first; the ${ASSISTANT_BROWSER_TAB_LIMIT}-tab limit is full.`)
            return
        }
        mutateWorkspaceState((current) => {
            let next = current
            for (const tabId of requestedTabIds) next = addAssistantBrowserTab(next, tabId)
            return activateAssistantBrowserTab({ ...next, splitTabId: null }, surfaceRequest.tabId)
        })
        if (knownTargetId) {
            void complete(true).finally(() => onSurfaceRequestHandledRef.current(surfaceRequest.requestId))
        } else {
            pendingSurfaceRequestsRef.current.set(surfaceRequest.requestId, surfaceRequest)
        }
    }, [closeTab, configError, controlTargetsByTab, failSurfaceRequest, mutateWorkspaceState, normalizedProjectPath, surfaceRequest, threadId])

    const getActiveDeveloperTarget = useCallback(() => {
        const tabId = workspaceStateRef.current.activeTabId
        const handle = webviewRefs.current.get(tabId)
        if (!handle) throw new Error('Browser view is not ready yet.')
        return { tabId, handle, target: handle.getDeveloperTarget() }
    }, [])

    const updateActiveViewport = useCallback((viewport: AssistantBrowserTabState['viewport']) => {
        const tabId = workspaceStateRef.current.activeTabId
        mutateWorkspaceState((current) => updateAssistantBrowserTab(current, tabId, { viewport }))
    }, [mutateWorkspaceState])

    const updateActiveZoom = useCallback(async (requested: number) => {
        try {
            const { tabId, target } = getActiveDeveloperTarget()
            const factor = normalizeAssistantBrowserZoom(requested)
            const result = await window.devscope.setBrowserPreviewZoom({ ...target, factor })
            if (!result.success) throw new Error(result.error || 'Could not change Browser zoom.')
            mutateWorkspaceState((current) => updateAssistantBrowserTab(current, tabId, { zoomFactor: result.factor }))
        } catch (error) {
            onDeveloperToast({ tone: 'error', message: error instanceof Error ? error.message : 'Could not change Browser zoom.' })
        }
    }, [getActiveDeveloperTarget, mutateWorkspaceState, onDeveloperToast])

    const updateActiveColorScheme = useCallback(async (colorScheme: DevScopeBrowserColorScheme) => {
        try {
            const { tabId, target } = getActiveDeveloperTarget()
            const result = await window.devscope.setBrowserPreviewColorScheme({ ...target, colorScheme })
            if (!result.success) throw new Error(result.error || 'Could not emulate the Browser color scheme.')
            mutateWorkspaceState((current) => updateAssistantBrowserTab(current, tabId, { colorScheme }))
            onDeveloperToast({ message: colorScheme === 'system' ? 'Page appearance follows the system.' : `Page appearance is ${colorScheme}.` })
            setProfileMenuOpen(false)
        } catch (error) {
            onDeveloperToast({ tone: 'error', message: error instanceof Error ? error.message : 'Could not emulate the Browser color scheme.' })
        }
    }, [getActiveDeveloperTarget, mutateWorkspaceState, onDeveloperToast])

    useEffect(() => {
        if (!activeTab || !controlTargetsByTab[activeTab.id]) return
        const handle = webviewRefs.current.get(activeTab.id)
        if (!handle) return
        let cancelled = false
        try {
            const target = handle.getDeveloperTarget()
            void Promise.all([
                window.devscope.setBrowserPreviewZoom({ ...target, factor: activeTab.zoomFactor }),
                window.devscope.setBrowserPreviewColorScheme({ ...target, colorScheme: activeTab.colorScheme })
            ]).then((results) => {
                if (cancelled) return
                const failure = results.find((result) => !result.success)
                if (failure && !failure.success) onDeveloperToast({ tone: 'error', message: failure.error })
            })
        } catch {
            // The bound target can arrive one layout pass before the webview handle.
        }
        return () => {
            cancelled = true
        }
    }, [activeTab?.colorScheme, activeTab?.id, activeTab?.zoomFactor, controlTargetsByTab, onDeveloperToast])

    const hardReloadActiveTab = useCallback(async () => {
        try {
            const { tabId, target } = getActiveDeveloperTarget()
            if (annotationTabIdRef.current === tabId) cancelAnnotation()
            const result = await window.devscope.hardReloadBrowserPreview(target)
            if (!result.success) throw new Error(result.error || 'Could not hard reload the Browser tab.')
            mutateWorkspaceState((current) => updateAssistantBrowserTab(current, tabId, { status: 'loading', error: null }))
            onDeveloperToast({ message: 'Hard reload started with cache bypassed.' })
            setProfileMenuOpen(false)
        } catch (error) {
            onDeveloperToast({ tone: 'error', message: error instanceof Error ? error.message : 'Could not hard reload the Browser tab.' })
        }
    }, [cancelAnnotation, getActiveDeveloperTarget, mutateWorkspaceState, onDeveloperToast])

    const openActiveDevTools = useCallback(async () => {
        try {
            const { tabId, target } = getActiveDeveloperTarget()
            if (annotationTabIdRef.current === tabId) cancelAnnotation()
            const result = await window.devscope.openBrowserPreviewDevTools(target)
            if (!result.success) throw new Error(result.error || 'Could not open Browser DevTools.')
            setProfileMenuOpen(false)
        } catch (error) {
            onDeveloperToast({ tone: 'error', message: error instanceof Error ? error.message : 'Could not open Browser DevTools.' })
        }
    }, [cancelAnnotation, getActiveDeveloperTarget, onDeveloperToast])

    const captureActiveScreenshot = useCallback(async () => {
        try {
            const { target } = getActiveDeveloperTarget()
            const result = await window.devscope.captureBrowserPreviewScreenshot(target)
            if (!result.success) throw new Error(result.error || 'Could not capture the Browser tab.')
            onDeveloperToast({ message: '', artifact: result.artifact })
        } catch (error) {
            onDeveloperToast({ tone: 'error', message: error instanceof Error ? error.message : 'Could not capture the Browser tab.' })
        }
    }, [getActiveDeveloperTarget, onDeveloperToast])

    const toggleAnnotation = useCallback(async () => {
        if (annotationTabIdRef.current) {
            cancelAnnotation()
            return
        }
        let tabId: string | null = null
        try {
            const activeDeveloper = getActiveDeveloperTarget()
            tabId = activeDeveloper.tabId
            annotationTabIdRef.current = tabId
            setAnnotationTabId(tabId)
            const result = await window.devscope.startBrowserPreviewAnnotation({
                ...activeDeveloper.target,
                theme: readBrowserAnnotationTheme()
            })
            if (!result.success) throw new Error(result.error || 'Could not annotate the Browser tab.')
            if (result.annotation && result.artifact) {
                const staged = await window.devscope.stageBrowserPreviewArtifactForAssistant(result.artifact.artifactId)
                if (!staged.success) throw new Error(staged.error || 'Could not attach the Browser annotation to chat.')
                publishAssistantBrowserAnnotationAttachment({
                    sessionId: workspaceKey,
                    reference: staged.reference,
                    annotation: result.annotation,
                    artifact: result.artifact
                })
            }
        } catch (error) {
            if (tabId && annotationTabIdRef.current !== tabId) return
            onDeveloperToast({ tone: 'error', message: error instanceof Error ? error.message : 'Could not annotate the Browser tab.' })
        } finally {
            if (tabId && annotationTabIdRef.current === tabId) {
                annotationTabIdRef.current = null
                setAnnotationTabId(null)
            }
        }
    }, [cancelAnnotation, getActiveDeveloperTarget, onDeveloperToast, workspaceKey])

    const toggleActiveRecording = useCallback(async () => {
        try {
            const { tabId, target, handle } = getActiveDeveloperTarget()
            if (annotationTabIdRef.current === tabId) cancelAnnotation()
            if (recordingTabId) {
                if (recordingTabId !== tabId) throw new Error('Another Browser tab is already recording.')
                const artifact = await stopAssistantBrowserRecording(target)
                setRecordingTabId(null)
                onDeveloperToast({ message: 'Browser recording saved.', artifact })
                return
            }
            await startAssistantBrowserRecording(target, handle.getViewportSize())
            setRecordingTabId(tabId)
            onDeveloperToast({ message: 'Recording this Browser tab.' })
        } catch (error) {
            setRecordingTabId(readActiveAssistantBrowserRecordingTabId())
            onDeveloperToast({ tone: 'error', message: error instanceof Error ? error.message : 'Could not change Browser recording state.' })
        }
    }, [cancelAnnotation, getActiveDeveloperTarget, onDeveloperToast, recordingTabId])

    const clearBrowserCache = useCallback(async () => {
        const result = await window.devscope.clearBrowserPreviewCache()
        onDeveloperToast(result.success
            ? { message: 'Integrated Browser cache cleared.' }
            : { tone: 'error', message: result.error || 'Could not clear the Browser cache.' })
        if (result.success) setProfileMenuOpen(false)
    }, [onDeveloperToast])

    const clearBrowserCookies = useCallback(async () => {
        const result = await window.devscope.clearBrowserPreviewCookies()
        onDeveloperToast(result.success
            ? { message: 'Integrated Browser cookies and authentication cleared.' }
            : { tone: 'error', message: result.error || 'Could not clear Browser cookies.' })
        if (result.success) {
            for (const handle of webviewRefs.current.values()) handle.reload()
            setProfileMenuOpen(false)
        }
    }, [onDeveloperToast])

    const openExternal = useCallback(async () => {
        if (!activeTab?.url) return
        const result = await window.devscope.openBrowserPreviewExternal(activeTab.url)
        if (!result.success) setAddressError(result.error || 'Could not open the page externally.')
    }, [activeTab?.url])

    const approveActivePendingGrant = useCallback(async () => {
        if (!activePendingGrant) return
        const remainingMs = Math.max(1_000, Date.parse(activePendingGrant.expiresAt) - Date.now())
        const durationMs = Math.min(10 * 60 * 1000, remainingMs)
        const result = await window.devscope.agentControl.approveGrant({
            pendingRequestId: activePendingGrant.requestId,
            targetId: activePendingGrant.targetId,
            capabilities: activePendingGrant.capabilities,
            durationMs,
            maxActions: activePendingGrant.maxActions,
            allowedOrigins: activePendingGrant.allowedOrigins,
            allowedExecutableIdentities: activePendingGrant.allowedExecutableIdentities
        })
        if (!result.success) {
            setAddressError(result.error || 'Could not approve Browser control.')
            return
        }
        if (rememberApproval && activeControlTarget) {
            rememberBrowserControlApproval({
                request: activePendingGrant,
                target: activeControlTarget,
                capabilities: activePendingGrant.capabilities,
                durationMs,
                maxActions: activePendingGrant.maxActions
            })
        }
    }, [activeControlTarget, activePendingGrant, rememberApproval])

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
                onDeveloperToast({ tone: 'error', message: result.error || 'Could not clear local Browser data.' })
                return
            }
            for (const handle of webviewRefs.current.values()) handle.reload()
            setClearProfileArmed(false)
            setProfileMenuOpen(false)
            onDeveloperToast({ message: 'Local Browser cookies and site data were cleared.' })
        } catch (error: unknown) {
            onDeveloperToast({
                tone: 'error',
                message: error instanceof Error ? error.message : 'Could not clear local Browser data.'
            })
        } finally {
            setClearingProfile(false)
        }
    }, [clearProfileArmed, onDeveloperToast])

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
        <section className="flex min-h-0 flex-1 flex-col overflow-hidden bg-sparkle-bg" aria-label="Browser workspace">
            <form
                className="relative z-30 flex h-10 shrink-0 items-center gap-1 border-b border-[var(--surface-divider)] bg-sparkle-bg px-2"
                onSubmit={(event) => {
                    event.preventDefault()
                    void navigateActiveTab(addressValue)
                }}
            >
                <button type="button" onClick={() => activeTab && webviewRefs.current.get(activeTab.id)?.goBack()} disabled={!activeTab?.canGoBack} className={BROWSER_CHROME_BUTTON_CLASS} title="Back"><ArrowLeft size={14} /></button>
                <button type="button" onClick={() => activeTab && webviewRefs.current.get(activeTab.id)?.goForward()} disabled={!activeTab?.canGoForward} className={BROWSER_CHROME_BUTTON_CLASS} title="Forward"><ArrowRight size={14} /></button>
                <button
                    type="button"
                    onClick={() => {
                        if (!activeTab) return
                        const handle = webviewRefs.current.get(activeTab.id)
                        if (activeTab.status === 'loading') handle?.stop()
                        else handle?.reload()
                    }}
                    disabled={!activeTab?.url}
                    className={BROWSER_CHROME_BUTTON_CLASS}
                    title={activeTab?.status === 'loading' ? 'Stop loading' : 'Reload'}
                >
                    {activeTab?.status === 'loading' ? <Square size={10} fill="currentColor" /> : <RefreshCw size={13} />}
                </button>
                <div className={cn(
                    'group/address flex h-7 min-w-0 flex-1 items-center gap-1.5 rounded-md border border-transparent bg-transparent px-2 transition-colors hover:bg-[var(--surface-hover)] focus-within:border-[var(--surface-divider)] focus-within:bg-[var(--color-bg)]',
                    addressError && 'border-red-400/35'
                )}>
                    {activeTab?.url ? <AssistantBrowserPageIcon faviconUrl={activeTab.faviconUrl} size={12} /> : <Search size={12} className="shrink-0 text-sparkle-text-muted/45" />}
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
                        className="min-w-0 flex-1 bg-transparent text-[11px] text-sparkle-text-secondary outline-none placeholder:text-sparkle-text-muted/40"
                        placeholder="Search or enter address"
                        spellCheck={false}
                        aria-label="Browser address"
                    />
                </div>
                <button
                    type="button"
                    onClick={() => void toggleAnnotation()}
                    disabled={!activeTab?.url}
                    className={cn(BROWSER_CHROME_BUTTON_CLASS, annotationTabId === activeTab?.id && 'bg-[var(--surface-hover)] text-[var(--accent-primary)]')}
                    title={annotationTabId === activeTab?.id ? 'Cancel annotation' : 'Annotate page'}
                    aria-pressed={annotationTabId === activeTab?.id}
                >
                    <Crosshair size={13} />
                </button>
                <button type="button" onClick={() => void captureActiveScreenshot()} disabled={!activeTab?.url} className={BROWSER_CHROME_BUTTON_CLASS} title="Capture screenshot"><Camera size={13} /></button>
                {activePendingGrant ? (
                    <div className="flex h-5 items-center gap-1 border border-sky-300/25 bg-sky-400/[0.08] px-1 text-[8px] text-sky-100" title="An agent is waiting for your approval to control this exact tab.">
                        <ShieldAlert size={9} />
                        <span>Allow agent?</span>
                        <button type="button" onClick={() => void approveActivePendingGrant()} className="px-0.5 font-semibold hover:bg-white/[0.08]" title="Approve bounded Browser control">Allow</button>
                        <button type="button" onClick={() => void window.devscope.agentControl.rejectGrant(activePendingGrant.requestId)} className="px-0.5 hover:bg-white/[0.08]" title="Deny Browser control">Deny</button>
                    </div>
                ) : activeControlGrant ? (
                    <div className="flex h-5 items-center gap-1 border border-amber-300/25 bg-amber-400/[0.08] px-1 text-[8px] text-amber-100" title={`Controlled by ${activeControlGrant.principal.type === 'root' ? 'root agent' : activeControlGrant.principal.agentRunId}`}>
                        <ShieldAlert size={9} />
                        <span>{Math.max(0, activeControlGrant.maxActions - activeControlGrant.actionCount)}</span>
                        <button type="button" onClick={() => void window.devscope.agentControl.revokeGrant(activeControlGrant.grantId)} className="px-0.5 hover:bg-white/[0.08]" title="Revoke Browser control">Revoke</button>
                        <button type="button" onClick={() => void window.devscope.agentControl.emergencyStop()} className="px-0.5 text-red-200 hover:bg-red-400/[0.12]" title="Emergency stop all control">Stop all</button>
                    </div>
                ) : null}
                <div ref={profileMenuRef} className="relative">
                    <button
                        type="button"
                        onClick={() => {
                            setProfileMenuOpen((current) => !current)
                            setClearProfileArmed(false)
                            setProfileNotice(null)
                        }}
                        className={cn(
                            BROWSER_CHROME_BUTTON_CLASS,
                            profileMenuOpen && 'bg-[var(--surface-hover)] text-emerald-300/80'
                        )}
                        title="Browser developer tools"
                        aria-label="Browser developer tools"
                        aria-expanded={profileMenuOpen}
                    >
                        <Ellipsis size={14} />
                    </button>
                    {profileMenuOpen ? (
                        <div className="absolute right-0 top-8 z-[380] w-56 rounded-lg border border-[var(--surface-divider)] bg-sparkle-card p-1 text-left shadow-xl shadow-black/25">
                            <button type="button" onClick={() => void hardReloadActiveTab()} disabled={!activeTab?.url} className="flex h-7 w-full items-center gap-2 rounded-md px-2 text-[10px] text-sparkle-text-secondary hover:bg-[var(--surface-hover)] disabled:opacity-35"><RefreshCw size={12} /><span>Hard reload</span></button>
                            <button type="button" onClick={() => void openActiveDevTools()} disabled={!activeTab?.url} className="flex h-7 w-full items-center gap-2 rounded-md px-2 text-[10px] text-sparkle-text-secondary hover:bg-[var(--surface-hover)] disabled:opacity-35"><Code2 size={12} /><span>Open DevTools</span></button>
                            <button type="button" onClick={() => {
                                if (!activeTab) return
                                updateActiveViewport(activeTab.viewport.mode === 'fill'
                                    ? { mode: 'freeform', width: 1280, height: 800, presetId: null, aspectRatio: null }
                                    : { mode: 'fill' })
                                setProfileMenuOpen(false)
                            }} disabled={!activeTab} className="flex h-7 w-full items-center gap-2 rounded-md px-2 text-[10px] text-sparkle-text-secondary hover:bg-[var(--surface-hover)] disabled:opacity-35"><MonitorSmartphone size={12} /><span>{activeTab?.viewport.mode === 'fill' ? 'Show device toolbar' : 'Hide device toolbar'}</span></button>
                            <div className="my-1 h-px bg-[var(--surface-divider)]" />
                            <div className="flex h-7 items-center gap-1 px-2 text-[10px] text-sparkle-text-secondary">
                                <span className="mr-auto">Appearance</span>
                                {(['system', 'light', 'dark'] as const).map((scheme) => (
                                    <button key={scheme} type="button" onClick={() => void updateActiveColorScheme(scheme)} className={cn('rounded px-1.5 py-1 text-[8px] capitalize text-sparkle-text-muted hover:bg-[var(--surface-hover)] hover:text-sparkle-text', activeTab?.colorScheme === scheme && 'bg-[var(--surface-hover)] text-[var(--accent-primary)]')}>{scheme}</button>
                                ))}
                            </div>
                            <div className="flex h-8 items-center px-2 text-[10px] text-sparkle-text-secondary">
                                <span className="mr-auto">Zoom</span>
                                <button type="button" onClick={() => void updateActiveZoom((activeTab?.zoomFactor || 1) - 0.1)} disabled={(activeTab?.zoomFactor || 1) <= 0.25} className="inline-flex size-6 items-center justify-center rounded border border-[var(--surface-divider)] text-sparkle-text-muted hover:bg-[var(--surface-hover)] disabled:opacity-30" aria-label="Zoom out"><Minus size={10} /></button>
                                <button type="button" onClick={() => void updateActiveZoom(1)} className="h-6 min-w-11 text-[9px] tabular-nums text-sparkle-text-muted hover:text-sparkle-text" aria-label="Reset zoom">{Math.round((activeTab?.zoomFactor || 1) * 100)}%</button>
                                <button type="button" onClick={() => void updateActiveZoom((activeTab?.zoomFactor || 1) + 0.1)} disabled={(activeTab?.zoomFactor || 1) >= 2} className="inline-flex size-6 items-center justify-center rounded border border-[var(--surface-divider)] text-sparkle-text-muted hover:bg-[var(--surface-hover)] disabled:opacity-30" aria-label="Zoom in"><Plus size={10} /></button>
                                <button type="button" onClick={() => void updateActiveZoom(1)} className="ml-1 inline-flex size-6 items-center justify-center rounded text-sparkle-text-muted hover:bg-[var(--surface-hover)]" aria-label="Reset zoom"><RotateCcw size={10} /></button>
                            </div>
                            <div className="my-1 h-px bg-[var(--surface-divider)]" />
                            <button type="button" onClick={() => void toggleActiveRecording()} disabled={!activeTab?.url || Boolean(recordingTabId && recordingTabId !== activeTab?.id)} className={cn('flex h-7 w-full items-center gap-2 rounded-md px-2 text-[10px] text-sparkle-text-secondary hover:bg-[var(--surface-hover)] disabled:opacity-35', recordingTabId === activeTab?.id && 'text-red-300')}><Circle size={11} fill={recordingTabId === activeTab?.id ? 'currentColor' : 'none'} /><span>{recordingTabId === activeTab?.id ? 'Stop and save recording' : 'Record Browser tab'}</span></button>
                            <button type="button" onClick={() => void openExternal()} disabled={!activeTab?.url} className="flex h-7 w-full items-center gap-2 rounded-md px-2 text-[10px] text-sparkle-text-secondary hover:bg-[var(--surface-hover)] disabled:opacity-35"><ExternalLink size={12} /><span>Open in default browser</span></button>
                            <div className="my-1 h-px bg-[var(--surface-divider)]" />
                            <button type="button" onClick={() => void clearBrowserCookies()} className="flex h-7 w-full items-center gap-2 rounded-md px-2 text-[10px] text-sparkle-text-secondary hover:bg-[var(--surface-hover)]"><ShieldCheck size={12} /><span>Clear cookies</span></button>
                            <button type="button" onClick={() => void clearBrowserCache()} className="flex h-7 w-full items-center gap-2 rounded-md px-2 text-[10px] text-sparkle-text-secondary hover:bg-[var(--surface-hover)]"><Trash2 size={12} /><span>Clear cache</span></button>
                            <button type="button" onClick={() => void clearLocalBrowserProfile()} disabled={clearingProfile} title="Clear the shared Local Zyra profile used by Browser tabs across chats and projects" className={cn('flex h-7 w-full items-center gap-2 rounded-md px-2 text-[10px] hover:bg-[var(--surface-hover)] disabled:opacity-35', clearProfileArmed ? 'text-red-300' : 'text-sparkle-text-secondary')}>
                                {clearingProfile ? <LoaderCircle size={11} className="animate-spin" /> : <Trash2 size={11} />}
                                <span>{clearingProfile ? 'Clearing local data' : clearProfileArmed ? 'Confirm clear all site data' : 'Clear all local browsing data'}</span>
                            </button>
                            {profileNotice ? <p className="px-2 py-1 text-[8px] leading-3 text-sparkle-text-muted/60">{profileNotice.message}</p> : null}
                        </div>
                    ) : null}
                </div>
            </form>

            {addressError ? <div className="shrink-0 border-b border-red-500/15 bg-red-500/[0.06] px-2 py-1 text-[9px] text-red-300">{addressError}</div> : null}
            {activeTab?.viewport.mode !== 'fill' ? (
                <AssistantBrowserDeviceToolbar
                    viewport={activeTab.viewport}
                    onViewportChange={updateActiveViewport}
                    onClose={() => updateActiveViewport({ mode: 'fill' })}
                />
            ) : null}

            <div className="relative min-h-0 flex-1 overflow-hidden bg-white">
                {workspaceState.tabs.map((tab) => {
                    const visible = active && tab.id === activeTab?.id
                    const targetId = controlTargetsByTab[tab.id]
                    const grant = targetId ? controlState?.grants.find((entry) => entry.targetId === targetId && entry.state === 'active') : null
                    const cursor = targetId ? controlState?.cursors.find((entry) => entry.targetId === targetId) || null : null
                    return (
                        <AssistantBrowserViewportFrame
                            key={tab.id}
                            viewport={tab.viewport}
                            zoomFactor={tab.zoomFactor}
                            visible={visible}
                            controlled={Boolean(grant)}
                            cursor={cursor}
                            onViewportChange={(viewport) => {
                                mutateWorkspaceState((current) => updateAssistantBrowserTab(current, tab.id, { viewport }))
                            }}
                        >
                            <AssistantBrowserWebview
                                ref={getWebviewRefCallback(tab.id)}
                                tab={tab}
                                threadId={threadId}
                                config={config}
                                visible={visible}
                                placement="full"
                                onStateChange={handleWebviewStateChange}
                                onControlTargetChange={handleControlTargetChange}
                                onViewportRectChange={handleViewportRectChange}
                            />
                        </AssistantBrowserViewportFrame>
                    )
                })}


                {activePendingGrant ? (
                    <div
                        className="absolute inset-0 z-[45] flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-[2px]"
                        role="dialog"
                        aria-modal="true"
                        aria-label="Browser control permission requested"
                    >
                        <section className="w-full max-w-[320px] rounded-xl border border-amber-200/25 bg-sparkle-card/98 p-3.5 shadow-2xl shadow-black/35">
                            <div className="flex items-start gap-2.5">
                                <span className="mt-0.5 inline-flex size-7 shrink-0 items-center justify-center rounded-full border border-amber-200/20 bg-amber-300/[0.08] text-amber-200"><ShieldAlert size={14} /></span>
                                <div className="min-w-0">
                                    <h3 className="text-[11px] font-semibold text-sparkle-text">Allow Zyra to control this tab?</h3>
                                    <p className="mt-1 truncate text-[9px] text-sparkle-text-muted/70">{activeControlTarget?.kind === 'zyra-browser' ? activeControlTarget.origin || 'Blank tab' : 'In-app Browser tab'}</p>
                                </div>
                            </div>
                            <p className="mt-2.5 text-[9px] leading-4 text-sparkle-text-muted/75">
                                This request is limited to this tab, its approved site, {activePendingGrant.maxActions} successful operations, and the capabilities below.
                            </p>
                            <div className="mt-2 flex max-h-20 flex-wrap gap-1 overflow-y-auto">
                                {activePendingGrant.capabilities.map((capability) => (
                                    <span key={capability} className="rounded-full border border-white/[0.07] bg-white/[0.025] px-1.5 py-0.5 text-[7px] text-sparkle-text-muted/70">{capability}</span>
                                ))}
                            </div>
                            {canRememberApproval ? (
                                <label className="mt-3 flex cursor-pointer items-start gap-2 rounded-lg border border-white/[0.06] bg-white/[0.02] p-2 text-[9px] leading-4 text-sparkle-text-muted/80">
                                    <input type="checkbox" checked={rememberApproval} onChange={(event) => setRememberApproval(event.target.checked)} className="mt-0.5" />
                                    <span><strong className="font-semibold text-sparkle-text-secondary">Don’t ask again for this site.</strong><br />Future root-agent requests remain limited to this exact origin and capability set.</span>
                                </label>
                            ) : null}
                            <div className="mt-3 flex gap-2">
                                <button type="button" onClick={() => void window.devscope.agentControl.rejectGrant(activePendingGrant.requestId)} className="h-7 flex-1 rounded-md border border-white/[0.08] text-[9px] text-sparkle-text-muted hover:bg-white/[0.04]">Not now</button>
                                <button type="button" onClick={() => void approveActivePendingGrant()} className="h-7 flex-1 rounded-md border border-emerald-300/25 bg-emerald-400/[0.10] text-[9px] font-semibold text-emerald-100 hover:bg-emerald-400/[0.16]">Allow bounded control</button>
                            </div>
                        </section>
                    </div>
                ) : null}

                {activeTab?.status === 'idle' && !activeTab.url ? (
                    <div className="absolute inset-0 z-10 flex items-center justify-center overflow-y-auto bg-sparkle-bg p-5 text-center">
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
                    <div className="pointer-events-none absolute inset-x-0 top-0 z-20 border-b border-red-500/15 bg-sparkle-bg px-2 py-1 text-[9px] text-red-300 shadow-sm">
                        {activeTab.error}
                    </div>
                ) : null}

                {activeTab?.status === 'loading' ? <div className="pointer-events-none absolute inset-x-0 top-0 z-30 h-px overflow-hidden bg-[var(--accent-primary)]/15 after:block after:h-full after:w-1/3 after:animate-[browser-loading-slide_1.1s_ease-in-out_infinite] after:bg-[var(--accent-primary)]" /> : null}
            </div>
        </section>
    )
})
