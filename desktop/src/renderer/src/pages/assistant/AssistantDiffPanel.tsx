import { lazy, memo, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Bot, FolderTree, GitCompareArrows, LayoutGrid, Library, LoaderCircle, MessageSquareText, ShieldAlert, ShieldCheck, SquareTerminal, TriangleAlert, Volume2 } from 'lucide-react'
import type { FleetSnapshot } from '@shared/assistant/contracts'
import type { ControlStateSnapshot, ControlWorkspaceSnapshot } from '@shared/agent-control/contracts'
import type { BrowserSurfaceOpenRequest } from '@shared/agent-control/protocol'
import type { PreviewOpenOptions } from '@/components/ui/file-preview/types'
import type { AssistantDiffTarget, AssistantDiffTurn } from './assistant-diff-types'
import { AssistantBrowserPageIcon } from './AssistantBrowserPageIcon'
import { AssistantInspectorNewTab } from './AssistantInspectorNewTab'
import { AssistantInspectorSidebar, type AssistantInspectorTab } from './AssistantInspectorSidebar'
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

type WorkspaceTab =
    | { id: string; kind: 'new' }
    | { id: 'review'; kind: 'review' }
    | { id: 'explorer'; kind: 'explorer' }
    | { id: 'terminal'; kind: 'terminal' }
    | { id: 'browser'; kind: 'browser' }
    | { id: 'control'; kind: 'control' }
    | { id: 'resources'; kind: 'resources' }
    | { id: 'agents'; kind: 'agents' }
    | { id: string; kind: 'turn'; turnId: string }

const REVIEW_TAB: WorkspaceTab = { id: 'review', kind: 'review' }
const EXPLORER_TAB: WorkspaceTab = { id: 'explorer', kind: 'explorer' }
const TERMINAL_TAB: WorkspaceTab = { id: 'terminal', kind: 'terminal' }
const BROWSER_TAB: WorkspaceTab = { id: 'browser', kind: 'browser' }
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
    const newTabSequenceRef = useRef(1)
    const reviewFileRevealSequenceRef = useRef(-1)
    const browserNavigationSequenceRef = useRef(1)
    const processedBrowserSurfaceRequestRef = useRef<string | null>(null)
    const wasOpenRef = useRef(open)
    const loadingTimerRef = useRef(0)
    const [activeTabId, setActiveTabId] = useState('new:0')
    const [workspaceTabs, setWorkspaceTabs] = useState<WorkspaceTab[]>([{ id: 'new:0', kind: 'new' }])
    const [reviewTurnId, setReviewTurnId] = useState<string | null>(null)
    const [focusedDiffRequestId, setFocusedDiffRequestId] = useState<number | null>(null)
    const [transitionLoadingTabId, setTransitionLoadingTabId] = useState<string | null>(null)
    const [contentLoadingTabId, setContentLoadingTabId] = useState<string | null>(null)
    const [browserAudible, setBrowserAudible] = useState(false)
    const [browserFaviconUrl, setBrowserFaviconUrl] = useState<string | null>(null)
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

    const createNewTab = useCallback((): WorkspaceTab => ({
        id: `new:${newTabSequenceRef.current++}`,
        kind: 'new'
    }), [])

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
        return () => { cancelled = true; unsubscribe() }
    }, [])

    const pendingControlCount = controlState?.pendingGrants.length || 0
    const pendingBrowserCount = controlState?.pendingGrants.filter((request) => (
        controlState.targets.some((target) => target.targetId === request.targetId && target.kind === 'zyra-browser')
    )).length || 0

    useEffect(() => {
        if (pendingControlCount === 0) return
        setWorkspaceTabs((current) => current.some((tab) => tab.kind === 'control') ? current : [...current, CONTROL_TAB])
    }, [pendingControlCount])

    useEffect(() => {
        void window.devscope.agentControl.updateWorkspaceState(null)
        const newTab = createNewTab()
        setActiveTabId(newTab.id)
        setWorkspaceTabs([newTab])
        setReviewTurnId(null)
        setFocusedDiffRequestId(null)
        setTransitionLoadingTabId(null)
        setContentLoadingTabId(null)
        setBrowserAudible(false)
        setBrowserFaviconUrl(null)
        setBrowserNavigationRequest(null)
        setBrowserWorkspaceState({ open: false, activeTabId: null, splitTabId: null, visibleTabIds: [], tabs: [] })
        processedBrowserSurfaceRequestRef.current = null
    }, [createNewTab, sessionId])

    useEffect(() => {
        const opening = open && !wasOpenRef.current
        wasOpenRef.current = open
        if (!opening || revealRequest || workspaceTabs.some((tab) => tab.kind !== 'new')) return
        const newTab = createNewTab()
        setWorkspaceTabs([newTab])
        setActiveTabId(newTab.id)
        setReviewTurnId(null)
        setFocusedDiffRequestId(null)
        setTransitionLoadingTabId(null)
        setContentLoadingTabId(null)
        setBrowserNavigationRequest(null)
    }, [createNewTab, open, revealRequest, workspaceTabs])

    useEffect(() => {
        if (!browserSurfaceRequest || processedBrowserSurfaceRequestRef.current === browserSurfaceRequest.requestId) return
        processedBrowserSurfaceRequestRef.current = browserSurfaceRequest.requestId
        const mode = browserSurfaceRequest.mode || 'open'
        if (mode === 'close' || mode === 'external') return
        setWorkspaceTabs((current) => {
            const withoutChooser = current.filter((tab) => tab.id !== activeTabId || tab.kind !== 'new')
            if (current.some((tab) => tab.kind === 'browser')) return withoutChooser
            const replaced = current.map((tab) => tab.id === activeTabId && tab.kind === 'new' ? BROWSER_TAB : tab)
            return replaced.some((tab) => tab.kind === 'browser') ? replaced : [...replaced, BROWSER_TAB]
        })
        if (browserSurfaceRequest.reveal) {
            setActiveTabId('browser')
            beginTabTransition('browser')
        }
    }, [activeTabId, beginTabTransition, browserSurfaceRequest])

    useEffect(() => {
        if (!open || !revealRequest) return
        setWorkspaceTabs((current) => {
            const reviewExists = current.some((tab) => tab.kind === 'review')
            const withoutActiveChooser = current.filter((tab) => tab.id !== activeTabId || tab.kind !== 'new')
            if (reviewExists) return withoutActiveChooser
            const replaced = current.map((tab) => tab.id === activeTabId && tab.kind === 'new' ? REVIEW_TAB : tab)
            return replaced.some((tab) => tab.kind === 'review') ? replaced : [...replaced, REVIEW_TAB]
        })
        setActiveTabId('review')
        setReviewTurnId(revealRequest.turnId)
        setFocusedDiffRequestId(revealRequest.id)
        onRevealRequestHandled(revealRequest.id)
    }, [onRevealRequestHandled, open, revealRequest])

    useEffect(() => {
        const invalidIds = new Set(workspaceTabs.flatMap((tab) => (
            tab.kind === 'turn' && !turns.some((turn) => turn.id === tab.turnId) ? [tab.id] : []
        )))
        if (invalidIds.size === 0) return
        const next = workspaceTabs.filter((tab) => !invalidIds.has(tab.id))
        setWorkspaceTabs(next)
        if (invalidIds.has(activeTabId)) setActiveTabId(next[0]?.id || 'review')
    }, [activeTabId, turns, workspaceTabs])

    useEffect(() => {
        setReviewTurnId((current) => current && turns.some((turn) => turn.id === current) ? current : null)
    }, [turns])

    const tabs = useMemo<AssistantInspectorTab[]>(() => workspaceTabs.flatMap((tab) => {
        if (tab.kind === 'new') {
            return [{
                id: tab.id,
                label: 'New tab',
                icon: <LayoutGrid size={11} />,
                closable: true,
                loading: transitionLoadingTabId === tab.id,
                preview: 'Choose an Inspector workspace'
            }]
        }
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
            return [{
                id: tab.id,
                label: 'Browser',
                icon: <AssistantBrowserPageIcon faviconUrl={browserFaviconUrl} size={12} />,
                statusIcon: browserAudible || pendingBrowserCount > 0 ? (
                    <span className="flex items-center gap-0.5">
                        {browserAudible ? <Volume2 size={10} aria-label="A browser tab is playing audio" /> : null}
                        {pendingBrowserCount > 0 ? <ShieldAlert size={10} className="text-amber-300 motion-safe:animate-pulse" aria-label="Browser control approval needed" /> : null}
                    </span>
                ) : undefined,
                count: pendingBrowserCount || undefined,
                attention: pendingBrowserCount > 0,
                closable: true,
                loading: transitionLoadingTabId === tab.id,
                preview: projectPath ? `Browser · ${projectPath}` : 'No project attached'
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
    }), [browserAudible, browserFaviconUrl, contentLoadingTabId, fleetSnapshot, pendingBrowserCount, pendingControlCount, projectPath, transitionLoadingTabId, turns, workspaceTabs])

    const activeWorkspaceTab = workspaceTabs.find((tab) => tab.id === activeTabId) || workspaceTabs[0] || null
    const activeTurnTab = activeWorkspaceTab?.kind === 'turn' ? activeWorkspaceTab : null
    const visibleTurnId = activeTurnTab?.turnId || (activeWorkspaceTab?.kind === 'review' ? reviewTurnId : null)
    const visibleTurn = turns.find((turn) => turn.id === visibleTurnId) || null
    const visibleSelectedDiff = visibleTurn && selectedTurnId === visibleTurn.id ? selectedDiff : visibleTurn?.files[0]?.target || null
    const reviewOpen = workspaceTabs.some((tab) => tab.kind === 'review')
    const explorerOpen = workspaceTabs.some((tab) => tab.kind === 'explorer')
    const terminalOpen = workspaceTabs.some((tab) => tab.kind === 'terminal')
    const browserOpen = workspaceTabs.some((tab) => tab.kind === 'browser')
    const controlOpen = workspaceTabs.some((tab) => tab.kind === 'control')
    const resourcesOpen = workspaceTabs.some((tab) => tab.kind === 'resources')
    const agentsOpen = workspaceTabs.some((tab) => tab.kind === 'agents')

    const handleBrowserWorkspaceStateChange = useCallback((next: ControlWorkspaceSnapshot['browser']) => {
        setBrowserWorkspaceState((current) => JSON.stringify(current) === JSON.stringify(next) ? current : next)
    }, [])

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
        setWorkspaceTabs((current) => {
            const withoutActiveChooser = current.filter((tab) => tab.id !== activeTabId || tab.kind !== 'new')
            if (current.some((tab) => tab.id === workspace.id)) return withoutActiveChooser
            const replaced = current.map((tab) => tab.id === activeTabId && tab.kind === 'new' ? workspace : tab)
            return replaced.some((tab) => tab.id === workspace.id) ? replaced : [...replaced, workspace]
        })
        setActiveTabId(workspace.id)
        beginTabTransition(workspace.id)
    }, [activeTabId, beginTabTransition])

    const handleOpenReviewWorkspace = useCallback(() => {
        setFocusedDiffRequestId(null)
        setReviewTurnId(null)
        openSingletonWorkspace(REVIEW_TAB)
    }, [openSingletonWorkspace])
    const handleOpenExplorerWorkspace = useCallback(() => openSingletonWorkspace(EXPLORER_TAB), [openSingletonWorkspace])
    const handleOpenTerminalWorkspace = useCallback(() => openSingletonWorkspace(TERMINAL_TAB), [openSingletonWorkspace])
    const handleOpenBrowserWorkspace = useCallback(() => openSingletonWorkspace(BROWSER_TAB), [openSingletonWorkspace])
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
        setWorkspaceTabs((current) => current.some((tab) => tab.kind === 'browser')
            ? current
            : [...current, BROWSER_TAB])
        setBrowserNavigationRequest({ id: browserNavigationSequenceRef.current++, url })
        setActiveTabId('browser')
        beginTabTransition('browser')
    }, [beginTabTransition, projectPath])

    const handleBrowserNavigationRequestHandled = useCallback((requestId: number) => {
        setBrowserNavigationRequest((current) => current?.id === requestId ? null : current)
    }, [])

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
        if (tab?.kind === 'turn') selectTurn(tab.turnId)
    }, [beginTabTransition, reviewTurnId, selectTurn, workspaceTabs])

    const handleAddTab = useCallback(() => {
        const newTab = createNewTab()
        setWorkspaceTabs((current) => [...current, newTab])
        setActiveTabId(newTab.id)
        beginTabTransition(newTab.id)
    }, [beginTabTransition, createNewTab])

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
        if (workspaceTabs.length <= 1) {
            onClose()
            return
        }
        const closingIndex = workspaceTabs.findIndex((tab) => tab.id === tabId)
        const closingTab = workspaceTabs[closingIndex]
        const next = workspaceTabs.filter((tab) => tab.id !== tabId)
        setWorkspaceTabs(next)
        setTransitionLoadingTabId((current) => current === tabId ? null : current)
        setContentLoadingTabId((current) => current === tabId ? null : current)
        if (closingTab?.kind === 'review') {
            setReviewTurnId(null)
            setFocusedDiffRequestId(null)
        }
        if (closingTab?.kind === 'browser') {
            setBrowserAudible(false)
            setBrowserFaviconUrl(null)
            setBrowserNavigationRequest(null)
        }
        if (activeTabId === tabId) {
            const fallback = next[Math.min(Math.max(closingIndex, 0), next.length - 1)] || next[next.length - 1]
            setActiveTabId(fallback.id)
            if (fallback.kind === 'turn') selectTurn(fallback.turnId)
            if (fallback.kind === 'review' && reviewTurnId) selectTurn(reviewTurnId)
        }
    }, [activeTabId, onClose, reviewTurnId, selectTurn, workspaceTabs])

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
            onAddTab={handleAddTab}
            onClose={onClose}
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
                            : 'pointer-events-none invisible absolute inset-x-0 bottom-0 top-[76px] flex'}
                    >
                        <Suspense fallback={(
                            <div className="flex min-h-0 flex-1 items-center justify-center">
                                <LoaderCircle size={18} className="animate-spin text-[var(--accent-primary)]/75" />
                            </div>
                        )}>
                            <AssistantBrowserWorkspace
                                workspaceKey={sessionId || projectPath || 'detached'}
                                threadId={threadId || 'thread:detached'}
                                projectPath={projectPath}
                                active={open && activeWorkspaceTab?.kind === 'browser'}
                                controlState={controlState}
                                navigationRequest={browserNavigationRequest}
                                surfaceRequest={browserSurfaceRequest}
                                onNavigationRequestHandled={handleBrowserNavigationRequestHandled}
                                onSurfaceRequestHandled={onBrowserSurfaceRequestHandled}
                                onWorkspaceStateChange={handleBrowserWorkspaceStateChange}
                                onAudibleChange={setBrowserAudible}
                                onActiveFaviconChange={setBrowserFaviconUrl}
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

                {activeWorkspaceTab?.kind === 'terminal' || activeWorkspaceTab?.kind === 'browser' || activeWorkspaceTab?.kind === 'control' || activeWorkspaceTab?.kind === 'resources' || activeWorkspaceTab?.kind === 'agents' ? null : activeWorkspaceTab?.kind === 'new' ? (
                    <AssistantInspectorNewTab
                        reviewOpen={reviewOpen}
                        browserOpen={browserOpen}
                        controlOpen={controlOpen}
                        explorerOpen={explorerOpen}
                        terminalOpen={terminalOpen}
                        resourcesOpen={resourcesOpen}
                        subagentsOpen={agentsOpen}
                        onSelectReview={handleOpenReviewWorkspace}
                        onSelectBrowser={handleOpenBrowserWorkspace}
                        onSelectControl={handleOpenControlWorkspace}
                        onSelectExplorer={handleOpenExplorerWorkspace}
                        onSelectTerminal={handleOpenTerminalWorkspace}
                        onSelectResources={handleOpenResourcesWorkspace}
                        onSelectSubagents={handleOpenAgentsWorkspace}
                    />
                ) : activeWorkspaceTab?.kind === 'explorer' ? (
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
            </>
        </AssistantInspectorSidebar>
    )
})
