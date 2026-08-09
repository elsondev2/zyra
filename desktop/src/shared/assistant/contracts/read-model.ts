import type { FileChangeKind } from './file-change'
import type { FleetSnapshot } from './fleet'
import type {
    AssistantApprovalDecision,
    AssistantApprovalRequestType,
    AssistantInteractionMode,
    AssistantPlanStep,
    AssistantReasoningEffort,
    AssistantRuntimeMode,
    AssistantThreadState,
    AssistantTurnUsage,
    AssistantUserInputQuestion
} from './runtime'

export interface AssistantMessage {
    id: string
    role: 'user' | 'assistant' | 'system'
    text: string
    turnId: string | null
    streaming: boolean
    timelineSequence?: number
    providerItemId?: string
    modality?: 'text' | 'voice' | 'image' | 'multimodal'
    createdAt: string
    updatedAt: string
}

export interface AssistantProposedPlan {
    id: string
    turnId: string | null
    planMarkdown: string
    timelineSequence?: number
    createdAt: string
    updatedAt: string
}

export interface AssistantActivity {
    id: string
    kind: string
    tone: 'info' | 'tool' | 'warning' | 'error'
    summary: string
    detail?: string
    turnId: string | null
    timelineSequence?: number
    createdAt: string
    payload?: Record<string, unknown>
}

export interface AssistantPendingApproval {
    id: string
    requestId: string
    requestType: AssistantApprovalRequestType
    title?: string
    detail?: string
    command?: string
    paths?: string[]
    status: 'pending' | 'resolved'
    decision: AssistantApprovalDecision | null
    turnId: string | null
    createdAt: string
    resolvedAt: string | null
}

export interface AssistantPendingUserInput {
    id: string
    requestId: string
    questions: AssistantUserInputQuestion[]
    status: 'pending' | 'resolved'
    answers: Record<string, string | string[]> | null
    turnId: string | null
    createdAt: string
    resolvedAt: string | null
}

export interface AssistantActivePlan {
    explanation?: string
    plan: AssistantPlanStep[]
    turnId: string | null
    updatedAt: string
}

export type AssistantSessionMode = 'work' | 'playground'

export interface AssistantPlaygroundPendingLabRequest {
    id: string
    kind: 'create-empty' | 'clone-repo'
    prompt: string
    suggestedLabName: string
    repoUrl: string | null
    createdAt: string
}

export interface AssistantPlaygroundLab {
    id: string
    title: string
    rootPath: string
    source: 'empty' | 'git-clone' | 'existing-folder'
    repoUrl: string | null
    createdAt: string
    updatedAt: string
}

export interface AssistantPlaygroundState {
    rootPath: string | null
    labs: AssistantPlaygroundLab[]
}

export interface AssistantLatestTurn {
    id: string
    state: 'running' | 'completed' | 'interrupted' | 'error'
    requestedAt: string
    startedAt: string | null
    completedAt: string | null
    assistantMessageId: string | null
    effort?: AssistantReasoningEffort | null
    serviceTier?: 'fast' | 'flex' | null
    usage?: AssistantTurnUsage | null
}

export type AssistantThreadSource = 'root' | 'subagent' | 'other'

export interface AssistantSessionTurnUsageEntry {
    id: string
    sessionId: string
    threadId: string
    model: string
    state: AssistantLatestTurn['state']
    requestedAt: string
    startedAt: string | null
    completedAt: string | null
    assistantMessageId: string | null
    effort?: AssistantLatestTurn['effort']
    serviceTier?: AssistantLatestTurn['serviceTier']
    usage: AssistantTurnUsage | null
    updatedAt: string
}

export interface AssistantThreadShell {
    /** Existing desktop persistence key; retained as a local compatibility alias. */
    id: string
    /** Canonical cross-surface Pi thread ID (Pi calls this its session ID). */
    providerThreadId: string | null
    source: AssistantThreadSource
    parentThreadId: string | null
    providerParentThreadId: string | null
    subagentDepth: number | null
    agentNickname: string | null
    agentRole: string | null
    model: string
    thinking?: AssistantReasoningEffort | null
    profile?: string | null
    cwd: string | null
    messageCount: number
    activityCount: number
    proposedPlanCount: number
    lastSeenCompletedTurnId: string | null
    runtimeMode: AssistantRuntimeMode
    interactionMode: AssistantInteractionMode
    state: AssistantThreadState
    canonicalPresence?: {
        state: 'detached' | 'ready' | 'running' | 'background'
        activeTurnId: string | null
        clients: Array<{ clientId: string; surface: string }>
        backgroundWorkActive: boolean
        attention?: 'approval' | 'input' | null
        latestTurn?: AssistantLatestTurn | null
        latestSequence?: number
    }
    lastError: string | null
    createdAt: string
    updatedAt: string
    latestTurn: AssistantLatestTurn | null
    hasPendingApprovals: boolean
    hasPendingUserInputs: boolean
    hasActivePlan: boolean
}

/** Main-process runtime shape. IPC bootstrap uses AssistantThreadShell instead. */
export interface AssistantThread extends AssistantThreadShell {
    activePlan: AssistantActivePlan | null
    messages: AssistantMessage[]
    proposedPlans: AssistantProposedPlan[]
    activities: AssistantActivity[]
    pendingApprovals: AssistantPendingApproval[]
    pendingUserInputs: AssistantPendingUserInput[]
}

export type AssistantHistoryCursor = string

export interface AssistantGetHistoryPageInput {
    threadId: string
    before?: AssistantHistoryCursor | null
    turnLimit?: number
}

export interface AssistantGetTurnDetailInput {
    threadId: string
    turnId: string
}

export interface AssistantGetReviewIndexInput {
    threadId: string
}

export interface AssistantReviewMessagePreview {
    id: string
    text: string
    truncated: boolean
    createdAt: string
    updatedAt: string
}

export interface AssistantReviewChangeIndexEntry {
    activityId: string
    turnId: string
    filePath: string
    previousPath?: string
    changeKind?: FileChangeKind
    isNew?: boolean
    additions: number
    deletions: number
    status: 'running' | 'completed'
    authoritative: boolean
    truncated?: boolean
    unavailableReason?: string
    createdAt: string
}

export interface AssistantReviewTurnIndexEntry {
    id: string
    number: number
    state: AssistantLatestTurn['state']
    prompt: AssistantReviewMessagePreview | null
    response: AssistantReviewMessagePreview | null
    agentLabel: string
    requestedAt: string
    updatedAt: string
    changes: AssistantReviewChangeIndexEntry[]
}

export interface AssistantReviewIndex {
    threadId: string
    totalTurns: number
    turns: AssistantReviewTurnIndexEntry[]
}

export interface AssistantSearchTurnsInput {
    threadId: string
    query: string
    limit?: number
}

export interface AssistantSearchTurnsResult {
    threadId: string
    turnIds: string[]
}

export interface AssistantTurnDetail {
    threadId: string
    turnId: string
    messages: AssistantMessage[]
    activities: AssistantActivity[]
    proposedPlans: AssistantProposedPlan[]
}

export interface AssistantHistoryPage {
    threadId: string
    messages: AssistantMessage[]
    activities: AssistantActivity[]
    proposedPlans: AssistantProposedPlan[]
    pageInfo: {
        oldestCursor: AssistantHistoryCursor | null
        hasOlder: boolean
        turnCount: number
    }
}

export interface AssistantThreadHistoryState extends AssistantHistoryPage {
    initialLoading: boolean
    loadingOlder: boolean
    loadOlderError: string | null
    fullyLoaded: boolean
}

export interface AssistantThreadDetail {
    threadId: string
    activePlan: AssistantActivePlan | null
    pendingApprovals: AssistantPendingApproval[]
    pendingUserInputs: AssistantPendingUserInput[]
    history: AssistantThreadHistoryState
}

export interface AssistantSession {
    id: string
    title: string
    mode: AssistantSessionMode
    projectPath: string | null
    playgroundLabId: string | null
    pendingLabRequest: AssistantPlaygroundPendingLabRequest | null
    archived: boolean
    createdAt: string
    updatedAt: string
    activeThreadId: string | null
    threadIds: string[]
    threads: AssistantThread[]
}

export type AssistantSessionShell = Omit<AssistantSession, 'threads'> & {
    threads: AssistantThreadShell[]
}

export interface AssistantModelInfo {
    id: string
    label: string
    description?: string
    supportedEfforts?: AssistantReasoningEffort[]
}

export type AssistantAccountPlanType =
    | 'free'
    | 'go'
    | 'plus'
    | 'pro'
    | 'team'
    | 'business'
    | 'enterprise'
    | 'edu'
    | 'unknown'

export type AssistantAuthMode = 'apikey' | 'chatgpt' | 'chatgptAuthTokens'

export interface AssistantAccountIdentity {
    type: 'apiKey' | 'chatgpt'
    email: string | null
    planType: AssistantAccountPlanType | null
}

export interface AssistantCreditsSnapshot {
    hasCredits: boolean
    unlimited: boolean
    balance: string | null
}

export interface AssistantRateLimitWindow {
    usedPercent: number
    remainingPercent: number
    windowDurationMins: number | null
    resetsAt: number | null
}

export interface AssistantRateLimitSnapshot {
    limitId: string | null
    limitName: string | null
    primary: AssistantRateLimitWindow | null
    secondary: AssistantRateLimitWindow | null
    credits: AssistantCreditsSnapshot | null
    planType: AssistantAccountPlanType | null
}

export interface AssistantRateLimitResetCredit {
    id: string
    title: string
    status: string
    available: boolean
    resetType: string | null
    grantedAt: string | null
    expiresAt: string | null
    description: string | null
}

export interface AssistantRateLimitResetRedemption {
    code: string | null
    windowsReset: number | null
    redeemedAt: string | null
    credit: AssistantRateLimitResetCredit | null
}

export interface AssistantAccountOverview {
    provider: string | null
    source: string | null
    account: AssistantAccountIdentity | null
    accountId: string | null
    emailVerified: boolean | null
    tokenExpiresAt: string | null
    authMode: AssistantAuthMode | null
    requiresOpenaiAuth: boolean
    rateLimits: AssistantRateLimitSnapshot | null
    rateLimitsByLimitId: Record<string, AssistantRateLimitSnapshot>
    usageError: string | null
    availableResetCount: number | null
    resetCredits: AssistantRateLimitResetCredit[]
    resetCreditsError: string | null
    fetchedAt: string
}

export interface AssistantSessionTurnUsagePayload {
    sessionId: string
    turns: AssistantSessionTurnUsageEntry[]
    fetchedAt: string
}

export interface AssistantRuntimeStatus {
    available: boolean
    connected: boolean
    selectedSessionId: string | null
    activeThreadId: string | null
    state: AssistantThreadState | 'disconnected'
    reason: string | null
}

export interface AssistantSnapshot {
    snapshotSequence: number
    updatedAt: string
    selectedSessionId: string | null
    playground: AssistantPlaygroundState
    sessions: AssistantSession[]
    knownModels: AssistantModelInfo[]
    fleetByThreadId: Record<string, FleetSnapshot>
}

export type AssistantShellSnapshot = Omit<AssistantSnapshot, 'sessions'> & {
    sessions: AssistantSessionShell[]
}

export interface AssistantThreadDetailBootstrap {
    detail: AssistantThreadDetail
}

export type AssistantDomainEventType =
    | 'session.created'
    | 'session.selected'
    | 'session.updated'
    | 'session.deleted'
    | 'playground.updated'
    | 'thread.created'
    | 'thread.updated'
    | 'thread.message.user'
    | 'thread.message.assistant.delta'
    | 'thread.message.assistant.completed'
    | 'thread.plan.updated'
    | 'thread.proposed-plan.upserted'
    | 'thread.activity.appended'
    | 'thread.approval.updated'
    | 'thread.user-input.updated'
    | 'thread.latest-turn.updated'
    | 'fleet.snapshot.updated'

export interface AssistantDomainEvent {
    sequence: number
    eventId: string
    type: AssistantDomainEventType
    occurredAt: string
    sessionId?: string
    threadId?: string
    payload: Record<string, unknown>
}
