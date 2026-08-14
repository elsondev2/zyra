import { memo, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAssistantSessionsRailStore } from '@/lib/assistant/store'
import { useSettings } from '@/lib/settings'
import type { AssistantToastInput } from './AssistantPageHelpers'
import { AssistantChatSessionsRail } from './AssistantChatSessionsRail'
import type {
    AssistantRailFilterMode,
    AssistantRailGroupMode,
    AssistantRailMode,
    AssistantRailSortMode
} from './useAssistantPageSidebarState'
import { isAssistantDraftSession } from './assistant-sessions-rail-utils'
import { buildAssistantChatRoute } from './assistant-chat-route'

export const ConnectedAssistantSessionsRail = memo(function ConnectedAssistantSessionsRail(props: {
    collapsed: boolean
    width: number
    maxWidth: number
    previewPinned: boolean
    railMode: AssistantRailMode
    railGroupMode: AssistantRailGroupMode
    railSortMode: AssistantRailSortMode
    railFilterMode: AssistantRailFilterMode
    onRailModeChange: (next: AssistantRailMode) => void
    onRailGroupModeChange: (next: AssistantRailGroupMode) => void
    onRailSortModeChange: (next: AssistantRailSortMode) => void
    onRailFilterModeChange: (next: AssistantRailFilterMode) => void
    onWidthChange: (next: number) => void
    onPreviewPinnedChange: (pinned: boolean) => void
    onShowToast: (input: AssistantToastInput) => void
}) {
    const { collapsed, width, maxWidth, previewPinned, onWidthChange, onPreviewPinnedChange, onShowToast } = props
    const railController = useAssistantSessionsRailStore()
    const navigate = useNavigate()
    const { settings } = useSettings()
    const creatingChatRef = useRef(false)
    const creatingProjectChatRef = useRef(false)
    const handleCreateChat = useCallback(async () => {
        if (creatingChatRef.current) return

        const activeSession = railController.snapshot.sessions.find((session) => session.id === railController.activeSessionId) || null
        if (activeSession && isAssistantDraftSession(activeSession)) return

        try {
            creatingChatRef.current = true
            await railController.createSession({ mode: 'work' })
        } finally {
            creatingChatRef.current = false
        }
    }, [railController])

    const handleSelectSession = useCallback((sessionId: string) => {
        const session = railController.snapshot.sessions.find((entry) => entry.id === sessionId) || null
        navigate(buildAssistantChatRoute(sessionId, session?.activeThreadId || null))
    }, [navigate, railController.snapshot.sessions])

    const handleSelectThread = useCallback((input: { sessionId: string; threadId: string }) => {
        navigate(buildAssistantChatRoute(input.sessionId, input.threadId))
    }, [navigate])

    const handleCreateProjectChat = useCallback(async (projectPath?: string) => {
        if (creatingProjectChatRef.current) return
        try {
            creatingProjectChatRef.current = true
            const trimmedProjectPath = String(projectPath || '').trim()
            if (trimmedProjectPath) {
                const result = await railController.createSessionResult({ mode: 'work', projectPath: trimmedProjectPath })
                if (!result?.success) {
                    onShowToast({ message: (result as any)?.error || 'Could not create chat in project.', tone: 'error' })
                }
                return
            }

            const result = await railController.createProjectSessionResult()
            if (!result?.success && !(result as any)?.cancelled) {
                onShowToast({ message: (result as any)?.error || 'Could not create project chat.', tone: 'error' })
            }
        } finally {
            creatingProjectChatRef.current = false
        }
    }, [onShowToast, railController])

    return (
        <AssistantChatSessionsRail
            collapsed={collapsed}
            width={width}
            maxWidth={maxWidth}
            previewPinned={previewPinned}
            agentInboxEnabled={settings.assistantAgentInboxSidebarEnabled}
            projectIconOverrides={settings.projectIconOverrides}
            sessions={railController.snapshot.sessions}
            activeSessionId={railController.activeSessionId}
            activeThreadId={railController.activeThreadId}
            commandPending={railController.commandPending}
            onCreateChat={handleCreateChat}
            onCreateProjectChat={handleCreateProjectChat}
            onSelectSession={handleSelectSession}
            onSelectThread={handleSelectThread}
            onRenameSession={railController.renameSession}
            onArchiveSession={railController.archiveSession}
            onDeleteSession={railController.deleteSessionResult}
            onWidthChange={onWidthChange}
            onPreviewPinnedChange={onPreviewPinnedChange}
            onShowToast={onShowToast}
        />
    )
})
