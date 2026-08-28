import type { FleetOperationInput, FleetSnapshot } from './fleet'
import type {
    AssistantApprovalDecision,
    AssistantInteractionMode,
    AssistantReasoningEffort,
    AssistantRuntimeMode
} from './runtime'
import type {
    AssistantAccountOverview,
    AssistantDomainEvent,
    AssistantRateLimitResetRedemption,
    AssistantGetHistoryPageInput,
    AssistantHydrateHistoryBodyInput,
    AssistantHistoryBody,
    AssistantGetReviewIndexInput,
    AssistantGetTurnDetailInput,
    AssistantHistoryPage,
    AssistantPlaygroundState,
    AssistantReviewIndex,
    AssistantRuntimeStatus,
    AssistantSearchTurnsInput,
    AssistantSearchTurnsResult,
    AssistantSessionTurnUsagePayload,
    AssistantShellSnapshot,
    AssistantThreadDetail,
    AssistantTurnDetail
} from './read-model'
import type { AssistantVoiceExecutionConfiguration } from './realtime-voice'

export const ASSISTANT_IPC = {
    subscribe: 'devscope:assistant:subscribe',
    unsubscribe: 'devscope:assistant:unsubscribe',
    bootstrap: 'devscope:assistant:bootstrap',
    getSnapshot: 'devscope:assistant:getSnapshot',
    getFleetSnapshot: 'devscope:assistant:getFleetSnapshot',
    agentAction: 'devscope:assistant:agentAction',
    workflowAction: 'devscope:assistant:workflowAction',
    getStatus: 'devscope:assistant:getStatus',
    getAccountOverview: 'devscope:assistant:getAccountOverview',
    redeemAccountReset: 'devscope:assistant:redeemAccountReset',
    getSessionTurnUsage: 'devscope:assistant:getSessionTurnUsage',
    listModels: 'devscope:assistant:listModels',
    connect: 'devscope:assistant:connect',
    disconnect: 'devscope:assistant:disconnect',
    createSession: 'devscope:assistant:createSession',
    selectSession: 'devscope:assistant:selectSession',
    selectThread: 'devscope:assistant:selectThread',
    getThreadDetailBootstrap: 'devscope:assistant:getThreadDetailBootstrap',
    getHistoryPage: 'devscope:assistant:getHistoryPage',
    hydrateHistoryBody: 'devscope:assistant:hydrateHistoryBody',
    getReviewIndex: 'devscope:assistant:getReviewIndex',
    getTurnDetail: 'devscope:assistant:getTurnDetail',
    searchTurns: 'devscope:assistant:searchTurns',
    renameSession: 'devscope:assistant:renameSession',
    regenerateSessionTitle: 'devscope:assistant:regenerateSessionTitle',
    archiveSession: 'devscope:assistant:archiveSession',
    deleteSession: 'devscope:assistant:deleteSession',
    deleteMessage: 'devscope:assistant:deleteMessage',
    clearLogs: 'devscope:assistant:clearLogs',
    setSessionProjectPath: 'devscope:assistant:setSessionProjectPath',
    setPlaygroundRoot: 'devscope:assistant:setPlaygroundRoot',
    createPlaygroundLab: 'devscope:assistant:createPlaygroundLab',
    deletePlaygroundLab: 'devscope:assistant:deletePlaygroundLab',
    attachSessionToPlaygroundLab: 'devscope:assistant:attachSessionToPlaygroundLab',
    approvePendingPlaygroundLabRequest: 'devscope:assistant:approvePendingPlaygroundLabRequest',
    declinePendingPlaygroundLabRequest: 'devscope:assistant:declinePendingPlaygroundLabRequest',
    persistClipboardImage: 'devscope:assistant:persistClipboardImage',
    resolveClipboardAttachment: 'devscope:assistant:resolveClipboardAttachment',
    newThread: 'devscope:assistant:newThread',
    sendPrompt: 'devscope:assistant:sendPrompt',
    interruptTurn: 'devscope:assistant:interruptTurn',
    respondApproval: 'devscope:assistant:respondApproval',
    respondUserInput: 'devscope:assistant:respondUserInput',
    subscribeRealtimeVoice: 'devscope:assistant:realtimeVoice:subscribe',
    unsubscribeRealtimeVoice: 'devscope:assistant:realtimeVoice:unsubscribe',
    startRealtimeVoice: 'devscope:assistant:realtimeVoice:start',
    sendRealtimeVoiceMessage: 'devscope:assistant:realtimeVoice:sendMessage',
    ingestRealtimeVoiceEvent: 'devscope:assistant:realtimeVoice:ingestWebRtcEvent',
    stopRealtimeVoice: 'devscope:assistant:realtimeVoice:stop',
    realtimeVoiceEvent: 'devscope:assistant:realtimeVoice:event',
    getVoiceTranscriptionState: 'devscope:assistant:getVoiceTranscriptionState',
    transcribeVoice: 'devscope:assistant:transcribeVoice',
    eventStream: 'devscope:assistant:event'
} as const

export type AssistantIpcChannel = (typeof ASSISTANT_IPC)[keyof typeof ASSISTANT_IPC]

export interface AssistantConnectOptions {
    sessionId?: string
    voicePreparation?: AssistantVoiceExecutionConfiguration
}

export interface AssistantBootstrapPayload {
    snapshot: AssistantShellSnapshot
    status: AssistantRuntimeStatus
}

export interface AssistantAccountOverviewPayload {
    overview: AssistantAccountOverview
}

export interface AssistantRedeemAccountResetInput {
    creditId: string
    confirmed: true
}

export interface AssistantRedeemAccountResetPayload {
    redemption: AssistantRateLimitResetRedemption
    overview: AssistantAccountOverview | null
    refreshError: string | null
}

export interface AssistantFleetSnapshotPayload {
    snapshot: FleetSnapshot | null
}

export interface AssistantFleetOperationResultPayload {
    result: Record<string, unknown>
}

export type { FleetOperationInput }

export type { AssistantGetHistoryPageInput, AssistantHydrateHistoryBodyInput, AssistantGetReviewIndexInput, AssistantGetTurnDetailInput, AssistantSearchTurnsInput }

export interface AssistantThreadDetailResultPayload {
    detail: AssistantThreadDetail
}

export interface AssistantHistoryPageResultPayload {
    page: AssistantHistoryPage
}

export interface AssistantHistoryBodyResultPayload {
    body: AssistantHistoryBody
}

export interface AssistantTurnDetailResultPayload {
    detail: AssistantTurnDetail
}

export interface AssistantReviewIndexResultPayload {
    index: AssistantReviewIndex
}

export interface AssistantSearchTurnsResultPayload {
    result: AssistantSearchTurnsResult
}

export interface AssistantGetSessionTurnUsageInput {
    sessionId?: string
}

export interface AssistantSessionTurnUsageResultPayload {
    usage: AssistantSessionTurnUsagePayload
}

export interface AssistantPromptImageInput {
    path: string
    name?: string
    mimeType?: string
}

export interface AssistantSendPromptOptions {
    sessionId?: string
    model?: string
    runtimeMode?: AssistantRuntimeMode
    interactionMode?: AssistantInteractionMode
    effort?: AssistantReasoningEffort
    serviceTier?: 'fast'
    profile?: string
    images?: AssistantPromptImageInput[]
    skipPlaygroundLabSetup?: boolean
    playgroundTerminalAccess?: boolean
    skipPlaygroundTerminalAccessRequest?: boolean
    playgroundTerminalAccessRequestSuppressed?: boolean
    suppressUserMessage?: boolean
}

export interface AssistantDeleteMessageInput {
    sessionId?: string
    messageId: string
}

export interface AssistantCreateSessionInput {
    title?: string
    projectPath?: string
    mode?: 'work' | 'playground'
    playgroundLabId?: string | null
}

export interface AssistantSelectThreadInput {
    sessionId: string
    threadId: string
}

export interface AssistantSetPlaygroundRootInput {
    rootPath: string | null
}

export interface AssistantCreatePlaygroundLabInput {
    title?: string
    source: 'empty' | 'git-clone' | 'existing-folder'
    repoUrl?: string
    existingFolderPath?: string
    openSession?: boolean
}

export interface AssistantAttachSessionToPlaygroundLabInput {
    sessionId: string
    labId: string
}

export interface AssistantDeletePlaygroundLabInput {
    labId: string
}

export interface AssistantApprovePendingPlaygroundLabRequestInput {
    sessionId: string
    source: 'empty' | 'git-clone'
    title?: string
    repoUrl?: string
}

export interface AssistantDeclinePendingPlaygroundLabRequestInput {
    sessionId: string
}

export interface AssistantPlaygroundResultPayload {
    playground: AssistantPlaygroundState
}

export interface AssistantPersistClipboardImageInput {
    dataUrl: string
    fileName?: string
    mimeType?: string
    source?: 'paste' | 'manual'
}

export interface AssistantResolveClipboardAttachmentInput {
    reference: string
}

export interface AssistantClearLogsInput {
    sessionId?: string
}

export interface AssistantApprovalResponseInput {
    requestId: string
    decision: AssistantApprovalDecision
}

export interface AssistantUserInputResponseInput {
    requestId: string
    answers: Record<string, string | string[]>
}

export type AssistantVoiceTranscriptionStatus = 'ready' | 'signed-out' | 'unavailable'

export interface AssistantVoiceTranscriptionState {
    provider: 'codex'
    status: AssistantVoiceTranscriptionStatus
    available: boolean
    signedIn: boolean
    message: string | null
}

export interface AssistantTranscribeVoiceInput {
    audioBase64: string
    mimeType: 'audio/wav'
    sampleRateHz: 24_000
    durationMs: number
}

export interface AssistantEventStreamPayload {
    event?: AssistantDomainEvent
    events?: AssistantDomainEvent[]
}

export function assertAssistantIpcContract(): void {
    const values = Object.values(ASSISTANT_IPC)
    const unique = new Set(values)
    if (unique.size !== values.length) {
        throw new Error('Assistant IPC contract has duplicate channel names.')
    }
}
