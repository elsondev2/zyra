import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { AssistantActivity, AssistantMessage } from '@shared/assistant/contracts'
import { useAssistantStoreActions, useAssistantStoreSelector } from '@/lib/assistant/store'
import { getSelectedAssistantSession } from '@/lib/assistant/selectors'
import { ConnectedAssistantSessionsRail } from './AssistantConnectedSessionsRail'
import { AssistantConversationPane } from './AssistantConversationPane'
import { AssistantDiffPanel } from './AssistantDiffPanel'
import { resolveAssistantDiffTarget, type AssistantDiffTarget } from './assistant-diff-types'
import { AssistantTransientToast, DeleteHistoryConfirm, useAssistantTransientToast } from './AssistantPageHelpers'
import { useAssistantPageSidebarState } from './useAssistantPageSidebarState'

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

export default function AssistantPage() {
    const actions = useAssistantStoreActions()
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
    const {
        leftSidebarCollapsed,
        setLeftSidebarCollapsed,
        leftSidebarWidth,
        setLeftSidebarWidth,
        railMode,
        setRailMode,
        railGroupMode,
        setRailGroupMode,
        railSortMode,
        setRailSortMode,
        railFilterMode,
        setRailFilterMode
    } = useAssistantPageSidebarState()
    const [pendingMessageDelete, setPendingMessageDelete] = useState<AssistantMessage | null>(null)
    const [deletingMessageId, setDeletingMessageId] = useState<string | null>(null)
    const [selectedDiffTarget, setSelectedDiffTarget] = useState<AssistantDiffTarget | null>(null)
    const selectedDiffActivity = useAssistantStoreSelector<AssistantActivity | null>((state) => {
        if (!selectedDiffTarget) return null
        const selectedSession = getSelectedAssistantSession(state.snapshot)
        if (!selectedSession) return null
        for (const thread of selectedSession.threads) {
            const activity = thread.activities.find((entry) => entry.id === selectedDiffTarget.activityId)
            if (activity) return activity
        }
        return null
    })
    const selectedDiff = useMemo(
        () => selectedDiffTarget ? resolveAssistantDiffTarget(selectedDiffTarget, selectedDiffActivity) : null,
        [selectedDiffActivity, selectedDiffTarget]
    )
    const { toast, showToast } = useAssistantTransientToast()

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
    }, [shell.selectedSessionId])

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
    }, [shell.selectedSessionId])
    const handleCloseDiff = useCallback(() => setSelectedDiffTarget(null), [])
    const noop = useCallback(() => undefined, [])
    const sessionSidebarWidth = leftSidebarCollapsed ? 0 : Math.max(180, Math.min(520, Math.round(leftSidebarWidth)))

    return (
        <div className="flex h-[calc(100vh-34px)] min-h-[calc(100vh-34px)] flex-col overflow-hidden animate-fadeIn [--accent-primary:var(--color-primary)] [--accent-secondary:var(--color-secondary)]">
            <div className="min-h-0 flex-1 overflow-hidden">
                <div className="flex h-full">
                    <ConnectedAssistantSessionsRail
                        collapsed={leftSidebarCollapsed}
                        width={sessionSidebarWidth}
                        railMode={railMode}
                        railGroupMode={railGroupMode}
                        railSortMode={railSortMode}
                        railFilterMode={railFilterMode}
                        onRailModeChange={setRailMode}
                        onRailGroupModeChange={setRailGroupMode}
                        onRailSortModeChange={setRailSortMode}
                        onRailFilterModeChange={setRailFilterMode}
                        onWidthChange={setLeftSidebarWidth}
                        onShowToast={showToast}
                    />
                    <div className="flex min-w-0 flex-1">
                        <AssistantConversationPane
                            rightPanelOpen={false}
                            rightPanelMode="none"
                            deletingMessageId={deletingMessageId}
                            leftSidebarCollapsed={leftSidebarCollapsed}
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
                            onToggleRightSidebar={noop}
                            onTogglePlanPanel={noop}
                            onOpenAssistantLink={undefined}
                            onOpenAttachmentPreview={undefined}
                            onOpenEditedFile={undefined}
                            onViewDiff={handleViewDiff}
                            onShowToast={showToast}
                        />
                        <AssistantDiffPanel
                            open={Boolean(selectedDiff)}
                            selectedDiff={selectedDiff}
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
        </div>
    )
}
