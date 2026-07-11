import { memo, useCallback, useRef } from 'react'
import { useAssistantSessionsRailStore } from '@/lib/assistant/store'
import type { AssistantToastInput } from './AssistantPageHelpers'
import { AssistantChatSessionsRail } from './AssistantChatSessionsRail'
import type {
    AssistantRailFilterMode,
    AssistantRailGroupMode,
    AssistantRailMode,
    AssistantRailSortMode
} from './useAssistantPageSidebarState'
import { isAssistantDraftSession } from './assistant-sessions-rail-utils'

export const ConnectedAssistantSessionsRail = memo(function ConnectedAssistantSessionsRail(props: {
    collapsed: boolean
    width: number
    railMode: AssistantRailMode
    railGroupMode: AssistantRailGroupMode
    railSortMode: AssistantRailSortMode
    railFilterMode: AssistantRailFilterMode
    onRailModeChange: (next: AssistantRailMode) => void
    onRailGroupModeChange: (next: AssistantRailGroupMode) => void
    onRailSortModeChange: (next: AssistantRailSortMode) => void
    onRailFilterModeChange: (next: AssistantRailFilterMode) => void
    onWidthChange: (next: number) => void
    onShowToast: (input: AssistantToastInput) => void
}) {
    const { collapsed, width, onWidthChange, onShowToast } = props
    const railController = useAssistantSessionsRailStore()
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
            sessions={railController.snapshot.sessions}
            activeSessionId={railController.activeSessionId}
            activeThreadId={railController.activeThreadId}
            commandPending={railController.commandPending}
            onCreateChat={handleCreateChat}
            onCreateProjectChat={handleCreateProjectChat}
            onSelectSession={railController.selectSession}
            onSelectThread={railController.selectThread}
            onRenameSession={railController.renameSession}
            onArchiveSession={railController.archiveSession}
            onDeleteSession={railController.deleteSessionResult}
            onWidthChange={onWidthChange}
            onShowToast={onShowToast}
        />
    )
})
