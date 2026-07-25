import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { AssistantActivity, AssistantMessage, AssistantTurnDetail, FleetSnapshot } from '@shared/assistant/contracts'
import { FilePreviewModal } from '@/components/ui/FilePreviewModal'
import type { PreviewOpenOptions } from '@/components/ui/file-preview/types'
import { useFilePreview } from '@/components/ui/file-preview/useFilePreview'
import { useAssistantStoreActions, useAssistantStoreSelector } from '@/lib/assistant/store'
import { getActiveAssistantThread, getSelectedAssistantSession } from '@/lib/assistant/selectors'
import { ConnectedAssistantSessionsRail } from './AssistantConnectedSessionsRail'
import { AssistantConversationPane } from './AssistantConversationPane'
import { AssistantDiffPanel, type AssistantDiffRevealRequest } from './AssistantDiffPanel'
import { buildAssistantDiffTurns } from './assistant-diff-turns'
import { resolveAssistantDiffTarget, type AssistantDiffTarget } from './assistant-diff-types'
import { openAssistantFileTarget } from './assistant-file-navigation'
import { resolveAssistantLeftSidebarWidth, resolveAssistantPaneLayout } from './assistant-pane-layout'
import { mergeAssistantReviewIndex } from './assistant-review-index'
import { AssistantTransientToast, DeleteHistoryConfirm, useAssistantTransientToast } from './AssistantPageHelpers'
import { useAssistantPageSidebarState } from './useAssistantPageSidebarState'
import { useAssistantReviewIndex } from './useAssistantReviewIndex'

type AssistantPageShellSelection = {
    bootstrapped: boolean
    commandPending: boolean
    selectedSessionId: string | null
    selectedSessionMode: 'work'
}

function areAssistantPageShellSelectionsEqual(left: AssistantPageShellSelection, right: AssistantPageShellSelection): boolean {
    return left.bootstrapped === right.bootstrapped
        && left.commandPending === right.commandPending
        && left.selectedSessionId === right.selectedSessionId
        && left.selectedSessionMode === right.selectedSessionMode
}

const EMPTY_ASSISTANT_MESSAGES: AssistantMessage[] = []
const EMPTY_ASSISTANT_ACTIVITIES: AssistantActivity[] = []

type AssistantDiffSourceSelection = {
    threadId: string | null
    messages: AssistantMessage[]
    activities: AssistantActivity[]
    projectRootPath: string | null
    activeTurnId: string | null
    fleetSnapshot: FleetSnapshot | null
}

function areAssistantDiffSourceSelectionsEqual(left: AssistantDiffSourceSelection, right: AssistantDiffSourceSelection): boolean {
    return left.threadId === right.threadId
        && left.messages === right.messages
        && left.activities === right.activities
        && left.projectRootPath === right.projectRootPath
        && left.activeTurnId === right.activeTurnId
        && left.fleetSnapshot === right.fleetSnapshot
}

export default function AssistantPage() {
    const actions = useAssistantStoreActions()
    const preview = useFilePreview()
    const shell = useAssistantStoreSelector<AssistantPageShellSelection>((state) => {
        const selectedSession = getSelectedAssistantSession(state.snapshot)

        return {
            bootstrapped: state.hydrated,
            commandPending: state.commandPending,
            selectedSessionId: selectedSession?.id || null,
            selectedSessionMode: 'work'
        }
    }, areAssistantPageShellSelectionsEqual)
    const autoRoutedSelectionRef = useRef<string | null>(null)
    const diffSessionIdRef = useRef<string | null>(shell.selectedSessionId)
    const diffRevealSequenceRef = useRef(1)
    const {
        leftSidebarCollapsed,
        setLeftSidebarCollapsed,
        leftSidebarWidth,
        setLeftSidebarWidth,
        bubblePreviewPinned,
        setBubblePreviewPinned,
        rightPanelMode,
        setRightPanelMode,
        rightSidebarWidth,
        setRightSidebarWidth,
        railMode,
        setRailMode,
        railGroupMode,
        setRailGroupMode,
        railSortMode,
        setRailSortMode,
        railFilterMode,
        setRailFilterMode
    } = useAssistantPageSidebarState(shell.selectedSessionId)
    const [pendingMessageDelete, setPendingMessageDelete] = useState<AssistantMessage | null>(null)
    const [deletingMessageId, setDeletingMessageId] = useState<string | null>(null)
    const [selectedDiffTarget, setSelectedDiffTarget] = useState<AssistantDiffTarget | null>(null)
    const [selectedDiffTurnId, setSelectedDiffTurnId] = useState<string | null>(null)
    const [diffRevealRequest, setDiffRevealRequest] = useState<AssistantDiffRevealRequest | null>(null)
    const [reviewTurnDetails, setReviewTurnDetails] = useState<Record<string, AssistantTurnDetail>>({})
    const [reviewTurnDetailErrors, setReviewTurnDetailErrors] = useState<Record<string, string>>({})
    const pendingReviewTurnIdsRef = useRef(new Set<string>())
    const [viewportWidth, setViewportWidth] = useState(() => window.innerWidth)
    const autoCollapsedLeftSidebarRef = useRef(false)
    const diffSource = useAssistantStoreSelector<AssistantDiffSourceSelection>((state) => {
        const selectedSession = getSelectedAssistantSession(state.snapshot)
        const activeThread = getActiveAssistantThread(selectedSession)
        const selectionTransitioning = Boolean(
            selectedSession
            && activeThread
            && state.selectionTransitionKey === `${selectedSession.id}:${activeThread.id}`
        )
        return {
            threadId: activeThread?.id || null,
            messages: selectionTransitioning ? EMPTY_ASSISTANT_MESSAGES : activeThread?.messages || EMPTY_ASSISTANT_MESSAGES,
            activities: selectionTransitioning ? EMPTY_ASSISTANT_ACTIVITIES : activeThread?.activities || EMPTY_ASSISTANT_ACTIVITIES,
            projectRootPath: selectedSession?.projectPath || activeThread?.cwd || null,
            activeTurnId: activeThread?.latestTurn?.state === 'running' ? activeThread.latestTurn.id : null,
            fleetSnapshot: activeThread ? state.snapshot.fleetByThreadId[activeThread.id] || null : null
        }
    }, areAssistantDiffSourceSelectionsEqual)
    const inspectorOpen = rightPanelMode === 'review'
    const { reviewIndex, reviewIndexLoading, reviewIndexError } = useAssistantReviewIndex({
        threadId: diffSource.threadId,
        enabled: inspectorOpen,
        refreshKey: `${diffSource.activeTurnId || 'idle'}:${diffSource.messages.length}:${diffSource.activities.length}`
    })
    const reviewDiffSource = useMemo(() => {
        const details = Object.values(reviewTurnDetails).filter((detail) => detail.threadId === diffSource.threadId)
        const mergeById = <T extends { id: string },>(loaded: T[], persisted: T[]) => {
            const byId = new Map(persisted.map((entry) => [entry.id, entry]))
            for (const entry of loaded) byId.set(entry.id, entry)
            return [...byId.values()]
        }
        return {
            ...diffSource,
            messages: mergeById(diffSource.messages, details.flatMap((detail) => detail.messages)),
            activities: mergeById(diffSource.activities, details.flatMap((detail) => detail.activities))
        }
    }, [diffSource, reviewTurnDetails])
    const detailedDiffTurns = useMemo(
        () => buildAssistantDiffTurns(reviewDiffSource),
        [reviewDiffSource]
    )
    const diffTurns = useMemo(
        () => mergeAssistantReviewIndex({
            index: reviewIndex,
            detailedTurns: detailedDiffTurns,
            projectRootPath: diffSource.projectRootPath
        }),
        [detailedDiffTurns, diffSource.projectRootPath, reviewIndex]
    )
    const selectedTargetActivity = selectedDiffTarget
        ? diffSource.activities.find((activity) => activity.id === selectedDiffTarget.activityId) || null
        : null
    const targetTurnId = selectedDiffTarget?.turnId
        || selectedTargetActivity?.turnId
        || (selectedTargetActivity ? `activity:${selectedTargetActivity.id}` : null)
    const effectiveDiffTurnId = selectedDiffTurnId && diffTurns.some((turn) => turn.id === selectedDiffTurnId)
        ? selectedDiffTurnId
        : targetTurnId && diffTurns.some((turn) => turn.id === targetTurnId)
            ? targetTurnId
            : diffTurns[0]?.id || null
    const selectedDiffTurn = diffTurns.find((turn) => turn.id === effectiveDiffTurnId) || null
    const targetBelongsToSelectedTurn = Boolean(
        selectedDiffTarget
        && selectedDiffTurn
        && (
            targetTurnId === selectedDiffTurn.id
            || selectedDiffTurn.files.some((file) => (
                file.target.activityId === selectedDiffTarget.activityId
                && file.target.filePath === selectedDiffTarget.filePath
            ))
        )
    )
    const refreshedSelectedTurnTarget = targetBelongsToSelectedTurn && selectedDiffTarget
        ? selectedDiffTurn?.changes.find((change) => (
            change.target.activityId === selectedDiffTarget.activityId
            && change.target.filePath === selectedDiffTarget.filePath
        ))?.target || null
        : null
    const effectiveDiffTarget = refreshedSelectedTurnTarget
        || (targetBelongsToSelectedTurn ? selectedDiffTarget : null)
        || selectedDiffTurn?.files[0]?.target
        || null
    const effectiveDiffActivity = effectiveDiffTarget
        ? reviewDiffSource.activities.find((activity) => activity.id === effectiveDiffTarget.activityId) || null
        : null
    const selectedDiff = useMemo(
        () => effectiveDiffTarget ? resolveAssistantDiffTarget(effectiveDiffTarget, effectiveDiffActivity) : null,
        [effectiveDiffActivity, effectiveDiffTarget]
    )
    const { toast, showToast } = useAssistantTransientToast()

    useEffect(() => {
        const handleResize = () => setViewportWidth(window.innerWidth)
        window.addEventListener('resize', handleResize)
        return () => window.removeEventListener('resize', handleResize)
    }, [])

    const paneLayout = resolveAssistantPaneLayout({
        viewportWidth,
        leftSidebarCollapsed,
        leftSidebarWidth,
        inspectorOpen,
        inspectorWidth: rightSidebarWidth
    })
    const pinnedBubbleHeaderInset = paneLayout.leftSidebarCollapsed && bubblePreviewPinned
        ? resolveAssistantLeftSidebarWidth(leftSidebarWidth, paneLayout.maxLeftSidebarWidth) + 8
        : 0

    useEffect(() => {
        const turnId = selectedDiffTurn?.detailLoaded === false ? selectedDiffTurn.id : null
        const threadId = diffSource.threadId
        if (!inspectorOpen || !threadId || !turnId || reviewTurnDetails[turnId] || pendingReviewTurnIdsRef.current.has(turnId)) return
        pendingReviewTurnIdsRef.current.add(turnId)
        setReviewTurnDetailErrors((current) => {
            if (!current[turnId]) return current
            const next = { ...current }
            delete next[turnId]
            return next
        })
        let cancelled = false
        void window.devscope.assistant.getTurnDetail({ threadId, turnId }).then((result) => {
            if (cancelled) return
            if (!result.success) {
                setReviewTurnDetailErrors((current) => ({ ...current, [turnId]: result.error || 'Failed to load turn details.' }))
                return
            }
            setReviewTurnDetails((current) => ({ ...current, [turnId]: result.detail }))
        }).catch((error) => {
            if (cancelled) return
            setReviewTurnDetailErrors((current) => ({
                ...current,
                [turnId]: error instanceof Error ? error.message : 'Failed to load turn details.'
            }))
        }).finally(() => pendingReviewTurnIdsRef.current.delete(turnId))
        return () => { cancelled = true }
    }, [diffSource.threadId, inspectorOpen, reviewTurnDetails, selectedDiffTurn])

    useEffect(() => {
        setReviewTurnDetails({})
        setReviewTurnDetailErrors({})
        pendingReviewTurnIdsRef.current.clear()
    }, [diffSource.threadId])

    useEffect(() => {
        if (paneLayout.autoCollapseLeftSidebar && !leftSidebarCollapsed) {
            autoCollapsedLeftSidebarRef.current = true
            setLeftSidebarCollapsed(true)
            return
        }
        if (!paneLayout.autoCollapseLeftSidebar && autoCollapsedLeftSidebarRef.current) {
            autoCollapsedLeftSidebarRef.current = false
            setLeftSidebarCollapsed(false)
        }
    }, [leftSidebarCollapsed, paneLayout.autoCollapseLeftSidebar, setLeftSidebarCollapsed])

    useEffect(() => {
        const sessionId = shell.selectedSessionId
        if (!sessionId) {
            autoRoutedSelectionRef.current = null
            return
        }

        const selectionKey = `${sessionId}:${shell.selectedSessionMode}`
        if (autoRoutedSelectionRef.current === selectionKey) return
        autoRoutedSelectionRef.current = selectionKey

        if (railMode !== shell.selectedSessionMode) {
            setRailMode(shell.selectedSessionMode)
        }
    }, [railMode, setRailMode, shell.selectedSessionId, shell.selectedSessionMode])

    useEffect(() => {
        if (diffSessionIdRef.current === shell.selectedSessionId) return
        diffSessionIdRef.current = shell.selectedSessionId
        setSelectedDiffTarget(null)
        setSelectedDiffTurnId(null)
        setDiffRevealRequest(null)
        setRightPanelMode('none')
    }, [setRightPanelMode, shell.selectedSessionId])

    const handleStartDetachedPlaygroundChat = useCallback(async () => {
        setRailMode('work')
        await actions.createSession({ mode: 'work' })
    }, [actions, setRailMode])

    const handlePlaygroundTerminalAccessChange = useCallback((enabled: boolean) => {
        void enabled
    }, [])

    const handlePlaygroundTerminalAccessRequestMutedChange = useCallback((muted: boolean) => {
        void muted
    }, [])

    const handleChoosePlaygroundRoot = useCallback(async () => {
        const folderResult = await window.devscope.selectFolder()
        if (!folderResult.success || folderResult.cancelled || !folderResult.folderPath) return
        setRailMode('work')
        await actions.setPlaygroundRoot(folderResult.folderPath)
    }, [actions, setRailMode])

    const openAssistantTarget = useCallback(async (target: string, startInEditMode = false, notifyFailure = true) => {
        const opened = await openAssistantFileTarget({
            target,
            projectPath: diffSource.projectRootPath,
            openPreview: preview.openPreview,
            previewOptions: startInEditMode ? { startInEditMode: true } : undefined
        })
        if (!opened && notifyFailure) showToast('Could not open that file.', 'error')
        return opened
    }, [diffSource.projectRootPath, preview.openPreview, showToast])

    const handleOpenAssistantInternalLink = useCallback(async (href: string) => {
        return openAssistantTarget(href, false, false)
    }, [openAssistantTarget])

    const handleOpenEditedFile = useCallback(async (filePath: string) => {
        await openAssistantTarget(filePath, true)
    }, [openAssistantTarget])

    const handleOpenAttachmentPreview = useCallback(async (
        file: { name: string; path: string },
        ext: string,
        options?: PreviewOpenOptions
    ) => {
        await preview.openPreview(file, ext, options)
    }, [preview.openPreview])

    const handleDeleteUserMessage = useCallback(async () => {
        if (!pendingMessageDelete) return
        try {
            setDeletingMessageId(pendingMessageDelete.id)
            const result = await actions.deleteMessageResult(pendingMessageDelete.id, shell.selectedSessionId || undefined)
            if (!result.success) {
                showToast(`Failed to delete message: ${result.error}`, 'error')
                return
            }
            setPendingMessageDelete(null)
            showToast('Deleted message')
        } finally {
            setDeletingMessageId(null)
        }
    }, [actions, pendingMessageDelete, shell.selectedSessionId, showToast])

    const handleToggleAssistantLeftSidebar = useCallback(() => {
        setLeftSidebarCollapsed((current) => !current)
    }, [setLeftSidebarCollapsed])

    useEffect(() => {
        window.addEventListener('zyra:toggle-assistant-sidebar', handleToggleAssistantLeftSidebar)
        return () => window.removeEventListener('zyra:toggle-assistant-sidebar', handleToggleAssistantLeftSidebar)
    }, [handleToggleAssistantLeftSidebar])

    useEffect(() => {
        window.dispatchEvent(new CustomEvent('zyra:assistant-sidebar-state', {
            detail: { collapsed: leftSidebarCollapsed }
        }))
    }, [leftSidebarCollapsed])

    const handleCancelPendingMessageDelete = useCallback(() => {
        if (deletingMessageId) return
        setPendingMessageDelete(null)
    }, [deletingMessageId])

    const handleViewDiff = useCallback((target: AssistantDiffTarget) => {
        diffSessionIdRef.current = shell.selectedSessionId
        setSelectedDiffTarget(target)
        const activity = diffSource.activities.find((entry) => entry.id === target.activityId)
        const turnId = target.turnId || activity?.turnId || (activity ? `activity:${activity.id}` : null)
        setSelectedDiffTurnId(turnId)
        setDiffRevealRequest(turnId ? { id: diffRevealSequenceRef.current++, turnId } : null)
        setRightPanelMode('review')
    }, [diffSource.activities, setRightPanelMode, shell.selectedSessionId])
    const handleSelectDiffTurn = useCallback((turnId: string) => {
        setDiffRevealRequest(null)
        setSelectedDiffTurnId(turnId)
        const turn = diffTurns.find((entry) => entry.id === turnId)
        setSelectedDiffTarget(turn?.files[0]?.target || null)
    }, [diffTurns])
    const handleSelectInspectorDiff = useCallback((target: AssistantDiffTarget) => {
        const activity = diffSource.activities.find((entry) => entry.id === target.activityId)
        setSelectedDiffTurnId(target.turnId || activity?.turnId || (activity ? `activity:${activity.id}` : null))
        setSelectedDiffTarget(target)
    }, [diffSource.activities])
    const handleDiffRevealRequestHandled = useCallback((requestId: number) => {
        setDiffRevealRequest((current) => current?.id === requestId ? null : current)
    }, [])
    const handleToggleInspector = useCallback(() => {
        if (rightPanelMode === 'review') {
            setRightPanelMode('none')
            return
        }
        setSelectedDiffTarget(null)
        setSelectedDiffTurnId(null)
        setDiffRevealRequest(null)
        setRightPanelMode('review')
    }, [rightPanelMode, setRightPanelMode])
    const handleCloseDiff = useCallback(() => {
        setSelectedDiffTarget(null)
        setSelectedDiffTurnId(null)
        setDiffRevealRequest(null)
        setRightPanelMode('none')
    }, [setRightPanelMode])
    const noop = useCallback(() => undefined, [])

    return (
        <div className="flex h-[calc(100vh-34px)] min-h-[calc(100vh-34px)] flex-col overflow-hidden animate-fadeIn [--accent-primary:var(--color-primary)] [--accent-secondary:var(--color-secondary)]">
            <div className="min-h-0 flex-1 overflow-hidden">
                <div className="flex h-full min-w-0 overflow-x-hidden">
                    <ConnectedAssistantSessionsRail
                        collapsed={paneLayout.leftSidebarCollapsed}
                        width={leftSidebarWidth}
                        maxWidth={paneLayout.maxLeftSidebarWidth}
                        previewPinned={bubblePreviewPinned}
                        railMode={railMode}
                        railGroupMode={railGroupMode}
                        railSortMode={railSortMode}
                        railFilterMode={railFilterMode}
                        onRailModeChange={setRailMode}
                        onRailGroupModeChange={setRailGroupMode}
                        onRailSortModeChange={setRailSortMode}
                        onRailFilterModeChange={setRailFilterMode}
                        onWidthChange={setLeftSidebarWidth}
                        onPreviewPinnedChange={setBubblePreviewPinned}
                        onShowToast={showToast}
                    />
                    <div className="flex min-w-0 flex-1">
                        <AssistantConversationPane
                            rightPanelOpen={inspectorOpen}
                            rightPanelMode={rightPanelMode}
                            showRightSidebarToggle
                            deletingMessageId={deletingMessageId}
                            leftSidebarCollapsed={paneLayout.leftSidebarCollapsed}
                            pinnedBubbleHeaderInset={pinnedBubbleHeaderInset}
                            fallbackSessionMode={railMode}
                            playgroundRootMissing={false}
                            playgroundTerminalAccess={false}
                            playgroundTerminalAccessRequestMuted={false}
                            autoStartDetachedPlaygroundChat={false}
                            onPlaygroundTerminalAccessChange={handlePlaygroundTerminalAccessChange}
                            onPlaygroundTerminalAccessRequestMutedChange={handlePlaygroundTerminalAccessRequestMutedChange}
                            onToggleLeftSidebar={handleToggleAssistantLeftSidebar}
                            onChoosePlaygroundRoot={handleChoosePlaygroundRoot}
                            onStartDetachedPlaygroundChat={handleStartDetachedPlaygroundChat}
                            onRequestDeleteUserMessage={setPendingMessageDelete}
                            onToggleRightSidebar={handleToggleInspector}
                            onTogglePlanPanel={noop}
                            onOpenAssistantLink={handleOpenAssistantInternalLink}
                            onOpenAttachmentPreview={handleOpenAttachmentPreview}
                            onOpenEditedFile={handleOpenEditedFile}
                            onViewDiff={handleViewDiff}
                            onShowToast={showToast}
                        />
                        <AssistantDiffPanel
                            open={inspectorOpen}
                            sessionId={shell.selectedSessionId}
                            threadId={diffSource.threadId}
                            width={paneLayout.inspectorWidth}
                            maxWidth={paneLayout.maxInspectorWidth}
                            turns={diffTurns}
                            reviewIndexReady={Boolean(reviewIndex)}
                            reviewIndexLoading={reviewIndexLoading && !reviewIndex}
                            reviewIndexError={reviewIndexError}
                            turnDetailError={effectiveDiffTurnId ? reviewTurnDetailErrors[effectiveDiffTurnId] || null : null}
                            activeTurnId={diffSource.activeTurnId}
                            revealRequest={diffRevealRequest}
                            selectedTurnId={effectiveDiffTurnId}
                            selectedDiff={selectedDiff}
                            projectPath={diffSource.projectRootPath}
                            fleetSnapshot={diffSource.fleetSnapshot}
                            onOpenPreview={preview.openPreview}
                            onOpenPreviewInNewTab={preview.openPreviewInNewTab}
                            onWidthChange={setRightSidebarWidth}
                            onSelectTurn={handleSelectDiffTurn}
                            onSelectDiff={handleSelectInspectorDiff}
                            onRevealRequestHandled={handleDiffRevealRequestHandled}
                            onClose={handleCloseDiff}
                        />
                    </div>
                </div>
            </div>
            <DeleteHistoryConfirm
                isOpen={Boolean(pendingMessageDelete)}
                deleting={Boolean(deletingMessageId)}
                onConfirm={() => void handleDeleteUserMessage()}
                onCancel={handleCancelPendingMessageDelete}
            />
            <AssistantTransientToast toast={toast} />
            {preview.previewFile ? (
                <FilePreviewModal
                    file={preview.previewFile}
                    previewTabs={preview.previewTabs}
                    activePreviewTabId={preview.activePreviewTabId}
                    content={preview.previewContent}
                    loading={preview.loadingPreview}
                    truncated={preview.previewTruncated}
                    size={preview.previewSize}
                    previewBytes={preview.previewBytes}
                    modifiedAt={preview.previewModifiedAt}
                    projectPath={diffSource.projectRootPath || undefined}
                    disableFullscreen
                    mediaItems={preview.previewMediaItems}
                    onOpenLinkedPreview={preview.openPreview}
                    onOpenLinkedPreviewInNewTab={preview.openPreviewInNewTab}
                    onSelectPreviewTab={preview.setActivePreviewTab}
                    onClosePreviewTab={preview.closePreviewTab}
                    onReorderPreviewTabs={preview.reorderPreviewTabs}
                    onShowToast={showToast}
                    onClose={preview.closePreview}
                />
            ) : null}
        </div>
    )
}
