import type { AssistantPlaygroundState, AssistantSession } from '@shared/assistant/contracts'
import type { AssistantToastInput } from './AssistantPageHelpers'
import type { AssistantCreatePlaygroundLabResult, AssistantMutationResult, SessionProjectGroup } from './assistant-sessions-rail-utils'
import type {
    AssistantRailFilterMode,
    AssistantRailGroupMode,
    AssistantRailMode,
    AssistantRailSortMode
} from './useAssistantPageSidebarState'

export type ExpandedSessionsRailContentProps = {
    compact: boolean
    railMode: AssistantRailMode
    railGroupMode: AssistantRailGroupMode
    railSortMode: AssistantRailSortMode
    railFilterMode: AssistantRailFilterMode
    playground: AssistantPlaygroundState
    backgroundActivitySessions: AssistantSession[]
    assistantConnected: boolean
    commandPending: boolean
    groupedSessions: SessionProjectGroup[]
    activeSessionId: string | null
    activeThreadId: string | null
    expandedGroupKeys: Set<string>
    onRailModeChange: (mode: AssistantRailMode) => void
    onRailGroupModeChange: (mode: AssistantRailGroupMode) => void
    onRailSortModeChange: (mode: AssistantRailSortMode) => void
    onRailFilterModeChange: (mode: AssistantRailFilterMode) => void
    onToggleGroup: (key: string) => void
    onChooseProjectPath: () => void
    onCreateSession: (projectPath?: string) => void
    onCreatePlaygroundSession: (labId?: string | null) => void
    onSelectSession: (sessionId: string) => void
    onSelectThread: (input: { sessionId: string; threadId: string }) => void
    onOpenRename: (session: AssistantSession) => void
    onArchiveSession: (sessionId: string, archived?: boolean) => void
    onDeleteRequest: (session: AssistantSession) => void
    onDeleteSession: (sessionId: string) => Promise<AssistantMutationResult> | AssistantMutationResult
    onSetPlaygroundRoot: (rootPath: string | null) => Promise<void> | void
    onCreatePlaygroundLab: (input: {
        title?: string
        source: 'empty' | 'git-clone' | 'existing-folder'
        repoUrl?: string
        existingFolderPath?: string
        openSession?: boolean
    }) => Promise<AssistantCreatePlaygroundLabResult> | AssistantCreatePlaygroundLabResult
    onDeletePlaygroundLab: (labId: string) => Promise<AssistantMutationResult> | AssistantMutationResult
    onProjectDragStart: (projectKey: string) => void
    onProjectDragEnd: (activeProjectKey: string, overProjectKey: string | null) => void
    onProjectDragCancel: () => void
    onSessionDragStart: (sessionId: string, projectKey: string) => void
    onSessionDragEnd: (projectKey: string, activeSessionId: string, overSessionId: string | null) => void
    onSessionDragCancel: () => void
    onShowToast: (input: AssistantToastInput) => void
}
