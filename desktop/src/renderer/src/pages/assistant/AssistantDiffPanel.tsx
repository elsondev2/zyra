import { lazy, memo, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Bot, FileDiff, Files, FolderTree, GitCompareArrows, Globe2, Library, LoaderCircle, MessageSquareText, ShieldAlert, ShieldCheck, SquareTerminal, TriangleAlert, Volume2 } from 'lucide-react'
import type { FleetSnapshot } from '@shared/assistant/contracts'
import type { ControlStateSnapshot, ControlWorkspaceSnapshot } from '@shared/agent-control/contracts'
import type { BrowserSurfaceOpenRequest } from '@shared/agent-control/protocol'
import type { PreviewOpenOptions } from '@/components/ui/file-preview/types'
import type { FileActionsMenuItem } from '@/components/ui/FileActionsMenu'
import { useSettings } from '@/lib/settings'
import type { AssistantDiffTarget, AssistantDiffTurn } from './assistant-diff-types'
import { AssistantBrowserPageIcon } from './AssistantBrowserPageIcon'
import type { AssistantBrowserWorkspaceController } from './AssistantBrowserWorkspace'
import {
    hasPersistedAssistantBrowserWorkspaceState,
    loadAssistantBrowserWorkspaceState,
    type AssistantBrowserTabState,
    type AssistantBrowserWorkspaceState
} from './assistant-browser-workspace-state'
import {
    loadAssistantInspectorWorkspaceState,
    persistAssistantInspectorWorkspaceState,
    restoreAssistantInspectorWorkspaceState,
    type AssistantInspectorWorkspaceTab
} from './assistant-inspector-workspace-state'
import { AssistantInspectorSidebar, type AssistantInspectorTab } from './AssistantInspectorSidebar'
import {
    AssistantInspectorDeveloperToast,
    useAssistantInspectorDeveloperToast
} from './AssistantInspectorDeveloperToast'
import { AssistantReviewLanding } from './AssistantReviewLanding'
import { AssistantTurnReview } from './AssistantTurnReview'

const AssistantExplorerWorkspace = lazy(async () => ({
    default: (await import('./AssistantExplorerWorkspace')).AssistantExplorerWorkspace
}))
const AssistantTerminalWorkspace = lazy(async () => ({
    default: (await import('./AssistantTerminalWorkspace')).AssistantTerminalWorkspace
}))
const AssistantBrowserWorkspace = lazy(async () => ({
    default: (await import('./AssistantBrowserWorkspace')).AssistantBrowserWorkspace
}))
const AssistantResourcesWorkspace = lazy(async () => ({
    default: (await import('./AssistantResourcesWorkspace')).AssistantResourcesWorkspace
}))
const AssistantFleetWorkspace = lazy(async () => ({
    default: (await import('./AssistantFleetWorkspace')).AssistantFleetWorkspace
}))
const AssistantControlWorkspace = lazy(async () => ({
    default: (await import('./AssistantControlWorkspace')).AssistantControlWorkspace
}))

type WorkspaceTab = AssistantInspectorWorkspaceTab

type BrowserWorkspaceTab = Extract<WorkspaceTab, { kind: 'browser' }>

const REVIEW_TAB: WorkspaceTab = { id: 'review', kind: 'review' }
const EXPLORER_TAB: WorkspaceTab = { id: 'explorer', kind: 'explorer' }
const TERMINAL_TAB: WorkspaceTab = { id: 'terminal', kind: 'terminal' }
const CONTROL_TAB: WorkspaceTab = { id: 'control', kind: 'control' }
const RESOURCES_TAB: WorkspaceTab = { id: 'resources', kind: 'resources' }
const AGENTS_TAB: WorkspaceTab = { id: 'agents', kind: 'agents' }

type AssistantBrowserNavigationRequest = {
    id: number
    url: string
}

export type AssistantDiffRevealRequest = {
    id: number
    turnId: string
}

export const AssistantDiffPanel = memo(function AssistantDiffPanel(props: {
    open: boolean
    sessionId: string | null
    threadId: string | null
    width: number
    maxWidth: number
    turns: AssistantDiffTurn[]
    reviewIndexReady: boolean
    reviewIndexLoading: boolean
    reviewIndexError: string | null
    turnDetailError: string | null
    activeTurnId: string | null
    revealRequest: AssistantDiffRevealRequest | null
    selectedTurnId: string | null
    selectedDiff: AssistantDiffTarget | null
    projectPath: string | null
    fleetSnapshot: FleetSnapshot | null
    browserSurfaceRequest: BrowserSurfaceOpenRequest | null
    onBrowserSurfaceRequestHandled: (requestId: string) => void
    onOpenPreview: (file: { name: string; path: string }, ext: string, options?: PreviewOpenOptions) => Promise<void>
    onOpenPreviewInNewTab: (file: { name: string; path: string }, ext: string, options?: PreviewOpenOptions) => Promise<void>
    onWidthChange: (width: number) => void
    onSelectTurn: (turnId: string) => void
    onSelectDiff: (target: AssistantDiffTarget) => void
    onRevealRequestHandled: (requestId: number) => void
    onClose: () => void
}) {
    const {
        open,
        sessionId,
        threadId,
        width,
        maxWidth,
        turns,
        reviewIndexReady,
        reviewIndexLoading,
        reviewIndexError,
        turnDetailError,
        activeTurnId,
        revealRequest,
        selectedTurnId,
        selectedDiff,
        projectPath,
        fleetSnapshot,
        browserSurfaceRequest,
        onBrowserSurfaceRequestHandled,
        onOpenPreview,
        onOpenPreviewInNewTab,
        onWidthChange,
        onSelectTurn,
        onSelectDiff,
        onRevealRequestHandled,
        onClose
    } = props
    const { settings } = useSettings()
    const reviewFileRevealSequenceRef = useRef(-1)
    const browserNavigationSequenceRef = useRef(1)
    const browserUiTabSequenceRef = useRef(1)
    const processedBrowserSurfaceRequestRef = useRef<string | null>(null)
    const pendingBrowserTabIdsRef = useRef(new Set<string>())
    const browserControllerRef = useRef<AssistantBrowserWorkspaceController | null>(null)
    const loadingTimerRef = useRef(0)
    const [activeTabId, setActiveTabId] = useState<string>(REVIEW_TAB.id)
    const [workspaceTabs, setWorkspaceTabs] = useState<WorkspaceTab[]>([REVIEW_TAB])
    const [workspaceHydratedKey, setWorkspaceHydratedKey] = useState<string | null>(null)
    const [reviewTurnId, setReviewTurnId] = useState<string | null>(null)
    const [focusedDiffRequestId, setFocusedDiffRequestId] = useState<number | null>(null)
    const [transitionLoadingTabId, setTransitionLoadingTabId] = useState<string | null>(null)
    const [contentLoadingTabId, setContentLoadingTabId] = useState<string | null>(null)
    const [browserTabs, setBrowserTabs] = useState<AssistantBrowserTabState[]>([])
    const [browserActiveTabId, setBrowserActiveTabId] = useState<string | null>(null)
    const [browserNavigationRequest, setBrowserNavigationRequest] = useState<AssistantBrowserNavigationRequest | null>(null)
    const [selectedAgentRunId, setSelectedAgentRunId] = useState<string | null>(null)
    const [selectedWorkflowRunId, setSelectedWorkflowRunId] = useState<string | null>(null)
    const [controlState, setControlState] = useState<ControlStateSnapshot | null>(null)
    const [browserWorkspaceState, setBrowserWorkspaceState] = useState<ControlWorkspaceSnapshot['browser']>({
        open: false,
        activeTabId: null,
        splitTabId: null,
        visibleTabIds: [],
        tabs: []
    })
    const { developerToast, showDeveloperToast, dismissDeveloperToast } = useAssistantInspectorDeveloperToast()

    const browserWorkspaceKey = sessionId || projectPath || 'detached'

    const beginTabTransition = useCallback((tabId: string) => {
        window.clearTimeout(loadingTimerRef.current)
        setTransitionLoadingTabId(tabId)
        loadingTimerRef.current = window.setTimeout(() => {
            setTransitionLoadingTabId((current) => current === tabId ? null : current)
        }, 480)
    }, [])

    const handleTurnLoadingChange = useCallback((loading: boolean) => {
        setContentLoadingTabId((current) => loading ? activeTabId : current === activeTabId ? null : current)
    }, [activeTabId])

    useEffect(() => () => window.clearTimeout(loadingTimerRef.current), [])

    useEffect(() => {
        let cancelled = false
        void window.devscope.agentControl.getState().then((result) => {
            if (!cancelled && result.success) setControlState(result.state)
        })
        const unsubscribe = window.devscope.agentControl.onStateChange((state) => {
            if (!cancelled) setControlState(state)
        })
        const unsubscribeCursor = window.devscope.agentControl.onCursorChange((cursor) => {
            if (cancelled) return
            setControlState((current) => current ? {
                ...current,
                cursors: [...current.cursors.filter((entry) => entry.targetId !== cursor.targetId), cursor]
            } : current)
        })
        return () => { cancelled = true; unsubscribe(); unsubscribeCursor() }
    }, [])

    const pendingControlCount = controlState?.pendingGrants.length || 0

    useEffect(() => {
        if (pendingControlCount === 0) return
        setWorkspaceTabs((current) => current.some((tab) => tab.kind === 'control') ? current : [...current, CONTROL_TAB])
        setActiveTabId((current) => current || CONTROL_TAB.id)
    }, [pendingControlCount])

    useEffect(() => {
        void window.devscope.agentControl.updateWorkspaceState(null)
        const hasPersistedBrowser = settings.assistantBrowserRestoreTabs
            && hasPersistedAssistantBrowserWorkspaceState(browserWorkspaceKey)
        const persistedBrowser: AssistantBrowserWorkspaceState = settings.assistantBrowserRestoreTabs
            ? loadAssistantBrowserWorkspaceState(browserWorkspaceKey)
            : { version: 1, activeTabId: '', splitTabId: null, tabs: [] }
        const restoredBrowserTabIds = hasPersistedBrowser
            ? persistedBrowser.tabs.map((tab) => tab.id)
            : []
        const restoredWorkspace = restoreAssistantInspectorWorkspaceState(
            loadAssistantInspectorWorkspaceState(browserWorkspaceKey),
            restoredBrowserTabIds
        )
        setActiveTabId(restoredWorkspace.activeTabId)
        setWorkspaceTabs(restoredWorkspace.tabs)
        setReviewTurnId(null)
        setFocusedDiffRequestId(null)
        setTransitionLoadingTabId(null)
        setContentLoadingTabId(null)
        setBrowserTabs(persistedBrowser.tabs)
        setBrowserActiveTabId(persistedBrowser.activeTabId)
        setBrowserNavigationRequest(null)
        setBrowserWorkspaceState({ open: false, activeTabId: null, splitTabId: null, visibleTabIds: [], tabs: [] })
        browserControllerRef.current = null
        pendingBrowserTabIdsRef.current.clear()
        processedBrowserSurfaceRequestRef.current = null
        setWorkspaceHydratedKey(browserWorkspaceKey)
    }, [browserWorkspaceKey, settings.assistantBrowserRestoreTabs])

    useEffect(() => {
        if (workspaceHydratedKey !== browserWorkspaceKey) return
        persistAssistantInspectorWorkspaceState(browserWorkspaceKey, {
            version: 1,
            activeTabId,
            tabs: workspaceTabs
        })
    }, [activeTabId, browserWorkspaceKey, workspaceHydratedKey, workspaceTabs])

    useEffect(() => {
        if (!browserSurfaceRequest || processedBrowserSurfaceRequestRef.current === browserSurfaceRequest.requestId) return
        processedBrowserSurfaceRequestRef.current = browserSurfaceRequest.requestId
        const mode = browserSurfaceRequest.mode || 'open'
        if (mode === 'close' || mode === 'external') return
        pendingBrowserTabIdsRef.current.add(browserSurfaceRequest.tabId)
        const browserTab: WorkspaceTab = {
            id: browserSurfaceRequest.tabId,
            kind: 'browser',
            browserTabId: browserSurfaceRequest.tabId
        }
        setWorkspaceTabs((current) => current.some((tab) => tab.id === browserTab.id)
            ? current
            : [...current, browserTab])
        if (browserSurfaceRequest.reveal) {
            setActiveTabId(browserTab.id)
            beginTabTransition(browserTab.id)
        }
    }, [beginTabTransition, browserSurfaceRequest])

    useEffect(() => {
        if (!open || !revealRequest) return
        setWorkspaceTabs((current) => current.some((tab) => tab.kind === 'review')
            ? current
            : [...current, REVIEW_TAB])
        setActiveTabId('review')
        setReviewTurnId(revealRequest.turnId)
        setFocusedDiffRequestId(revealRequest.id)
        onRevealRequestHandled(revealRequest.id)
    }, [onRevealRequestHandled, open, revealRequest])

    useEffect(() => {
        if (!reviewIndexReady) return
        const invalidIds = new Set(workspaceTabs.flatMap((tab) => (
            tab.kind === 'turn' && !turns.some((turn) => turn.id === tab.turnId) ? [tab.id] : []
        )))
        if (invalidIds.size === 0) return
        const next = workspaceTabs.filter((tab) => !invalidIds.has(tab.id))
        setWorkspaceTabs(next)
        if (invalidIds.has(activeTabId)) setActiveTabId(next[0]?.id || '')
    }, [activeTabId, reviewIndexReady, turns, workspaceTabs])

    useEffect(() => {
        setReviewTurnId((current) => current && turns.some((turn) => turn.id === current) ? current : null)
    }, [turns])

    const tabs = useMemo<AssistantInspectorTab[]>(() => workspaceTabs.flatMap((tab) => {
        if (tab.kind === 'review') {
            return [{
                id: tab.id,
                label: 'Review',
                icon: <GitCompareArrows size={12} />,
                count: turns.length,
                closable: true,
                loading: transitionLoadingTabId === tab.id || contentLoadingTabId === tab.id,
                preview: `${turns.length} turns · Search prompts, responses, files, and turn numbers`
            }]
        }
        if (tab.kind === 'explorer') {
            return [{
                id: tab.id,
                label: 'Explorer',
                icon: <FolderTree size={12} />,
                closable: true,
                loading: transitionLoadingTabId === tab.id,
                preview: projectPath ? `Browse ${projectPath}` : 'No project attached'
            }]
        }
        if (tab.kind === 'terminal') {
            return [{
                id: tab.id,
                label: 'Terminal',
                icon: <SquareTerminal size={12} />,
                closable: true,
                loading: transitionLoadingTabId === tab.id,
                preview: projectPath ? `Terminal · ${projectPath}` : 'No project attached'
            }]
        }
        if (tab.kind === 'browser') {
            const browserTab = browserTabs.find((entry) => entry.id === tab.browserTabId)
            const controlTab = browserWorkspaceState.tabs.find((entry) => entry.tabId === tab.browserTabId)
            const pendingForTab = controlTab?.targetId
                ? controlState?.pendingGrants.filter((request) => request.targetId === controlTab.targetId).length || 0
                : 0
            return [{
                id: tab.id,
                label: browserTab?.title || 'New tab',
                icon: <AssistantBrowserPageIcon faviconUrl={browserTab?.faviconUrl || null} size={12} />,
                statusIcon: browserTab?.audible || pendingForTab > 0 ? (
                    <span className="flex items-center gap-0.5">
                        {browserTab?.audible ? <Volume2 size={10} aria-label="This Browser page is playing audio" /> : null}
                        {pendingForTab > 0 ? <ShieldAlert size={10} className="text-amber-300 motion-safe:animate-pulse" aria-label="Browser control approval needed" /> : null}
                    </span>
                ) : undefined,
                count: pendingForTab || undefined,
                attention: pendingForTab > 0,
                closable: true,
                loading: transitionLoadingTabId === tab.id || browserTab?.status === 'loading',
                preview: browserTab?.url || (projectPath ? `Browser · ${projectPath}` : 'No project attached')
            }]
        }
        if (tab.kind === 'control') {
            return [{
                id: tab.id,
                label: 'Control',
                icon: <ShieldCheck size={12} />,
                statusIcon: pendingControlCount > 0 ? <ShieldAlert size={10} className="text-amber-300 motion-safe:animate-pulse" aria-label="Control approval needed" /> : undefined,
                count: pendingControlCount || undefined,
                attention: pendingControlCount > 0,
                closable: true,
                loading: transitionLoadingTabId === tab.id,
                preview: 'Targets, grants, audit, pairing, and emergency stop'
            }]
        }
        if (tab.kind === 'resources') {
            return [{
                id: tab.id,
                label: 'Resources',
                icon: <Library size={12} />,
                closable: true,
                loading: transitionLoadingTabId === tab.id,
                preview: 'Image previews and links shared in this chat'
            }]
        }
        if (tab.kind === 'agents') {
            const running = Object.values(fleetSnapshot?.agents ?? {}).filter((run) => ['queued', 'starting', 'running', 'waiting', 'recovering'].includes(run.status)).length
            return [{
                id: tab.id,
                label: 'Agents',
                icon: <Bot size={12} />,
                count: running,
                closable: true,
                loading: transitionLoadingTabId === tab.id,
                preview: `${Object.keys(fleetSnapshot?.agents ?? {}).length} child agents · ${Object.keys(fleetSnapshot?.workflows ?? {}).length} workflows`
            }]
        }
        const turn = turns.find((entry) => entry.id === tab.turnId)
        return turn ? [{
            id: tab.id,
            label: `Turn ${turn.number}`,
            icon: <MessageSquareText size={11} />,
            closable: true,
            loading: transitionLoadingTabId === tab.id || contentLoadingTabId === tab.id,
            preview: turn.prompt
        }] : []
    }), [browserTabs, browserWorkspaceState.tabs, contentLoadingTabId, controlState?.pendingGrants, fleetSnapshot, pendingControlCount, projectPath, transitionLoadingTabId, turns, workspaceTabs])

    const activeWorkspaceTab = workspaceTabs.find((tab) => tab.id === activeTabId) || workspaceTabs[0] || null
    const activeTurnTab = activeWorkspaceTab?.kind === 'turn' ? activeWorkspaceTab : null
    const visibleTurnId = activeTurnTab?.turnId || (activeWorkspaceTab?.kind === 'review' ? reviewTurnId : null)
    const visibleTurn = turns.find((turn) => turn.id === visibleTurnId) || null
    const visibleSelectedDiff = visibleTurn && selectedTurnId === visibleTurn.id ? selectedDiff : visibleTurn?.files[0]?.target || null
    const terminalOpen = workspaceTabs.some((tab) => tab.kind === 'terminal')
    const browserOpen = workspaceTabs.some((tab) => tab.kind === 'browser')
    const controlOpen = workspaceTabs.some((tab) => tab.kind === 'control')
    const resourcesOpen = workspaceTabs.some((tab) => tab.kind === 'resources')
    const agentsOpen = workspaceTabs.some((tab) => tab.kind === 'agents')

    const handleBrowserWorkspaceStateChange = useCallback((next: ControlWorkspaceSnapshot['browser']) => {
        setBrowserWorkspaceState((current) => JSON.stringify(current) === JSON.stringify(next) ? current : next)
    }, [])

    const handleBrowserTabsChange = useCallback((next: AssistantBrowserWorkspaceState) => {
        for (const tab of next.tabs) pendingBrowserTabIdsRef.current.delete(tab.id)
        setBrowserTabs(next.tabs)
        setBrowserActiveTabId(next.activeTabId)
        setActiveTabId((current) => current.startsWith('browser:') && !next.tabs.some((tab) => tab.id === current)
            ? next.activeTabId || ''
            : current)
    }, [])

    const browserTabIdentity = browserTabs.map((tab) => tab.id).join('|')
    useEffect(() => {
        if (!browserOpen) return
        const validIds = new Set([
            ...browserTabs.map((tab) => tab.id),
            ...pendingBrowserTabIdsRef.current
        ])
        setWorkspaceTabs((current) => {
            const firstBrowserIndex = current.findIndex((tab) => tab.kind === 'browser')
            const retainedBrowserTabs = current.filter((tab): tab is BrowserWorkspaceTab => (
                tab.kind === 'browser' && validIds.has(tab.browserTabId)
            ))
            const retainedIds = new Set(retainedBrowserTabs.map((tab) => tab.browserTabId))
            for (const tab of browserTabs) {
                if (!retainedIds.has(tab.id)) retainedBrowserTabs.push({ id: tab.id, kind: 'browser', browserTabId: tab.id })
            }
            const nonBrowserTabs: WorkspaceTab[] = current.filter((tab) => tab.kind !== 'browser')
            const insertionIndex = firstBrowserIndex < 0
                ? nonBrowserTabs.length
                : Math.min(firstBrowserIndex, nonBrowserTabs.length)
            const next = nonBrowserTabs.slice()
            next.splice(insertionIndex, 0, ...retainedBrowserTabs)
            if (next.length === current.length && next.every((tab, index) => tab.id === current[index]?.id)) return current
            return next
        })
        setActiveTabId((current) => current.startsWith('browser:') && !validIds.has(current)
            ? browserActiveTabId || browserTabs[0]?.id || ''
            : current)
    }, [browserActiveTabId, browserOpen, browserTabIdentity, browserTabs])

    useEffect(() => {
        const activeWorkspace = open && activeWorkspaceTab
            ? activeWorkspaceTab.kind === 'turn' ? 'turn' : activeWorkspaceTab.kind
            : null
        const openWorkspaces = [...new Set(workspaceTabs.map((tab) => tab.kind === 'turn' ? 'turn' as const : tab.kind))]
        const browserVisible = open && activeWorkspace === 'browser' && browserOpen
        const browser = {
            ...browserWorkspaceState,
            open: browserOpen,
            visibleTabIds: browserVisible ? browserWorkspaceState.visibleTabIds : [],
            tabs: browserWorkspaceState.tabs.map((tab) => ({
                ...tab,
                position: browserVisible ? tab.position : null,
                visible: browserVisible && tab.visible
            }))
        }
        void window.devscope.agentControl.updateWorkspaceState({
            version: 1,
            threadId,
            inspector: {
                open,
                width: open ? width : null,
                activeWorkspace,
                openWorkspaces
            },
            browser,
            updatedAt: new Date().toISOString()
        })
    }, [activeWorkspaceTab, browserOpen, browserWorkspaceState, open, threadId, width, workspaceTabs])

    useEffect(() => () => {
        void window.devscope.agentControl.updateWorkspaceState(null)
    }, [])

    const selectTurn = useCallback((turnId: string) => {
        onSelectTurn(turnId)
    }, [onSelectTurn])

    const openSingletonWorkspace = useCallback((workspace: WorkspaceTab) => {
        setWorkspaceTabs((current) => current.some((tab) => tab.id === workspace.id)
            ? current
            : [...current, workspace])
        setActiveTabId(workspace.id)
        beginTabTransition(workspace.id)
    }, [beginTabTransition])

    const handleOpenReviewWorkspace = useCallback(() => {
        setFocusedDiffRequestId(null)
        setReviewTurnId(null)
        openSingletonWorkspace(REVIEW_TAB)
    }, [openSingletonWorkspace])
    const handleOpenExplorerWorkspace = useCallback(() => openSingletonWorkspace(EXPLORER_TAB), [openSingletonWorkspace])
    const handleOpenTerminalWorkspace = useCallback(() => openSingletonWorkspace(TERMINAL_TAB), [openSingletonWorkspace])
    const openBrowserSurface = useCallback((url = '') => {
        const reusableBlankTab = !browserOpen
            ? browserTabs.find((tab) => !tab.url && tab.status === 'idle') || null
            : null
        const controller = browserControllerRef.current
        const browserTabId = reusableBlankTab?.id
            || controller?.createTab(url)
            || `browser:desktop:${Date.now().toString(36)}:${browserUiTabSequenceRef.current++}`
        const knownBrowserTabs = browserOpen
            ? []
            : browserTabs.map<WorkspaceTab>((tab) => ({ id: tab.id, kind: 'browser', browserTabId: tab.id }))
        if (!browserTabs.some((tab) => tab.id === browserTabId)) pendingBrowserTabIdsRef.current.add(browserTabId)
        const browserSurface: WorkspaceTab = { id: browserTabId, kind: 'browser', browserTabId }
        setWorkspaceTabs((current) => {
            const next = current.slice()
            for (const tab of [...knownBrowserTabs, browserSurface]) {
                if (!next.some((entry) => entry.id === tab.id)) next.push(tab)
            }
            return next
        })
        setActiveTabId(browserTabId)
        beginTabTransition(browserTabId)
        controller?.activateTab(browserTabId)
        if (url && !controller) {
            setBrowserNavigationRequest({ id: browserNavigationSequenceRef.current++, url })
        }
    }, [beginTabTransition, browserOpen, browserTabs])
    const handleOpenBrowserWorkspace = useCallback(() => openBrowserSurface(), [openBrowserSurface])
    const handleOpenControlWorkspace = useCallback(() => openSingletonWorkspace(CONTROL_TAB), [openSingletonWorkspace])
    const handleOpenResourcesWorkspace = useCallback(() => openSingletonWorkspace(RESOURCES_TAB), [openSingletonWorkspace])
    const handleOpenAgentsWorkspace = useCallback(() => openSingletonWorkspace(AGENTS_TAB), [openSingletonWorkspace])

    const handleAgentAction = useCallback((action: 'stop' | 'retry' | 'resume', agentRunId: string) => {
        if (!threadId) return
        void window.devscope.assistant.agentAction({ threadId, action, payload: { agentRunId } })
    }, [threadId])

    const handleWorkflowAction = useCallback((action: 'pause' | 'resume' | 'stop' | 'restart' | 'save', workflowRunId: string) => {
        if (!threadId) return
        void window.devscope.assistant.workflowAction({ threadId, action, payload: { workflowRunId, scope: 'personal' } })
    }, [threadId])

    const handleOpenResourceUrl = useCallback((url: string) => {
        if (!projectPath) {
            void window.devscope.openBrowserPreviewExternal(url)
            return
        }
        openBrowserSurface(url)
    }, [openBrowserSurface, projectPath])

    const handleBrowserNavigationRequestHandled = useCallback((requestId: number) => {
        setBrowserNavigationRequest((current) => current?.id === requestId ? null : current)
    }, [])

    const handleBrowserSurfaceRequestHandled = useCallback((requestId: string) => {
        if (browserSurfaceRequest?.requestId === requestId) {
            pendingBrowserTabIdsRef.current.delete(browserSurfaceRequest.tabId)
        }
        onBrowserSurfaceRequestHandled(requestId)
    }, [browserSurfaceRequest, onBrowserSurfaceRequestHandled])

    const handleOpenResourceTurn = useCallback((turnId: string) => {
        setWorkspaceTabs((current) => current.some((tab) => tab.kind === 'review')
            ? current
            : [...current, REVIEW_TAB])
        setFocusedDiffRequestId(null)
        setActiveTabId('review')
        setReviewTurnId(turnId)
        beginTabTransition('review')
        selectTurn(turnId)
    }, [beginTabTransition, selectTurn])

    const handleOpenResourceDiff = useCallback((target: AssistantDiffTarget) => {
        const turnId = target.turnId || turns.find((turn) => turn.changes.some((change) => (
            change.target.activityId === target.activityId && change.target.filePath === target.filePath
        )))?.id
        if (!turnId) return
        setWorkspaceTabs((current) => current.some((tab) => tab.kind === 'review')
            ? current
            : [...current, REVIEW_TAB])
        setFocusedDiffRequestId(reviewFileRevealSequenceRef.current--)
        setActiveTabId('review')
        setReviewTurnId(turnId)
        selectTurn(turnId)
        onSelectDiff(target)
    }, [onSelectDiff, selectTurn, turns])

    const handleOpenReviewTurn = useCallback((turnId: string) => {
        setFocusedDiffRequestId(null)
        setActiveTabId('review')
        setReviewTurnId(turnId)
        beginTabTransition('review')
        selectTurn(turnId)
    }, [beginTabTransition, selectTurn])

    const handleOpenReviewFile = useCallback((turnId: string, target: AssistantDiffTarget) => {
        setFocusedDiffRequestId(reviewFileRevealSequenceRef.current--)
        setActiveTabId('review')
        setReviewTurnId(turnId)
        selectTurn(turnId)
        onSelectDiff(target)
    }, [onSelectDiff, selectTurn])

    const handleOpenTurnInTab = useCallback((turnId: string) => {
        const tabId = `turn:${turnId}`
        setReviewTurnId(null)
        setFocusedDiffRequestId(null)
        setWorkspaceTabs((current) => current.some((tab) => tab.id === tabId)
            ? current
            : [...current, { id: tabId, kind: 'turn', turnId }])
        setActiveTabId(tabId)
        beginTabTransition(tabId)
        selectTurn(turnId)
    }, [beginTabTransition, selectTurn])

    const handleSelectTab = useCallback((tabId: string) => {
        setActiveTabId(tabId)
        beginTabTransition(tabId)
        const tab = workspaceTabs.find((entry) => entry.id === tabId)
        if (tab?.kind === 'review' && reviewTurnId) {
            selectTurn(reviewTurnId)
            return
        }
        if (tab?.kind === 'browser') browserControllerRef.current?.activateTab(tab.browserTabId)
        if (tab?.kind === 'turn') selectTurn(tab.turnId)
    }, [beginTabTransition, reviewTurnId, selectTurn, workspaceTabs])

    const handleReorderTab = useCallback((fromTabId: string, toTabId: string) => {
        if (fromTabId === toTabId) return
        setWorkspaceTabs((current) => {
            const fromIndex = current.findIndex((tab) => tab.id === fromTabId)
            const toIndex = current.findIndex((tab) => tab.id === toTabId)
            if (fromIndex < 0 || toIndex < 0) return current
            const next = current.slice()
            const [moved] = next.splice(fromIndex, 1)
            next.splice(toIndex, 0, moved)
            return next
        })
    }, [])

    const handleCloseTab = useCallback((tabId: string) => {
        const closingIndex = workspaceTabs.findIndex((tab) => tab.id === tabId)
        const closingTab = workspaceTabs[closingIndex]
        if (!closingTab) return
        if (closingTab.kind === 'browser') {
            pendingBrowserTabIdsRef.current.delete(closingTab.browserTabId)
            const nextBrowserState = browserControllerRef.current?.closeTab(closingTab.browserTabId)
            if (nextBrowserState) {
                setBrowserTabs(nextBrowserState.tabs)
                setBrowserActiveTabId(nextBrowserState.activeTabId)
            }
        }
        const next = workspaceTabs.filter((tab) => tab.id !== tabId)
        setWorkspaceTabs(next)
        setTransitionLoadingTabId((current) => current === tabId ? null : current)
        setContentLoadingTabId((current) => current === tabId ? null : current)
        if (closingTab.kind === 'review') {
            setReviewTurnId(null)
            setFocusedDiffRequestId(null)
        }
        if (closingTab.kind === 'browser') setBrowserNavigationRequest(null)
        if (next.length === 0) {
            persistAssistantInspectorWorkspaceState(browserWorkspaceKey, { version: 1, activeTabId: '', tabs: [] })
            setActiveTabId('')
            onClose()
            return
        }
        if (activeTabId === tabId) {
            const fallback = next[Math.min(Math.max(closingIndex, 0), next.length - 1)] || next[next.length - 1]
            setActiveTabId(fallback.id)
            if (fallback.kind === 'browser') browserControllerRef.current?.activateTab(fallback.browserTabId)
            if (fallback.kind === 'turn') selectTurn(fallback.turnId)
            if (fallback.kind === 'review' && reviewTurnId) selectTurn(reviewTurnId)
        }
    }, [activeTabId, browserWorkspaceKey, onClose, reviewTurnId, selectTurn, workspaceTabs])

    const handleBrowserControllerChange = useCallback((controller: AssistantBrowserWorkspaceController | null) => {
        browserControllerRef.current = controller
    }, [])

    const addTabItems = useMemo<FileActionsMenuItem[]>(() => [
        { id: 'browser', label: 'Browser', icon: <Globe2 size={14} />, onSelect: handleOpenBrowserWorkspace },
        { id: 'terminal', label: 'Terminal', icon: <SquareTerminal size={14} />, onSelect: handleOpenTerminalWorkspace },
        { id: 'explorer', label: 'Files', icon: <Files size={14} />, onSelect: handleOpenExplorerWorkspace },
        { id: 'review', label: 'Diff', icon: <FileDiff size={14} />, onSelect: handleOpenReviewWorkspace },
        { id: 'resources', label: 'Resources', icon: <Library size={14} />, onSelect: handleOpenResourcesWorkspace },
        { id: 'agents', label: 'Agents', icon: <Bot size={14} />, onSelect: handleOpenAgentsWorkspace },
        { id: 'control', label: 'Control', icon: <ShieldCheck size={14} />, onSelect: handleOpenControlWorkspace }
    ], [
        handleOpenAgentsWorkspace,
        handleOpenBrowserWorkspace,
        handleOpenControlWorkspace,
        handleOpenExplorerWorkspace,
        handleOpenResourcesWorkspace,
        handleOpenReviewWorkspace,
        handleOpenTerminalWorkspace
    ])

    return (
        <AssistantInspectorSidebar
            open={open}
            width={width}
            maxWidth={maxWidth}
            tabs={tabs}
            activeTabId={activeTabId}
            onWidthChange={onWidthChange}
            onSelectTab={handleSelectTab}
            onCloseTab={handleCloseTab}
            onReorderTab={handleReorderTab}
            addTabItems={addTabItems}
        >
            <>
                {terminalOpen ? (
                    <div className={activeWorkspaceTab?.kind === 'terminal' ? 'flex min-h-0 flex-1' : 'hidden'}>
                        <Suspense fallback={(
                            <div className="flex min-h-0 flex-1 items-center justify-center">
                                <LoaderCircle size={18} className="animate-spin text-[var(--accent-primary)]/75" />
                            </div>
                        )}>
                            <AssistantTerminalWorkspace
                                workspaceKey={sessionId || projectPath || 'detached'}
                                projectPath={projectPath}
                                active={open && activeWorkspaceTab?.kind === 'terminal'}
                            />
                        </Suspense>
                    </div>
                ) : null}

                {browserOpen ? (
                    <div
                        aria-hidden={activeWorkspaceTab?.kind !== 'browser'}
                        className={activeWorkspaceTab?.kind === 'browser'
                            ? 'flex min-h-0 flex-1'
                            : 'pointer-events-none invisible absolute inset-0 flex'}
                    >
                        <Suspense fallback={(
                            <div className="flex min-h-0 flex-1 items-center justify-center">
                                <LoaderCircle size={18} className="animate-spin text-[var(--accent-primary)]/75" />
                            </div>
                        )}>
                            <AssistantBrowserWorkspace
                                workspaceKey={browserWorkspaceKey}
                                threadId={threadId || 'thread:detached'}
                                projectPath={projectPath}
                                active={open && activeWorkspaceTab?.kind === 'browser'}
                                selectedTabId={activeWorkspaceTab?.kind === 'browser' ? activeWorkspaceTab.browserTabId : null}
                                controlState={controlState}
                                navigationRequest={browserNavigationRequest}
                                surfaceRequest={browserSurfaceRequest}
                                onNavigationRequestHandled={handleBrowserNavigationRequestHandled}
                                onSurfaceRequestHandled={handleBrowserSurfaceRequestHandled}
                                onWorkspaceStateChange={handleBrowserWorkspaceStateChange}
                                onTabsChange={handleBrowserTabsChange}
                                onControllerChange={handleBrowserControllerChange}
                                onDeveloperToast={showDeveloperToast}
                            />
                        </Suspense>
                    </div>
                ) : null}

                {agentsOpen ? (
                    <div className={activeWorkspaceTab?.kind === 'agents' ? 'flex min-h-0 flex-1' : 'hidden'}>
                        <Suspense fallback={(<div className="flex min-h-0 flex-1 items-center justify-center"><LoaderCircle size={18} className="animate-spin text-[var(--accent-primary)]/75" /></div>)}>
                            <AssistantFleetWorkspace
                                threadId={threadId}
                                snapshot={fleetSnapshot}
                                selectedAgentRunId={selectedAgentRunId}
                                selectedWorkflowRunId={selectedWorkflowRunId}
                                onSelectAgent={setSelectedAgentRunId}
                                onSelectWorkflow={setSelectedWorkflowRunId}
                                onAgentAction={handleAgentAction}
                                onWorkflowAction={handleWorkflowAction}
                            />
                        </Suspense>
                    </div>
                ) : null}

                {controlOpen ? (
                    <div className={activeWorkspaceTab?.kind === 'control' ? 'flex min-h-0 flex-1' : 'hidden'}>
                        <Suspense fallback={(
                            <div className="flex min-h-0 flex-1 items-center justify-center">
                                <LoaderCircle size={18} className="animate-spin text-[var(--accent-primary)]/75" />
                            </div>
                        )}>
                            <AssistantControlWorkspace active={open && activeWorkspaceTab?.kind === 'control'} />
                        </Suspense>
                    </div>
                ) : null}

                {resourcesOpen ? (
                    <div className={activeWorkspaceTab?.kind === 'resources' ? 'flex min-h-0 flex-1' : 'hidden'}>
                        <Suspense fallback={(
                            <div className="flex min-h-0 flex-1 items-center justify-center">
                                <LoaderCircle size={18} className="animate-spin text-[var(--accent-primary)]/75" />
                            </div>
                        )}>
                            <AssistantResourcesWorkspace
                                turns={turns}
                                projectPath={projectPath}
                                onOpenPreview={onOpenPreview}
                                onOpenPreviewInNewTab={onOpenPreviewInNewTab}
                                onOpenUrl={handleOpenResourceUrl}
                                onOpenDiff={handleOpenResourceDiff}
                                onOpenTurn={handleOpenResourceTurn}
                            />
                        </Suspense>
                    </div>
                ) : null}

                {activeWorkspaceTab?.kind === 'terminal' || activeWorkspaceTab?.kind === 'browser' || activeWorkspaceTab?.kind === 'control' || activeWorkspaceTab?.kind === 'resources' || activeWorkspaceTab?.kind === 'agents' ? null : !activeWorkspaceTab ? null : activeWorkspaceTab?.kind === 'explorer' ? (
                    <Suspense fallback={(
                        <div className="flex min-h-0 flex-1 items-center justify-center">
                            <LoaderCircle size={18} className="animate-spin text-[var(--accent-primary)]/75" />
                        </div>
                    )}>
                        <AssistantExplorerWorkspace
                            projectPath={projectPath}
                            onOpenPreview={onOpenPreview}
                            onOpenPreviewInNewTab={onOpenPreviewInNewTab}
                        />
                    </Suspense>
                ) : visibleTurn?.detailLoaded === false ? (
                    <div className="flex min-h-0 flex-1 items-center justify-center px-6 text-center">
                        {turnDetailError ? (
                            <div>
                                <TriangleAlert size={18} className="mx-auto text-amber-300/75" />
                                <p className="mt-3 text-[12px] font-medium text-sparkle-text-secondary">Could not load this turn</p>
                                <p className="mt-1 text-[10px] leading-4 text-sparkle-text-muted/70">{turnDetailError}</p>
                            </div>
                        ) : (
                            <div>
                                <LoaderCircle size={18} className="mx-auto animate-spin text-[var(--accent-primary)]/75" />
                                <p className="mt-3 text-[11px] text-sparkle-text-muted/70">Loading this turn’s messages and diffs…</p>
                            </div>
                        )}
                    </div>
                ) : visibleTurn ? (
                    <AssistantTurnReview
                        turn={visibleTurn}
                        selectedDiff={visibleSelectedDiff}
                        focusSelectedDiffRequestId={activeWorkspaceTab?.kind === 'review' ? focusedDiffRequestId : null}
                        showBack={activeWorkspaceTab?.kind === 'review'}
                        showOpenInTab={activeWorkspaceTab?.kind === 'review'}
                        onBack={() => {
                            setReviewTurnId(null)
                            setFocusedDiffRequestId(null)
                        }}
                        onOpenInTab={() => handleOpenTurnInTab(visibleTurn.id)}
                        onSelectDiff={onSelectDiff}
                        onLoadingChange={handleTurnLoadingChange}
                    />
                ) : (
                    <AssistantReviewLanding
                        threadId={threadId}
                        turns={turns}
                        activeTurnId={activeTurnId}
                        ready={reviewIndexReady}
                        loading={reviewIndexLoading}
                        error={reviewIndexError}
                        onOpenTurn={handleOpenReviewTurn}
                        onOpenFile={handleOpenReviewFile}
                        onOpenTurnInTab={handleOpenTurnInTab}
                    />
                )}
                <AssistantInspectorDeveloperToast toast={developerToast} onDismiss={dismissDeveloperToast} />
            </>
        </AssistantInspectorSidebar>
    )
})
