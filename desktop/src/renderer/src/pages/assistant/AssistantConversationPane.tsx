import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { AssistantProposedPlan, AssistantSessionTurnUsageEntry } from '@shared/assistant/contracts'
import { useSettings } from '@/lib/settings'
import { useAssistantConversationStore, useAssistantStoreActions, useAssistantStoreSelector } from '@/lib/assistant/store'
import { isAssistantThreadActivelyWorking } from '@/lib/assistant/selectors'
import { cn } from '@/lib/utils'
import { buildPromptWithContextFiles } from './assistant-composer-utils'
import { clearAssistantComposerSessionState } from './assistant-composer-session-state'
import { AssistantChatOnboardingOverlay } from './AssistantChatOnboardingOverlay'
import { AssistantConnectionRecoveryBanner } from './AssistantConnectionRecoveryBanner'
import { AssistantConversationHeader } from './AssistantConversationHeader'
import { AssistantConversationComposerPane } from './AssistantConversationComposerPane'
import { AssistantConversationTimelinePane } from './AssistantConversationTimelinePane'
import type { AssistantConversationPaneProps } from './AssistantConversationPane.types'
import type { AssistantComposerSendOptions, ComposerContextFile } from './assistant-composer-types'
import { getAssistantLinkBaseFilePath } from './assistant-file-navigation'
import { getAssistantActivePlanProgress, hasAssistantPlanPanelContent } from './assistant-plan-utils'
import { getAssistantThreadDisplayTitle, getSessionDisplayTitle, isAssistantDraftSession, resolveSessionProjectPath } from './assistant-sessions-rail-utils'
import { useAssistantConnectionRecovery } from './useAssistantConnectionRecovery'
import { useAssistantQueuedComposer, type AssistantQueuedComposerSessionState } from './useAssistantQueuedComposer'
import { useAssistantSessionTurnUsage } from './useAssistantSessionTurnUsage'
import { useAssistantPageTimelineScroll } from './useAssistantPageTimelineScroll'

const TIMELINE_SHOW_SCROLL_BUTTON_THRESHOLD_PX = 420
const TIMELINE_HIDE_SCROLL_BUTTON_THRESHOLD_PX = 180
const IMPLEMENT_MODE_TOAST_MS = 2600
const NEW_CHAT_HANDOFF_VISUAL_MS = 360
const NEW_CHAT_HANDOFF_SESSION_ID = 'assistant-session-new-chat-handoff'
const ZYRA_ACTIVE_PROFILE_KEY = 'zyra-ui:active-profile:v2'
const LEGACY_ACTIVE_PROFILE_KEY = 'zyra-ui:active-profile:v1'
const LEGACY_BUILDER_PROFILE = ['e', 'lson'].join('')

type ZyraActiveProfile = 'default' | 'builder'

function readStoredZyraProfile(): ZyraActiveProfile {
    try {
        const stored = window.localStorage.getItem(ZYRA_ACTIVE_PROFILE_KEY)
        if (stored === 'builder') return 'builder'
        if (stored === 'default') return 'default'

        const legacy = window.localStorage.getItem(LEGACY_ACTIVE_PROFILE_KEY)
        if (legacy === LEGACY_BUILDER_PROFILE) return 'builder'
        return 'default'
    } catch {
        return 'default'
    }
}

function areQueuedComposerSessionStatesEqual(
    left: AssistantQueuedComposerSessionState[],
    right: AssistantQueuedComposerSessionState[]
): boolean {
    if (left === right) return true
    if (left.length !== right.length) return false
    for (let index = 0; index < left.length; index += 1) {
        const leftState = left[index]
        const rightState = right[index]
        if (
            leftState.sessionId !== rightState.sessionId
            || leftState.threadState !== rightState.threadState
            || leftState.pendingApprovalCount !== rightState.pendingApprovalCount
            || leftState.pendingUserInputCount !== rightState.pendingUserInputCount
        ) {
            return false
        }
    }
    return true
}

export function AssistantConversationPane(props: AssistantConversationPaneProps) {
    const controller = useAssistantConversationStore()
    const actions = useAssistantStoreActions()
    const { settings } = useSettings()
    const headerMenuRef = useRef<HTMLDivElement | null>(null)
    const [activeHeaderMenu, setActiveHeaderMenu] = useState<'none' | 'open-with' | 'more'>('none')
    const [activeZyraProfile, setActiveZyraProfile] = useState<ZyraActiveProfile>(() => readStoredZyraProfile())
    const [showScrollToBottom, setShowScrollToBottom] = useState(false)
    const [interactionModeOverride, setInteractionModeOverride] = useState<'default' | null>(null)
    const [implementationToastVisible, setImplementationToastVisible] = useState(false)
    const [newChatHandoffRevision, setNewChatHandoffRevision] = useState(0)
    const showScrollToBottomRef = useRef(false)
    const scrollButtonRafRef = useRef<number | null>(null)
    const newChatHandoffUntilRef = useRef(0)

    const isThreadWorking = isAssistantThreadActivelyWorking(controller.activeThread)
    const selectedSessionId = controller.selectedSession?.id || null
    const selectedSessionIsDraft = Boolean(controller.selectedSession && isAssistantDraftSession(controller.selectedSession))
    const selectedSessionUsesNewChatSurface = Boolean(selectedSessionIsDraft && !controller.selectedSession?.pendingLabRequest)
    const pendingCreateSessionInput = controller.pendingCreateSessionInput
    const isCreatingFreshChat = Boolean(pendingCreateSessionInput)
    if (isCreatingFreshChat) {
        newChatHandoffUntilRef.current = Math.max(
            newChatHandoffUntilRef.current,
            Date.now() + NEW_CHAT_HANDOFF_VISUAL_MS
        )
    }
    const newChatHandoffActive = isCreatingFreshChat || newChatHandoffUntilRef.current > Date.now()
    const activeComposerSessionId = newChatHandoffActive ? null : selectedSessionId
    const queueSessionStates = useAssistantStoreSelector((state) => (
        state.snapshot.sessions.map((session) => {
            const activeThread = session.threads.find((thread) => thread.id === session.activeThreadId) || null
            return {
                sessionId: session.id,
                threadState: activeThread?.state || 'idle',
                pendingApprovalCount: activeThread?.pendingApprovals.filter((approval) => approval.status === 'pending').length || 0,
                pendingUserInputCount: activeThread?.pendingUserInputs.filter((input) => input.status === 'pending').length || 0
            }
        })
    ), areQueuedComposerSessionStatesEqual)
    const selectedProjectPath = controller.selectedSession ? resolveSessionProjectPath(controller.selectedSession) : ''
    const pendingCreateProjectPath = pendingCreateSessionInput?.projectPath?.trim() || ''
    const lastResolvedProjectPathBySessionRef = useRef<Record<string, string>>({})
    const selectedSessionMode = 'work' as const
    const displayProjectPath = isCreatingFreshChat ? pendingCreateProjectPath : selectedProjectPath || (
        (controller.commandPending || controller.loading) && selectedSessionId
            ? lastResolvedProjectPathBySessionRef.current[selectedSessionId] || ''
            : ''
    )
    const selectedSessionTitle = controller.selectedSession ? getSessionDisplayTitle(controller.selectedSession) : 'Assistant'
    const activeThreadIsSubagent = controller.activeThread?.source === 'subagent'
    const activeThreadLabel = controller.activeThread ? getAssistantThreadDisplayTitle(controller.activeThread) : null
    const selectedProjectTooltip = displayProjectPath || (
        'Select a project when this chat needs files.'
    )
    const latestProjectLabel = displayProjectPath
        ? (displayProjectPath.split(/[\\/]/).filter(Boolean).pop() || displayProjectPath)
        : 'select project'
    const assistantMessageFilePath = useMemo(
        () => getAssistantLinkBaseFilePath(displayProjectPath),
        [displayProjectPath]
    )
    const availableModels = useMemo(() => {
        if (controller.knownModels.length > 0) return controller.knownModels
        const activeModel = String(controller.activeThread?.model || '').trim()
        return activeModel ? [{ id: activeModel, label: activeModel }] : []
    }, [controller.activeThread?.model, controller.knownModels])
    const planPanelAvailable = hasAssistantPlanPanelContent(controller.activePlan, controller.latestProposedPlan)
    const activePlanProgress = getAssistantActivePlanProgress(controller.activePlan, controller.activeThread?.latestTurn || null)
    const planProgressLabel = activePlanProgress ? `${activePlanProgress.currentStepNumber}/${activePlanProgress.totalSteps}` : null
    const planIsComplete = activePlanProgress?.isComplete === true
    const { sessionTurnUsage } = useAssistantSessionTurnUsage({
        sessionId: activeComposerSessionId,
        enabled: Boolean(activeComposerSessionId),
        refreshKey: `${controller.activeThread?.latestTurn?.id || ''}:${controller.activeThread?.latestTurn?.completedAt || ''}:${controller.activeThread?.latestTurn?.state || ''}`
    })
    const turnUsageById = useMemo(() => {
        const next = new Map<string, AssistantSessionTurnUsageEntry>()
        for (const turn of sessionTurnUsage?.turns || []) {
            next.set(turn.id, turn)
        }
        return next
    }, [sessionTurnUsage])
    const shouldShowWorkingIndicator = isThreadWorking
        && !controller.timelineMessages.some((message) => message.role === 'assistant' && message.streaming)
    const lastTimelineMessage = controller.timelineMessages[controller.timelineMessages.length - 1] || null
    const latestTimelineActivity = controller.activityFeed[0] || null
    const selectedThreadHasHistoricalContent = Boolean(
        ((controller.activeThread?.messageCount || 0) > 0)
        || Boolean(controller.activeThread?.latestTurn)
        || Boolean(controller.activeThread?.activePlan)
        || (controller.activeThread?.proposedPlans.length || 0) > 0
        || (controller.activeThread?.pendingApprovals.length || 0) > 0
        || (controller.activeThread?.pendingUserInputs.length || 0) > 0
    )
    const connectionRecovery = useAssistantConnectionRecovery({
        selectedSessionId: activeComposerSessionId,
        activeThreadId: newChatHandoffActive ? null : controller.activeThread?.id || null,
        threadState: newChatHandoffActive ? null : controller.activeThread?.state || null,
        loading: controller.loading,
        connected: controller.connected,
        commandPending: newChatHandoffActive ? false : controller.commandPending,
        threadLastError: controller.activeThread?.lastError || null,
        commandError: controller.commandError,
        activities: newChatHandoffActive ? [] : controller.activityFeed,
        connectResult: (sessionId) => actions.connectResult(sessionId),
        disconnect: (sessionId) => actions.disconnect(sessionId)
    })
    const isReconnectPending = !newChatHandoffActive && (
        connectionRecovery.reconnectPending || (controller.commandPending && !controller.connected && !isThreadWorking)
    )
    const isThreadConnecting = controller.phase.key === 'starting' || isReconnectPending
    const activeStatusLabel = isThreadConnecting ? 'Connecting...' : 'Working...'
    const { timelineContentRef, timelineScrollRef, onScrollTimeline, onScrollToBottom } = useAssistantPageTimelineScroll({
        sessionId: activeComposerSessionId,
        threadId: newChatHandoffActive ? null : controller.activeThread?.id || null,
        loading: controller.loading,
        timelineMessageCount: controller.timelineMessages.length,
        lastTimelineMessageId: lastTimelineMessage?.id || null,
        lastTimelineMessageUpdatedAt: lastTimelineMessage?.updatedAt || null,
        activityFeedCount: controller.activityFeed.length,
        latestTimelineActivityId: latestTimelineActivity?.id || null,
        latestTimelineActivityCreatedAt: latestTimelineActivity?.createdAt || null,
        shouldShowWorkingIndicator,
        latestTurnStartedAt: controller.activeThread?.latestTurn?.startedAt || null,
        latestTurnState: controller.activeThread?.latestTurn?.state || null,
        threadState: controller.activeThread?.state || null
    })
    const isLoadingSelectedChat = Boolean(
        !newChatHandoffActive
        && !isThreadConnecting
        && controller.selectedSession
        && controller.timelineMessages.length === 0
        && controller.activityFeed.length === 0
        && (
            controller.selectionHydrating
            || (
                !controller.loading
                && selectedThreadHasHistoricalContent
            )
        )
    )
    const showPlaygroundRootOnboarding = false
    const showWorkProjectOnboarding = false
    const showPlaygroundDetachedOnboarding = false
    const showChatOnboardingOverlay = showPlaygroundRootOnboarding || showWorkProjectOnboarding || showPlaygroundDetachedOnboarding
    const gitRefreshToken = `${controller.selectedSession?.id || 'no-session'}:${controller.activeThread?.id || 'no-thread'}:${controller.activeThread?.latestTurn?.completedAt || controller.activeThread?.lastSeenCompletedTurnId || 'idle'}`
    const connectionBelongsToSelectedChat = Boolean(activeComposerSessionId) && isThreadConnecting && !selectedSessionUsesNewChatSurface
    const effectivePendingUserInputs = newChatHandoffActive ? [] : controller.pendingUserInputs
    const hasConversationContent = !newChatHandoffActive && Boolean(
        selectedThreadHasHistoricalContent
        || controller.timelineMessages.length > 0
        || controller.activityFeed.length > 0
        || (controller.activeThread?.proposedPlans.length || 0) > 0
        || (!selectedSessionUsesNewChatSurface && isThreadWorking)
        || connectionBelongsToSelectedChat
        || isLoadingSelectedChat
    )
    const centerComposer = Boolean(
        !showChatOnboardingOverlay
        && !hasConversationContent
        && !controller.selectedSession?.pendingLabRequest
        && effectivePendingUserInputs.length === 0
    )
    const composerIsCentered = newChatHandoffActive || centerComposer
    const bottomComposerOverlayActive = !composerIsCentered
    const visibleComposerSessionId = newChatHandoffActive
        ? NEW_CHAT_HANDOFF_SESSION_ID
        : selectedSessionId
    const activeComposerModel = selectedSessionIsDraft || newChatHandoffActive
        ? undefined
        : controller.activeThread?.model || availableModels[0]?.id || undefined
    const resetComposerStateToken = isCreatingFreshChat
        ? `${selectedSessionId || 'pending'}:${pendingCreateProjectPath || 'chat'}`
        : null
    const emptyComposerProjectLabel = displayProjectPath
        ? (displayProjectPath.split(/[\\/]/).filter(Boolean).pop() || displayProjectPath)
        : ''
    const emptyComposerPrompt = useMemo(() => {
        const hour = new Date().getHours()
        const timeGreeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'
        const projectPrompts = emptyComposerProjectLabel ? [
            `${timeGreeting}. What are we shaping in ${emptyComposerProjectLabel}?`,
            `Ready to open up ${emptyComposerProjectLabel}?`,
            `What needs attention in ${emptyComposerProjectLabel}?`,
            `Where should we start in ${emptyComposerProjectLabel}?`,
            `What are we making better in ${emptyComposerProjectLabel}?`
        ] : [
            `${timeGreeting}. What are we working on?`,
            'What are we opening up first?',
            'Bring me the bug, the idea, or the messy bit.',
            'What are we figuring out today?',
            'Tell me what changed, broke, or needs building.'
        ]
        return projectPrompts[Math.floor(Math.random() * projectPrompts.length)]
    }, [emptyComposerProjectLabel])

    const getDistanceFromBottom = useCallback((element: HTMLDivElement) => {
        return Math.max(0, element.scrollHeight - element.scrollTop - element.clientHeight)
    }, [])

    const syncScrollButtonVisibility = useCallback((element: HTMLDivElement) => {
        const distanceFromBottom = getDistanceFromBottom(element)
        const shouldShowButton = showScrollToBottomRef.current
            ? distanceFromBottom > TIMELINE_HIDE_SCROLL_BUTTON_THRESHOLD_PX
            : distanceFromBottom > TIMELINE_SHOW_SCROLL_BUTTON_THRESHOLD_PX

        if (showScrollToBottomRef.current !== shouldShowButton) {
            showScrollToBottomRef.current = shouldShowButton
            setShowScrollToBottom(shouldShowButton)
        }
    }, [getDistanceFromBottom])

    const handleTimelineScrollEvent = useCallback((element: HTMLDivElement) => {
        onScrollTimeline(element)
        if (scrollButtonRafRef.current !== null) {
            window.cancelAnimationFrame(scrollButtonRafRef.current)
        }
        scrollButtonRafRef.current = window.requestAnimationFrame(() => {
            scrollButtonRafRef.current = null
            syncScrollButtonVisibility(element)
        })
    }, [onScrollTimeline, syncScrollButtonVisibility])

    useEffect(() => {
        if (!selectedSessionId || !selectedProjectPath) return
        lastResolvedProjectPathBySessionRef.current[selectedSessionId] = selectedProjectPath
    }, [selectedProjectPath, selectedSessionId])

    useEffect(() => {
        if (!isCreatingFreshChat) return
        clearAssistantComposerSessionState(NEW_CHAT_HANDOFF_SESSION_ID)
        if (selectedSessionId && selectedSessionIsDraft) clearAssistantComposerSessionState(selectedSessionId)
    }, [isCreatingFreshChat, selectedSessionId, selectedSessionIsDraft])

    useEffect(() => {
        if (isCreatingFreshChat) return
        const remainingMs = newChatHandoffUntilRef.current - Date.now()
        if (remainingMs <= 0) return
        const timeoutId = window.setTimeout(() => {
            newChatHandoffUntilRef.current = 0
            setNewChatHandoffRevision((current) => current + 1)
        }, Math.max(0, remainingMs))
        return () => window.clearTimeout(timeoutId)
    }, [isCreatingFreshChat, newChatHandoffRevision, selectedSessionId])

    useEffect(() => {
        if (activeHeaderMenu === 'none') return
        const handlePointerDown = (event: MouseEvent) => {
            if (!headerMenuRef.current?.contains(event.target as Node)) setActiveHeaderMenu('none')
        }
        const handleEscape = (event: KeyboardEvent) => {
            if (event.key === 'Escape') setActiveHeaderMenu('none')
        }
        document.addEventListener('mousedown', handlePointerDown)
        window.addEventListener('keydown', handleEscape)
        return () => {
            document.removeEventListener('mousedown', handlePointerDown)
            window.removeEventListener('keydown', handleEscape)
        }
    }, [activeHeaderMenu])

    useEffect(() => {
        try {
            window.localStorage.setItem(ZYRA_ACTIVE_PROFILE_KEY, activeZyraProfile)
        } catch {
            // Keep profile switching usable even when storage is blocked.
        }
    }, [activeZyraProfile])

    useLayoutEffect(() => {
        const element = timelineScrollRef.current
        if (!element) return
        showScrollToBottomRef.current = false
        setShowScrollToBottom(false)
        syncScrollButtonVisibility(element)
    }, [controller.activeThread?.id, controller.loading, controller.selectedSession?.id, syncScrollButtonVisibility, timelineScrollRef])

    useLayoutEffect(() => {
        const element = timelineScrollRef.current
        if (!element) return
        syncScrollButtonVisibility(element)
    }, [
        controller.activityFeed.length,
        controller.timelineMessages.length,
        isLoadingSelectedChat,
        syncScrollButtonVisibility,
        timelineScrollRef
    ])

    useEffect(() => {
        return () => {
            if (scrollButtonRafRef.current !== null) {
                window.cancelAnimationFrame(scrollButtonRafRef.current)
            }
        }
    }, [])

    useEffect(() => {
        if (controller.activeThread?.interactionMode === 'default') {
            setInteractionModeOverride(null)
        }
    }, [controller.activeThread?.interactionMode, controller.activeThread?.id])

    useEffect(() => {
        setActiveHeaderMenu('none')
        setInteractionModeOverride(null)
        setImplementationToastVisible(false)
    }, [controller.activeThread?.id, selectedSessionId])

    useEffect(() => {
        if (!implementationToastVisible) return
        const timeoutId = window.setTimeout(() => setImplementationToastVisible(false), IMPLEMENT_MODE_TOAST_MS)
        return () => window.clearTimeout(timeoutId)
    }, [implementationToastVisible])

    const handleScrollToBottomClick = useCallback(() => {
        showScrollToBottomRef.current = false
        setShowScrollToBottom(false)
        onScrollToBottom()
    }, [onScrollToBottom])

    const handleComposerOverflowWheel = useCallback((deltaY: number) => {
        if (deltaY === 0) return
        const element = timelineScrollRef.current
        if (!element) return
        element.scrollTop += deltaY
        handleTimelineScrollEvent(element)
    }, [handleTimelineScrollEvent, timelineScrollRef])

    const handleRefreshModels = useCallback(() => {
        actions.refreshModels()
    }, [actions])

    const handleRespondUserInput = useCallback(async (requestId: string, answers: Record<string, string | string[]>) => {
        await actions.respondUserInput(requestId, answers)
    }, [actions])

    const handleApprovePendingPlaygroundLabRequest = useCallback(async (input: { title?: string; source: 'empty' | 'git-clone'; repoUrl?: string }) => {
        const sessionId = controller.selectedSession?.id
        if (!sessionId) return
        await actions.approvePendingPlaygroundLabRequest({
            sessionId,
            source: input.source,
            title: input.title,
            repoUrl: input.repoUrl
        })
    }, [actions, controller.selectedSession?.id])

    const handleDeclinePendingPlaygroundLabRequest = useCallback(async () => {
        const sessionId = controller.selectedSession?.id
        if (!sessionId) return
        await actions.declinePendingPlaygroundLabRequest({ sessionId })
    }, [actions, controller.selectedSession?.id])

    const handleStopTurn = useCallback(async () => {
        await actions.interruptTurn(
            controller.activeThread?.latestTurn?.id,
            controller.selectedSession?.id || undefined
        )
    }, [actions, controller.activeThread?.latestTurn?.id, controller.selectedSession?.id])

    const handleReconnectAssistant = useCallback(() => {
        connectionRecovery.reconnect()
    }, [connectionRecovery])

    const handleDispatchPrompt = useCallback(async (
        sessionId: string,
        prompt: string,
        contextFiles: ComposerContextFile[],
        options: AssistantComposerSendOptions
    ) => {
        if (!sessionId) return false
        const result = await actions.sendPromptResult(buildPromptWithContextFiles(prompt, contextFiles), {
            sessionId,
            model: options.model,
            runtimeMode: options.runtimeMode,
            interactionMode: options.interactionMode,
            effort: options.effort,
            serviceTier: options.serviceTier,
            profile: activeZyraProfile
        })
        return result.success
    }, [actions, activeZyraProfile])
    const isAssistantBusy = !newChatHandoffActive && (controller.commandPending || isThreadWorking)
    const {
        sendingComposerPrompt,
        queuedComposerMessageCount,
        queuedComposerMessageItems,
        handleSendPrompt,
        handleForceQueuedMessage,
        handleDeleteQueuedMessage,
        handleMoveQueuedMessage
    } = useAssistantQueuedComposer({
        selectedSessionId: activeComposerSessionId,
        sessionStates: queueSessionStates,
        isAssistantBusy,
        commandPending: !newChatHandoffActive && controller.commandPending,
        isThreadWorking: !newChatHandoffActive && isThreadWorking,
        activeTurnId: newChatHandoffActive ? null : controller.activeThread?.latestTurn?.id || null,
        busyMessageMode: settings.assistantBusyMessageMode,
        dispatchPrompt: handleDispatchPrompt,
        interruptTurn: (turnId, sessionId) => actions.interruptTurn(turnId, sessionId)
    })
    const handleImplementProposedPlan = useCallback(async (plan: AssistantProposedPlan) => {
        const planMarkdown = String(plan.planMarkdown || '').trim()
        if (!planMarkdown) return

        setInteractionModeOverride('default')
        setImplementationToastVisible(true)
        await actions.sendPromptResult(
            `Implement the approved plan below. Do not re-plan unless you hit a real blocking contradiction. Start executing now.\n\n<approved_plan>\n${planMarkdown}\n</approved_plan>`,
            {
                sessionId: selectedSessionId || undefined,
                model: controller.activeThread?.model || undefined,
                runtimeMode: controller.activeThread?.runtimeMode || 'approval-required',
                interactionMode: 'default',
                effort: controller.activeThread?.latestTurn?.effort || undefined,
                serviceTier: controller.activeThread?.latestTurn?.serviceTier === 'fast' ? 'fast' : undefined,
                profile: activeZyraProfile
            }
        )
    }, [
        actions,
        controller.activeThread?.latestTurn?.effort,
        controller.activeThread?.latestTurn?.serviceTier,
        controller.activeThread?.model,
        controller.activeThread?.runtimeMode,
        activeZyraProfile,
        selectedSessionId
    ])

    const handleCreateThread = useCallback(() => {
        void actions.newThread(controller.selectedSession?.id || undefined)
        setActiveHeaderMenu('none')
    }, [actions, controller.selectedSession?.id])

    const handleChooseProjectForWorkChat = useCallback(async () => {
        if (controller.commandPending) return
        if (controller.selectedSession?.id) {
            await actions.chooseProjectPath(controller.selectedSession.id)
            return
        }
        await actions.createProjectSession()
    }, [actions, controller.commandPending, controller.selectedSession?.id])

    const handleToggleDetailsPanel = useCallback(() => {
        props.onToggleRightSidebar()
        setActiveHeaderMenu('none')
    }, [props.onToggleRightSidebar])

    const effectiveInteractionMode = interactionModeOverride || controller.activeThread?.interactionMode || 'default'

    return (
        <section className="relative flex min-w-0 flex-1 flex-col">
            <div className={cn(
                'flex min-h-0 flex-1 flex-col transition-[filter,opacity] duration-200',
                showChatOnboardingOverlay && 'pointer-events-none select-none blur-[2px] opacity-55'
            )}>
                {!composerIsCentered ? (
                    <AssistantConversationHeader
                        rightPanelOpen={props.rightPanelOpen}
                        rightPanelMode={props.rightPanelMode}
                        planPanelAvailable={planPanelAvailable}
                        planProgressLabel={planProgressLabel}
                        planIsComplete={planIsComplete}
                        activeHeaderMenu={activeHeaderMenu}
                        setActiveHeaderMenu={setActiveHeaderMenu}
                        headerMenuRef={headerMenuRef}
                        leftSidebarCollapsed={props.leftSidebarCollapsed}
                        latestProjectLabel={latestProjectLabel}
                        selectedSessionTitle={selectedSessionTitle}
                        selectedSessionMode={selectedSessionMode}
                        zyraProfile={activeZyraProfile}
                        activeThreadIsSubagent={activeThreadIsSubagent}
                        activeThreadLabel={activeThreadLabel}
                        selectedProjectTooltip={selectedProjectTooltip}
                        selectedProjectPath={displayProjectPath || null}
                        preferredShell={settings.defaultShell}
                        gitRefreshToken={gitRefreshToken}
                        showPlaygroundTerminalAccessControl={false}
                        playgroundTerminalAccess={props.playgroundTerminalAccess}
                        onToggleLeftSidebar={props.onToggleLeftSidebar}
                        onPlaygroundTerminalAccessChange={props.onPlaygroundTerminalAccessChange}
                        onTogglePlanPanel={props.onTogglePlanPanel}
                        onCreateThread={handleCreateThread}
                        onToggleRightSidebar={handleToggleDetailsPanel}
                    />
                ) : null}
                <div className={cn(
                    'relative flex min-h-0 flex-1 flex-col transition-[justify-content] duration-300',
                    composerIsCentered && 'justify-center'
                )}>
                    {connectionRecovery.showBanner && connectionRecovery.issue ? (
                        <AssistantConnectionRecoveryBanner
                            issue={connectionRecovery.issue}
                            reconnectPending={connectionRecovery.reconnectPending}
                            reconnectAttempt={connectionRecovery.reconnectAttempt}
                            reconnectMaxAttempts={connectionRecovery.reconnectMaxAttempts}
                            reconnectExhausted={connectionRecovery.reconnectExhausted}
                            onReconnect={handleReconnectAssistant}
                        />
                    ) : null}
                    {!composerIsCentered ? (
                        <AssistantConversationTimelinePane
                            loading={controller.loading}
                            timelineContentRef={timelineContentRef}
                            timelineScrollRef={timelineScrollRef}
                            messages={controller.timelineMessages}
                            activities={controller.activityFeed}
                            proposedPlans={controller.activeThread?.proposedPlans || []}
                            sessionMode={selectedSessionMode}
                            latestProjectLabel={latestProjectLabel}
                            projectTitle={displayProjectPath || null}
                            assistantMessageFilePath={assistantMessageFilePath}
                            windowKey={`${controller.selectedSession?.id || 'no-session'}:${controller.activeThread?.id || 'no-thread'}`}
                            isWorking={isThreadWorking}
                            activeStatusLabel={activeStatusLabel}
                            isConnecting={isThreadConnecting}
                            activeWorkStartedAt={controller.activeThread?.latestTurn?.startedAt || null}
                            latestAssistantMessageId={controller.activeThread?.latestTurn?.assistantMessageId || null}
                            latestTurnStartedAt={controller.activeThread?.latestTurn?.startedAt || null}
                            turnUsageById={turnUsageById}
                            deletingMessageId={props.deletingMessageId}
                            loadingChats={isLoadingSelectedChat}
                            assistantTextStreamingMode={settings.assistantTextStreamingMode}
                            assistantToolOutputDefaultMode={settings.assistantToolOutputDefaultMode}
                            bottomComposerOverlayActive={bottomComposerOverlayActive}
                            showScrollToBottom={showScrollToBottom}
                            elevateScrollToBottom={bottomComposerOverlayActive}
                            onScrollTimeline={handleTimelineScrollEvent}
                            onScrollToBottom={handleScrollToBottomClick}
                            onRequestDeleteUserMessage={props.onRequestDeleteUserMessage}
                            onImplementProposedPlan={handleImplementProposedPlan}
                            onShowPlanPanel={undefined}
                            onOpenAttachmentPreview={props.onOpenAttachmentPreview}
                            onOpenAssistantLink={props.onOpenAssistantLink}
                            onOpenEditedFile={props.onOpenEditedFile}
                            onViewDiff={props.onViewDiff}
                        />
                    ) : null}
                    <AssistantConversationComposerPane
                        placement={composerIsCentered ? 'center' : 'bottom'}
                        newChatPrompt={composerIsCentered ? emptyComposerPrompt : null}
                        pendingPlaygroundLabRequest={null}
                        pendingUserInputs={effectivePendingUserInputs}
                        commandPending={!newChatHandoffActive && controller.commandPending}
                        composerDisabled={newChatHandoffActive}
                        sending={sendingComposerPrompt}
                        thinking={!newChatHandoffActive && (controller.commandPending || isThreadWorking)}
                        queuedMessageCount={queuedComposerMessageCount}
                        queuedMessages={queuedComposerMessageItems}
                        onForceQueuedMessage={handleForceQueuedMessage}
                        onDeleteQueuedMessage={handleDeleteQueuedMessage}
                        onMoveQueuedMessage={handleMoveQueuedMessage}
                        selectedSessionId={visibleComposerSessionId}
                        resetComposerStateToken={resetComposerStateToken}
                        selectedSessionMode={selectedSessionMode}
                        assistantAvailable={controller.available}
                        assistantConnected={controller.connected}
                        selectedProjectPath={displayProjectPath || null}
                        availableModels={availableModels}
                        activeModel={activeComposerModel}
                        modelsLoading={controller.modelsLoading}
                        latestTurnUsage={controller.activeThread?.latestTurn?.usage || null}
                        runtimeMode={controller.activeThread?.runtimeMode || 'approval-required'}
                        interactionMode={effectiveInteractionMode}
                        activeProfile={controller.activeThread?.runtimeMode === 'full-access' ? 'yolo-fast' : 'safe-dev'}
                        zyraProfile={activeZyraProfile}
                        onZyraProfileChange={setActiveZyraProfile}
                        activeStatusLabel={activeStatusLabel}
                        isConnecting={isThreadConnecting}
                        reconnectPending={connectionRecovery.reconnectPending}
                        onOverflowWheel={handleComposerOverflowWheel}
                        onStop={handleStopTurn}
                        onReconnect={handleReconnectAssistant}
                        onBlockedSend={(message) => props.onShowToast?.(message, 'info')}
                        onOpenAttachmentPreview={props.onOpenAttachmentPreview}
                        sendPrompt={newChatHandoffActive ? async () => false : handleSendPrompt}
                        refreshModels={handleRefreshModels}
                        respondUserInput={handleRespondUserInput}
                        setPlaygroundTerminalAccess={props.onPlaygroundTerminalAccessChange}
                        setPlaygroundTerminalAccessRequestMuted={props.onPlaygroundTerminalAccessRequestMutedChange}
                        approvePendingPlaygroundLabRequest={handleApprovePendingPlaygroundLabRequest}
                        declinePendingPlaygroundLabRequest={handleDeclinePendingPlaygroundLabRequest}
                    />
                </div>
            </div>
            {showPlaygroundRootOnboarding ? (
                <AssistantChatOnboardingOverlay
                    mode="playground-root"
                    busy={controller.commandPending}
                    onChoosePlaygroundRoot={props.onChoosePlaygroundRoot}
                />
            ) : null}
            {showWorkProjectOnboarding ? (
                <AssistantChatOnboardingOverlay
                    mode="work-project"
                    busy={controller.commandPending}
                    hasSession={Boolean(controller.selectedSession)}
                    onChooseProject={handleChooseProjectForWorkChat}
                    playgroundRootConfigured={!props.playgroundRootMissing}
                    onChoosePlaygroundRoot={props.onChoosePlaygroundRoot}
                    onStartDetachedPlaygroundChat={props.onStartDetachedPlaygroundChat}
                />
            ) : null}
            {showPlaygroundDetachedOnboarding ? (
                <AssistantChatOnboardingOverlay
                    mode="playground-chat"
                    busy={controller.commandPending}
                    onStartDetachedPlaygroundChat={props.onStartDetachedPlaygroundChat}
                />
            ) : null}
            <div className="pointer-events-none absolute inset-x-0 bottom-24 z-30 flex justify-center px-4">
                <div
                    className={cn(
                        'inline-flex items-center gap-2 rounded-full border border-white/10 bg-sparkle-card/95 px-3 py-2 text-[12px] font-medium text-sparkle-text-secondary shadow-[0_16px_40px_rgba(0,0,0,0.28)] backdrop-blur-xl transition-all duration-200',
                        implementationToastVisible ? 'translate-y-0 opacity-100' : 'translate-y-2 opacity-0'
                    )}
                >
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-300/80" />
                    <span>Moving to implementation. Switching from Plan to Chat.</span>
                </div>
            </div>
        </section>
    )
}
