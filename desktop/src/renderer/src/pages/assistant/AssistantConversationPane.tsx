import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { AssistantApprovalDecision, AssistantProposedPlan, AssistantSession, AssistantSessionTurnUsageEntry } from '@shared/assistant/contracts'
import { isAssistantSessionProjectLocked } from '@shared/assistant/session-project'
import { useSettings } from '@/lib/settings'
import { useAssistantConversationStore, useAssistantStoreActions, useAssistantStoreSelector } from '@/lib/assistant/store'
import { hasAssistantPersistedThreadContent, shouldShowAssistantThreadHistoryLoader } from '@/lib/assistant/assistant-history-state'
import { isAssistantThreadActivelyWorking } from '@/lib/assistant/selectors'
import { cn } from '@/lib/utils'
import { buildPromptImageInputs, buildPromptWithContextFiles } from './assistant-composer-utils'
import { clearAssistantComposerSessionState } from './assistant-composer-session-state'
import { AssistantChatOnboardingOverlay } from './AssistantChatOnboardingOverlay'
import { AssistantConnectionRecoveryBanner } from './AssistantConnectionRecoveryBanner'
import { AssistantConversationHeader } from './AssistantConversationHeader'
import { AssistantConversationComposerPane } from './AssistantConversationComposerPane'
import { AssistantConversationTimelinePane } from './AssistantConversationTimelinePane'
import type { AssistantConversationPaneProps } from './AssistantConversationPane.types'
import { RenameSessionModal, SessionDeleteModal } from './AssistantSessionsRailDialogs'
import type { AssistantComposerSendOptions, AssistantElementBounds, ComposerContextFile } from './assistant-composer-types'
import { getAssistantLinkBaseFilePath } from './assistant-file-navigation'
import {
    ASSISTANT_COMPOSER_OVERLAY_TOP_PADDING_PX,
    resolveAssistantComposerInsetEnd,
    resolveAssistantStableComposerInsetEnd
} from './assistant-pane-layout'
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
    const composerPaneRef = useRef<HTMLDivElement | null>(null)
    const [activeZyraProfile, setActiveZyraProfile] = useState<ZyraActiveProfile>(() => readStoredZyraProfile())
    const [showScrollToBottom, setShowScrollToBottom] = useState(false)
    const [interactionModeOverride, setInteractionModeOverride] = useState<'default' | null>(null)
    const [implementationToastVisible, setImplementationToastVisible] = useState(false)
    const [newChatHandoffRevision, setNewChatHandoffRevision] = useState(0)
    const [composerInsetEnd, setComposerInsetEnd] = useState(0)
    const [attachmentShelfTop, setAttachmentShelfTop] = useState<number | null>(null)
    const [renameTarget, setRenameTarget] = useState<AssistantSession | null>(null)
    const [renameDraft, setRenameDraft] = useState('')
    const [sessionToDelete, setSessionToDelete] = useState<AssistantSession | null>(null)
    const [headerActionPending, setHeaderActionPending] = useState<'rename' | 'project' | 'archive' | 'delete' | null>(null)
    const composerInsetEndRef = useRef(0)
    const composerInsetTargetRef = useRef(0)
    const composerInsetFrameRef = useRef<number | null>(null)
    const composerInsetLastFrameAtRef = useRef(0)
    const showScrollToBottomRef = useRef(false)
    const scrollButtonRafRef = useRef<number | null>(null)
    const newChatHandoffUntilRef = useRef(0)
    const prefetchedHistoryThreadIdsRef = useRef(new Set<string>())

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

    useEffect(() => {
        const threadId = controller.activeThread?.id || null
        if (
            !settings.assistantHistoryPrefetch
            || !threadId
            || !controller.history?.pageInfo.hasOlder
            || controller.history.loadingOlder
            || prefetchedHistoryThreadIdsRef.current.has(threadId)
        ) return

        prefetchedHistoryThreadIdsRef.current.add(threadId)
        void actions.loadOlderHistory(threadId)
    }, [actions, controller.activeThread?.id, controller.history?.loadingOlder, controller.history?.pageInfo.hasOlder, settings.assistantHistoryPrefetch])
    const shouldShowWorkingIndicator = isThreadWorking
        && !controller.timelineMessages.some((message) => message.role === 'assistant' && message.streaming)
    const lastTimelineMessage = controller.timelineMessages[controller.timelineMessages.length - 1] || null
    const latestTimelineActivity = controller.activityFeed[0] || null
    const selectedThreadHasHistoricalContent = hasAssistantPersistedThreadContent(controller.activeThread)
    const projectDirectoryLocked = isAssistantSessionProjectLocked(controller.selectedSession)
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
        && shouldShowAssistantThreadHistoryLoader({
            selectionHydrating: controller.selectionHydrating,
            snapshotLoading: controller.loading,
            historyLoaded: Boolean(controller.history),
            historyLoadFailed: Boolean(controller.commandError),
            hasPersistedContent: selectedThreadHasHistoricalContent
        })
    )
    const showPlaygroundRootOnboarding = false
    const showWorkProjectOnboarding = false
    const showPlaygroundDetachedOnboarding = false
    const showChatOnboardingOverlay = showPlaygroundRootOnboarding || showWorkProjectOnboarding || showPlaygroundDetachedOnboarding
    const gitRefreshToken = `${controller.selectedSession?.id || 'no-session'}:${controller.activeThread?.id || 'no-thread'}:${controller.activeThread?.latestTurn?.completedAt || controller.activeThread?.lastSeenCompletedTurnId || 'idle'}`
    const connectionBelongsToSelectedChat = Boolean(activeComposerSessionId) && isThreadConnecting && !selectedSessionUsesNewChatSurface
    const effectivePendingApprovals = newChatHandoffActive
        ? []
        : controller.activeThread?.pendingApprovals.filter((approval) => approval.status === 'pending') || []
    const effectivePendingUserInputs = newChatHandoffActive ? [] : controller.pendingUserInputs
    const hasConversationContent = !newChatHandoffActive && Boolean(
        selectedThreadHasHistoricalContent
        || controller.timelineMessages.length > 0
        || controller.activityFeed.length > 0
        || (controller.activeThread?.proposedPlans.length || 0) > 0
        || (!selectedSessionUsesNewChatSurface && isThreadWorking)
        || connectionBelongsToSelectedChat
        || isLoadingSelectedChat
        || effectivePendingApprovals.length > 0
    )
    const centerComposer = Boolean(
        !showChatOnboardingOverlay
        && !hasConversationContent
        && !controller.selectedSession?.pendingLabRequest
        && effectivePendingApprovals.length === 0
        && effectivePendingUserInputs.length === 0
    )
    const composerIsCentered = newChatHandoffActive || centerComposer
    const bottomComposerOverlayActive = !composerIsCentered
    const effectiveComposerInsetEnd = resolveAssistantStableComposerInsetEnd(
        composerInsetEnd,
        bottomComposerOverlayActive
    )
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

    const updateComposerInsetEnd = useCallback((nextInsetEnd: number, immediate = false) => {
        const target = Math.max(0, nextInsetEnd)
        const current = composerInsetEndRef.current
        const startsFromEmpty = current === 0 && composerInsetTargetRef.current === 0
        composerInsetTargetRef.current = target

        const commit = (value: number) => {
            composerInsetEndRef.current = value
            setComposerInsetEnd(value)
        }
        const shouldReduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
        if (immediate || startsFromEmpty || shouldReduceMotion || Math.abs(target - current) < 0.35) {
            if (composerInsetFrameRef.current !== null) window.cancelAnimationFrame(composerInsetFrameRef.current)
            composerInsetFrameRef.current = null
            commit(target)
            return
        }
        if (composerInsetFrameRef.current !== null) return

        composerInsetLastFrameAtRef.current = window.performance.now()
        const animate = (now: number) => {
            composerInsetFrameRef.current = null
            const elapsed = Math.max(1, Math.min(40, now - composerInsetLastFrameAtRef.current))
            composerInsetLastFrameAtRef.current = now
            const frameTarget = composerInsetTargetRef.current
            const frameCurrent = composerInsetEndRef.current
            const blend = 1 - Math.exp(-elapsed / 68)
            const next = frameCurrent + (frameTarget - frameCurrent) * blend

            if (Math.abs(frameTarget - next) < 0.35) {
                commit(frameTarget)
                return
            }

            commit(Math.round(next * 10) / 10)
            composerInsetFrameRef.current = window.requestAnimationFrame(animate)
        }
        composerInsetFrameRef.current = window.requestAnimationFrame(animate)
    }, [])

    const handleAttachmentShelfBoundsChange = useCallback((bounds: AssistantElementBounds | null) => {
        const nextTop = bounds ? Math.floor(bounds.top) : null
        setAttachmentShelfTop((current) => current === nextTop ? current : nextTop)
    }, [])

    useLayoutEffect(() => {
        const element = composerPaneRef.current
        if (!bottomComposerOverlayActive) {
            updateComposerInsetEnd(0, true)
            return
        }
        if (!element) return
        const measure = () => {
            const paneRect = element.getBoundingClientRect()
            const insetEnd = resolveAssistantComposerInsetEnd({
                paneTop: paneRect.top,
                paneBottom: paneRect.bottom,
                attachmentShelfTop,
                contentTopInset: ASSISTANT_COMPOSER_OVERLAY_TOP_PADDING_PX
            })
            updateComposerInsetEnd(insetEnd)
        }
        measure()
        const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null
        observer?.observe(element)
        return () => observer?.disconnect()
    }, [attachmentShelfTop, bottomComposerOverlayActive, effectivePendingUserInputs.length, updateComposerInsetEnd])

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
            if (composerInsetFrameRef.current !== null) {
                window.cancelAnimationFrame(composerInsetFrameRef.current)
            }
        }
    }, [])

    useEffect(() => {
        if (controller.activeThread?.interactionMode === 'default') {
            setInteractionModeOverride(null)
        }
    }, [controller.activeThread?.interactionMode, controller.activeThread?.id])

    useEffect(() => {
        setInteractionModeOverride(null)
        setImplementationToastVisible(false)
        setRenameTarget(null)
        setRenameDraft('')
        setSessionToDelete(null)
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

    const handleRespondApproval = useCallback(async (requestId: string, decision: AssistantApprovalDecision) => {
        await actions.respondApproval(requestId, decision)
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
        const images = buildPromptImageInputs(contextFiles)
        const result = await actions.sendPromptResult(buildPromptWithContextFiles(prompt, contextFiles), {
            sessionId,
            model: options.model,
            runtimeMode: options.runtimeMode,
            interactionMode: options.interactionMode,
            effort: options.effort,
            serviceTier: options.serviceTier,
            profile: activeZyraProfile,
            images: images.length > 0 ? images : undefined
        })
        if (!result.success && images.length > 0) {
            props.onShowToast?.(`Could not send image: ${result.error}`, 'error')
        }
        return result.success
    }, [actions, activeZyraProfile, props.onShowToast])
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
    }, [actions, controller.selectedSession?.id])

    const handleOpenRenameChat = useCallback(() => {
        const session = controller.selectedSession
        if (!session || headerActionPending) return
        setRenameTarget(session)
        setRenameDraft(getSessionDisplayTitle(session))
    }, [controller.selectedSession, headerActionPending])

    const handleCloseRenameChat = useCallback(() => {
        if (headerActionPending === 'rename') return
        setRenameTarget(null)
        setRenameDraft('')
    }, [headerActionPending])

    const handleSubmitRenameChat = useCallback(async () => {
        if (!renameTarget || headerActionPending) return
        const title = renameDraft.replace(/\s+/g, ' ').trim().slice(0, 60)
        if (!title) return
        if (title === getSessionDisplayTitle(renameTarget)) {
            handleCloseRenameChat()
            return
        }

        setHeaderActionPending('rename')
        try {
            const result = await actions.renameSessionResult(renameTarget.id, title)
            if (!result.success) {
                props.onShowToast?.(`Could not rename chat: ${result.error}`, 'error')
                return
            }
            setRenameTarget(null)
            setRenameDraft('')
            props.onShowToast?.('Chat renamed', 'success')
        } finally {
            setHeaderActionPending(null)
        }
    }, [actions, handleCloseRenameChat, headerActionPending, props.onShowToast, renameDraft, renameTarget])

    const handleChooseHeaderProject = useCallback(async () => {
        const session = controller.selectedSession
        if (!session || projectDirectoryLocked || headerActionPending) return
        setHeaderActionPending('project')
        try {
            const result = await actions.chooseProjectPathResult(session.id)
            if (!result.success) {
                props.onShowToast?.(`Could not update project: ${result.error}`, 'error')
                return
            }
            if ('cancelled' in result && result.cancelled) return
            props.onShowToast?.(session.projectPath ? 'Project changed' : 'Project attached', 'success')
        } finally {
            setHeaderActionPending(null)
        }
    }, [actions, controller.selectedSession, headerActionPending, projectDirectoryLocked, props.onShowToast])

    const handleArchiveChat = useCallback(async () => {
        const session = controller.selectedSession
        if (!session || headerActionPending) return
        setHeaderActionPending('archive')
        try {
            const result = await actions.archiveSessionResult(session.id, true)
            if (!result.success) {
                props.onShowToast?.(`Could not archive chat: ${result.error}`, 'error')
                return
            }
            props.onShowToast?.('Chat archived', 'success')
        } finally {
            setHeaderActionPending(null)
        }
    }, [actions, controller.selectedSession, headerActionPending, props.onShowToast])

    const handleOpenDeleteChat = useCallback(() => {
        const session = controller.selectedSession
        if (!session || headerActionPending) return
        setSessionToDelete(session)
    }, [controller.selectedSession, headerActionPending])

    const handleCancelDeleteChat = useCallback(() => {
        if (headerActionPending === 'delete') return
        setSessionToDelete(null)
    }, [headerActionPending])

    const handleConfirmDeleteChat = useCallback(async () => {
        if (!sessionToDelete || headerActionPending) return
        setHeaderActionPending('delete')
        try {
            const result = await actions.deleteSessionResult(sessionToDelete.id)
            if (!result.success) {
                props.onShowToast?.(`Could not delete chat: ${result.error}`, 'error')
                return
            }
            setSessionToDelete(null)
            props.onShowToast?.('Chat deleted', 'success')
        } finally {
            setHeaderActionPending(null)
        }
    }, [actions, headerActionPending, props.onShowToast, sessionToDelete])

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
    }, [props.onToggleRightSidebar])

    const effectiveInteractionMode = interactionModeOverride || controller.activeThread?.interactionMode || 'default'

    return (
        <section className="assistant-conversation-pane relative flex min-w-0 flex-1 flex-col overflow-x-hidden">
            <div className={cn(
                'flex min-h-0 flex-1 flex-col transition-[filter,opacity] duration-200',
                showChatOnboardingOverlay && 'pointer-events-none select-none blur-[2px] opacity-55'
            )}>
                {!composerIsCentered ? (
                    <AssistantConversationHeader
                        rightPanelOpen={props.rightPanelOpen}
                        rightPanelMode={props.rightPanelMode}
                        showRightSidebarToggle={props.showRightSidebarToggle}
                        planPanelAvailable={planPanelAvailable}
                        planProgressLabel={planProgressLabel}
                        planIsComplete={planIsComplete}
                        leftSidebarCollapsed={props.leftSidebarCollapsed}
                        pinnedBubbleHeaderInset={props.pinnedBubbleHeaderInset}
                        latestProjectLabel={latestProjectLabel}
                        selectedSessionTitle={selectedSessionTitle}
                        canonicalThreadId={controller.activeThread?.providerThreadId || controller.activeThread?.id || null}
                        canonicalPresence={settings.assistantShowStatusDetails || settings.assistantShowDiagnostics ? controller.activeThread?.canonicalPresence : null}
                        showPresenceBadge={settings.assistantShowStatusDetails}
                        showDiagnostics={settings.assistantShowDiagnostics}
                        selectedSessionMode={selectedSessionMode}
                        zyraProfile={activeZyraProfile}
                        activeThreadIsSubagent={activeThreadIsSubagent}
                        activeThreadLabel={activeThreadLabel}
                        selectedProjectTooltip={selectedProjectTooltip}
                        selectedProjectPath={displayProjectPath || null}
                        projectDirectoryLocked={projectDirectoryLocked}
                        preferredShell={settings.defaultShell}
                        gitRefreshToken={gitRefreshToken}
                        showPlaygroundTerminalAccessControl={false}
                        playgroundTerminalAccess={props.playgroundTerminalAccess}
                        actionsDisabled={Boolean(headerActionPending) || controller.commandPending}
                        onToggleLeftSidebar={props.onToggleLeftSidebar}
                        onPlaygroundTerminalAccessChange={props.onPlaygroundTerminalAccessChange}
                        onTogglePlanPanel={props.onTogglePlanPanel}
                        onCreateThread={handleCreateThread}
                        onRenameChat={handleOpenRenameChat}
                        onChooseProject={handleChooseHeaderProject}
                        onArchiveChat={handleArchiveChat}
                        onDeleteChat={handleOpenDeleteChat}
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
                            contentInsetEndAdjustment={effectiveComposerInsetEnd}
                            hasOlder={controller.history?.pageInfo.hasOlder || false}
                            loadingOlder={controller.history?.loadingOlder || false}
                            loadOlderError={controller.history?.loadOlderError || null}
                            onLoadOlder={() => actions.loadOlderHistory(controller.activeThread?.id)}
                            showScrollToBottom={showScrollToBottom}
                            elevateScrollToBottom={bottomComposerOverlayActive}
                            onScrollTimeline={handleTimelineScrollEvent}
                            onScrollToBottom={handleScrollToBottomClick}
                            onRequestDeleteUserMessage={props.onRequestDeleteUserMessage}
                            onImplementProposedPlan={handleImplementProposedPlan}
                            onShowPlanPanel={undefined}
                            onOpenAttachmentPreview={props.onOpenAttachmentPreview}
                            onOpenAssistantLink={props.onOpenAssistantLink}
                            onLinkNotice={props.onShowToast}
                            onOpenEditedFile={props.onOpenEditedFile}
                            onViewDiff={props.onViewDiff}
                        />
                    ) : null}
                    <AssistantConversationComposerPane
                        paneRef={composerPaneRef}
                        placement={composerIsCentered ? 'center' : 'bottom'}
                        newChatPrompt={composerIsCentered ? emptyComposerPrompt : null}
                        pendingPlaygroundLabRequest={null}
                        pendingApprovals={effectivePendingApprovals}
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
                        onAttachmentShelfBoundsChange={handleAttachmentShelfBoundsChange}
                        sendPrompt={newChatHandoffActive ? async () => false : handleSendPrompt}
                        refreshModels={handleRefreshModels}
                        respondApproval={handleRespondApproval}
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
            <RenameSessionModal
                renameTarget={renameTarget}
                renameDraft={renameDraft}
                saving={headerActionPending === 'rename'}
                onChangeDraft={setRenameDraft}
                onClose={handleCloseRenameChat}
                onSubmit={() => void handleSubmitRenameChat()}
            />
            <SessionDeleteModal
                sessionToDelete={sessionToDelete}
                deleting={headerActionPending === 'delete'}
                onConfirm={() => void handleConfirmDeleteChat()}
                onCancel={handleCancelDeleteChat}
            />
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
