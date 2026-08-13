import type { AssistantCreateSessionInput, AssistantModelInfo, AssistantSnapshot, AssistantThreadHistoryState } from '@shared/assistant/contracts'
import {
    getActiveAssistantThread,
    getAssistantActivePlan,
    getAssistantActivityFeed,
    getAssistantLatestProposedPlan,
    getAssistantPendingApprovals,
    getAssistantPendingUserInputs,
    getAssistantThreadPhase,
    getAssistantTimelineMessages,
    getSelectedAssistantSession
} from './selectors'

export type AssistantWorkspaceSelection = {
    knownModels: AssistantModelInfo[]
    available: boolean
    connected: boolean
    loading: boolean
    bootstrapped: boolean
    modelsLoading: boolean
    commandPending: boolean
    commandError: string | null
    selectedSession: ReturnType<typeof getSelectedAssistantSession>
    activeThread: ReturnType<typeof getActiveAssistantThread>
    timelineMessages: ReturnType<typeof getAssistantTimelineMessages>
    activityFeed: ReturnType<typeof getAssistantActivityFeed>
    pendingApprovals: ReturnType<typeof getAssistantPendingApprovals>
    pendingUserInputs: ReturnType<typeof getAssistantPendingUserInputs>
    activePlan: ReturnType<typeof getAssistantActivePlan>
    latestProposedPlan: ReturnType<typeof getAssistantLatestProposedPlan>
    phase: ReturnType<typeof getAssistantThreadPhase>
    phaseLabel: string
}

export type AssistantPageSelection = {
    available: boolean
    connected: boolean
    loading: boolean
    bootstrapped: boolean
    commandPending: boolean
    commandError: string | null
    selectedSession: ReturnType<typeof getSelectedAssistantSession>
    activeThread: ReturnType<typeof getActiveAssistantThread>
    activityFeed: ReturnType<typeof getAssistantActivityFeed>
    pendingApprovals: ReturnType<typeof getAssistantPendingApprovals>
    pendingUserInputs: ReturnType<typeof getAssistantPendingUserInputs>
    activePlan: ReturnType<typeof getAssistantActivePlan>
    latestProposedPlan: ReturnType<typeof getAssistantLatestProposedPlan>
    phase: ReturnType<typeof getAssistantThreadPhase>
    phaseLabel: string
}

export type AssistantConversationSelection = {
    knownModels: AssistantModelInfo[]
    sessions: AssistantSnapshot['sessions']
    available: boolean
    connected: boolean
    loading: boolean
    modelsLoading: boolean
    commandPending: boolean
    pendingCreateSessionInput: AssistantCreateSessionInput | null
    commandError: string | null
    selectionHydrating: boolean
    history: AssistantThreadHistoryState | null
    selectedSession: ReturnType<typeof getSelectedAssistantSession>
    activeThread: ReturnType<typeof getActiveAssistantThread>
    timelineMessages: ReturnType<typeof getAssistantTimelineMessages>
    activityFeed: ReturnType<typeof getAssistantActivityFeed>
    pendingUserInputs: ReturnType<typeof getAssistantPendingUserInputs>
    activePlan: ReturnType<typeof getAssistantActivePlan>
    latestProposedPlan: ReturnType<typeof getAssistantLatestProposedPlan>
    phase: ReturnType<typeof getAssistantThreadPhase>
    phaseLabel: string
}

export type AssistantSessionsRailSelection = {
    snapshot: AssistantSnapshot
    sessions: AssistantSnapshot['sessions']
    playground: AssistantSnapshot['playground']
    activeSessionId: string | null
    activeThreadId: string | null
    connected: boolean
    commandPending: boolean
}
