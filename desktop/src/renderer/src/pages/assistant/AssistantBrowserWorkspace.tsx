import { memo, useCallback, useEffect, useRef, useState } from 'react'
import {
    ArrowLeft,
    ArrowRight,
    Columns2,
    ExternalLink,
    FolderX,
    Globe2,
    LoaderCircle,
    MousePointer2,
    Plus,
    RefreshCw,
    Search,
    Server,
    ShieldAlert,
    ShieldCheck,
    Square,
    Trash2,
    Volume2,
    X
} from 'lucide-react'
import type { DevScopeBrowserPreviewConfig, DevScopeProcessInfo } from '@shared/contracts/devscope-api'
import type { ControlStateSnapshot, ControlWorkspaceSnapshot } from '@shared/agent-control/contracts'
import type { BrowserSurfaceOpenRequest } from '@shared/agent-control/protocol'
import { cn } from '@/lib/utils'
import { AssistantBrowserAgentCursor } from './AssistantBrowserAgentCursor'
import { AssistantBrowserPageIcon } from './AssistantBrowserPageIcon'
import { AssistantBrowserWebview, type AssistantBrowserWebviewHandle } from './AssistantBrowserWebview'
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
    persistAssistantBrowserWorkspaceState,
    setAssistantBrowserLayout,
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
    threadId,
    projectPath,
    active,
    navigationRequest,
    surfaceRequest,
    onNavigationRequestHandled,
    onSurfaceRequestHandled,
    onWorkspaceStateChange,
    onAudibleChange,
    onActiveFaviconChange
}: {
    workspaceKey: string
    threadId: string
    projectPath: string | null
    active: boolean
    navigationRequest: { id: number; url: string } | null
    surfaceRequest: BrowserSurfaceOpenRequest | null
    onNavigationRequestHandled: (requestId: number) => void
    onSurfaceRequestHandled: (requestId: string) => void
    onWorkspaceStateChange: (state: ControlWorkspaceSnapshot['browser']) => void
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
    const [controlState, setControlState] = useState<ControlStateSnapshot | null>(null)
    const [controlTargetsByTab, setControlTargetsByTab] = useState<Record<string, string>>({})
    const [rememberApproval, setRememberApproval] = useState(false)
    const workspaceStateRef = useRef(workspaceState)
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

    workspaceStateRef.current = workspaceState
    controlTargetsByTabRef.current = controlTargetsByTab
    onSurfaceRequestHandledRef.current = onSurfaceRequestHandled
    const activeTab = workspaceState.tabs.find((tab) => tab.id === workspaceState.activeTabId)
        || workspaceState.tabs[0]
    const splitTab = workspaceState.splitTabId
        ? workspaceState.tabs.find((tab) => tab.id === workspaceState.splitTabId) || null
        : null
    const visibleTabs = [activeTab, splitTab].filter((tab): tab is AssistantBrowserTabState => Boolean(tab))
    const hasAudibleTab = workspaceState.tabs.some((tab) => tab.audible)
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
        let cancelled = false
        void window.devscope.agentControl.getState().then((result) => {
            if (!cancelled && result.success) setControlState(result.state)
        })
        const unsubscribe = window.devscope.agentControl.onStateChange((state) => {
            if (!cancelled) setControlState(state)
        })
        return () => { cancelled = true; unsubscribe() }
    }, [])

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

    const handleControlTargetChange = useCallback((tabId: string, targetId: string | null) => {
        if (targetId) {
            const request = [...pendingSurfaceRequestsRef.current.values()].find((entry) => entry.tabId === tabId)
            if (request) {
                pendingSurfaceRequestsRef.current.delete(request.requestId)
                onSurfaceRequestHandledRef.current(request.requestId)
            }
        }
        setControlTargetsByTab((current) => {
            if (targetId && current[tabId] === targetId) return current
            if (!targetId && !current[tabId]) return current
            const next = { ...current }
            if (targetId) next[tabId] = targetId
            else delete next[tabId]
            controlTargetsByTabRef.current = next
            return next
        })
    }, [])

    useEffect(() => {
        onAudibleChange(hasAudibleTab)
    }, [hasAudibleTab, onAudibleChange])

    useEffect(() => () => onAudibleChange(false), [onAudibleChange])

    useEffect(() => {
        onActiveFaviconChange(activeTab?.faviconUrl || null)
    }, [activeTab?.faviconUrl, onActiveFaviconChange])

    useEffect(() => () => onActiveFaviconChange(null), [onActiveFaviconChange])

    useEffect(() => {
        const visibleTabIds = active
            ? [activeTab?.id, splitTab?.id].filter((tabId): tabId is string => Boolean(tabId))
            : []
        onWorkspaceStateChange({
            open: true,
            activeTabId: activeTab?.id || null,
            splitTabId: splitTab?.id || null,
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
                    position: active && tab.id === activeTab?.id
                        ? 'primary'
                        : active && tab.id === splitTab?.id
                            ? 'secondary'
                            : null,
                    visible: visibleTabIds.includes(tab.id)
                }
            })
        })
    }, [active, activeTab?.id, controlState?.targets, controlTargetsByTab, onWorkspaceStateChange, splitTab?.id, workspaceState.tabs])

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

    const toggleSplit = useCallback(() => {
        mutateWorkspaceState((current) => {
            if (current.splitTabId) return setAssistantBrowserLayout(current, current.activeTabId, null)
            const existingSecondary = current.tabs.find((tab) => tab.id !== current.activeTabId)
            if (existingSecondary) return setAssistantBrowserLayout(current, current.activeTabId, existingSecondary.id)
            if (current.tabs.length >= ASSISTANT_BROWSER_TAB_LIMIT) return current
            const secondaryTabId = `browser:${tabSequenceRef.current++}`
            const withSecondary = addAssistantBrowserTab(current, secondaryTabId)
            return setAssistantBrowserLayout(withSecondary, current.activeTabId, secondaryTabId)
        })
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

    useEffect(() => {
        if (!surfaceRequest || consumedSurfaceRequestsRef.current.has(surfaceRequest.requestId) || cancelledSurfaceRequestsRef.current.has(surfaceRequest.requestId)) return
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
            if (mode === 'layout') return setAssistantBrowserLayout(next, surfaceRequest.tabId, surfaceRequest.secondaryTabId || null)
            if (mode === 'reveal') return activateAssistantBrowserTab(next, surfaceRequest.tabId)
            return setAssistantBrowserLayout(next, surfaceRequest.tabId, next.splitTabId)
        })
        if (knownTargetId) {
            void complete(true).finally(() => onSurfaceRequestHandledRef.current(surfaceRequest.requestId))
        } else {
            pendingSurfaceRequestsRef.current.set(surfaceRequest.requestId, surfaceRequest)
        }
    }, [closeTab, configError, controlTargetsByTab, failSurfaceRequest, mutateWorkspaceState, normalizedProjectPath, surfaceRequest])

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
                    const tabSecondary = tab.id === splitTab?.id
                    const tabTargetId = controlTargetsByTab[tab.id]
                    const tabGrant = tabTargetId
                        ? controlState?.grants.find((grant) => grant.targetId === tabTargetId && grant.state === 'active')
                        : undefined
                    const tabCursor = tabTargetId
                        ? controlState?.cursors.find((cursor) => cursor.targetId === tabTargetId && cursor.visible)
                        : undefined
                    const tabControlled = Boolean(tabGrant)
                    const tabControlActive = Boolean(tabCursor && tabCursor.phase !== 'idle')
                    const tabControllerLabel = (tabCursor?.principal || tabGrant?.principal)?.type === 'agent' ? 'Agent' : 'Zyra'
                    const tabNeedsAttention = Boolean(tabTargetId && controlState?.pendingGrants.some((grant) => grant.targetId === tabTargetId))
                    return (
                        <div
                            key={tab.id}
                            data-browser-control-owned={tabControlled ? '' : undefined}
                            className={cn(
                                'group/tab relative flex h-6 min-w-[92px] max-w-[150px] items-center gap-1 border-x border-t px-1.5 transition-[border-color,background-color,box-shadow,color] motion-reduce:transition-none',
                                tabActive ? 'border-white/[0.09] bg-[color-mix(in_srgb,var(--color-bg)_96%,black)] text-sparkle-text' : 'border-transparent bg-white/[0.018] text-sparkle-text-muted hover:bg-white/[0.04] hover:text-sparkle-text-secondary',
                                tabSecondary && 'border-violet-300/30 bg-violet-400/[0.06] text-violet-100',
                                tabControlled && 'border-cyan-300/45 bg-cyan-400/[0.07] text-cyan-50 shadow-[inset_0_0_0_1px_rgba(103,232,249,0.12),0_0_12px_rgba(34,211,238,0.22)]',
                                tabNeedsAttention && 'border-amber-300/35 bg-amber-400/[0.08] text-amber-100'
                            )}
                        >
                            {tabControlled ? <span className="pointer-events-none absolute inset-0 border border-cyan-200/15 motion-safe:animate-pulse" aria-hidden="true" /> : null}
                            <button type="button" onClick={() => activateTab(tab.id)} className="relative flex min-w-0 flex-1 items-center gap-1 text-left" title={tab.title || tab.url || 'New tab'}>
                                {tab.status === 'loading' ? <LoaderCircle size={9} className="shrink-0 animate-spin text-[var(--accent-primary)]" /> : <AssistantBrowserPageIcon faviconUrl={tab.faviconUrl} size={9} />}
                                <span className="min-w-0 flex-1 truncate text-[9px]">{tab.title || 'New tab'}</span>
                            </button>
                            {tab.audible ? <Volume2 size={10} className="relative shrink-0 text-[var(--accent-primary)]" aria-label="This tab is playing audio" /> : null}
                            {tabControlled ? (
                                <span
                                    className={cn(
                                        'relative inline-flex size-3.5 shrink-0 items-center justify-center rounded-full border border-cyan-200/25 bg-cyan-300/15 text-cyan-100 shadow-sm shadow-cyan-950/50',
                                        tabControlActive && 'scale-110 bg-cyan-300/25 motion-safe:animate-pulse'
                                    )}
                                    title={`${tabControllerLabel} controls this tab${tabCursor ? ` · ${tabCursor.phase}` : ''}`}
                                    aria-label={`${tabControllerLabel} controls this Browser tab`}
                                >
                                    <MousePointer2 size={9} strokeWidth={2.3} className="fill-cyan-200 text-slate-950" />
                                </span>
                            ) : null}
                            {tabNeedsAttention ? <ShieldAlert size={10} className="relative shrink-0 text-amber-300 motion-safe:animate-pulse" aria-label="This tab needs control approval" /> : null}
                            <button type="button" onClick={() => closeTab(tab.id)} className="relative inline-flex size-4 shrink-0 items-center justify-center opacity-0 hover:bg-white/[0.06] hover:text-sparkle-text group-hover/tab:opacity-100" title={`Close ${tab.title || 'tab'}`}><X size={9} /></button>
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
                <button
                    type="button"
                    onClick={toggleSplit}
                    className={cn('inline-flex size-5 items-center justify-center text-sparkle-text-muted hover:bg-white/[0.05] hover:text-sparkle-text', splitTab && 'bg-violet-400/[0.09] text-violet-200')}
                    title={splitTab ? 'Close side-by-side Browser view' : 'Show two Browser tabs side by side'}
                    aria-pressed={Boolean(splitTab)}
                >
                    <Columns2 size={10} />
                </button>
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
                {workspaceState.tabs.map((tab) => {
                    const primary = tab.id === activeTab?.id
                    const secondary = tab.id === splitTab?.id
                    const visible = active && (primary || secondary)
                    return (
                        <AssistantBrowserWebview
                            key={tab.id}
                            ref={getWebviewRefCallback(tab.id)}
                            tab={tab}
                            threadId={threadId}
                            config={config}
                            visible={visible}
                            focused={active && primary}
                            placement={splitTab ? primary ? 'primary' : secondary ? 'secondary' : 'full' : 'full'}
                            onStateChange={handleWebviewStateChange}
                            onControlTargetChange={handleControlTargetChange}
                        />
                    )
                })}
                {active && splitTab ? <div className="pointer-events-none absolute inset-y-0 left-1/2 z-[24] w-px bg-violet-300/45 shadow-[0_0_10px_rgba(196,181,253,0.28)]" aria-hidden="true" /> : null}
                {active ? visibleTabs.map((tab) => {
                    const targetId = controlTargetsByTab[tab.id]
                    const grant = targetId ? controlState?.grants.find((entry) => entry.targetId === targetId && entry.state === 'active') : null
                    const cursor = targetId ? controlState?.cursors.find((entry) => entry.targetId === targetId) || null : null
                    const secondary = tab.id === splitTab?.id
                    return (
                        <div
                            key={`control:${tab.id}`}
                            className={cn('pointer-events-none absolute inset-y-0 z-[25] overflow-hidden', splitTab ? secondary ? 'left-1/2 right-0' : 'left-0 right-1/2' : 'inset-x-0')}
                        >
                            {grant ? <div className="absolute inset-0 border border-cyan-300/35 shadow-[inset_0_0_20px_rgba(34,211,238,0.08)]" aria-label="Zyra-controlled Browser surface" /> : null}
                            <AssistantBrowserAgentCursor cursor={cursor} />
                        </div>
                    )
                }) : null}

                {activePendingGrant ? (
                    <div
                        className={cn('absolute bottom-0 left-0 top-0 z-[45] flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-[2px]', splitTab ? 'right-1/2' : 'right-0')}
                        role="dialog"
                        aria-modal="true"
                        aria-label="Browser control permission requested"
                    >
                        <section className="w-full max-w-[320px] rounded-xl border border-amber-200/25 bg-[#111927]/[0.98] p-3.5 shadow-2xl shadow-black/55">
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
                    <div className={cn('absolute inset-y-0 left-0 z-10 flex items-center justify-center overflow-y-auto bg-[color-mix(in_srgb,var(--color-bg)_96%,black)] p-5 text-center', splitTab ? 'right-1/2' : 'right-0')}>
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
                    <div className={cn('pointer-events-none absolute left-0 top-0 z-20 border-b border-red-500/15 bg-[color-mix(in_srgb,var(--color-bg)_94%,black)] px-2 py-1 text-[9px] text-red-300 shadow-sm', splitTab ? 'right-1/2' : 'right-0')}>
                        {activeTab.error}
                    </div>
                ) : null}

                {activeTab?.status === 'loading' ? <div className={cn('pointer-events-none absolute left-0 top-0 z-30 h-px overflow-hidden bg-[var(--accent-primary)]/15 after:block after:h-full after:w-1/3 after:animate-[browser-loading-slide_1.1s_ease-in-out_infinite] after:bg-[var(--accent-primary)]', splitTab ? 'right-1/2' : 'right-0')} /> : null}
            </div>
        </section>
    )
})
