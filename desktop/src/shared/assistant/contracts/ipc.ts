import type {
    AssistantApprovalDecision,
    AssistantInteractionMode,
    AssistantReasoningEffort,
    AssistantRuntimeMode
} from './runtime'
import type {
    AssistantAccountOverview,
    AssistantDomainEvent,
    AssistantPlaygroundState,
    AssistantRuntimeStatus,
    AssistantSessionTurnUsagePayload,
    AssistantSnapshot
} from './read-model'

export const ASSISTANT_IPC = {
    subscribe: 'devscope:assistant:subscribe',
    unsubscribe: 'devscope:assistant:unsubscribe',
    bootstrap: 'devscope:assistant:bootstrap',
    getSnapshot: 'devscope:assistant:getSnapshot',
    getStatus: 'devscope:assistant:getStatus',
    getAccountOverview: 'devscope:assistant:getAccountOverview',
    getSessionTurnUsage: 'devscope:assistant:getSessionTurnUsage',
    listModels: 'devscope:assistant:listModels',
    connect: 'devscope:assistant:connect',
    disconnect: 'devscope:assistant:disconnect',
    createSession: 'devscope:assistant:createSession',
    selectSession: 'devscope:assistant:selectSession',
    selectThread: 'devscope:assistant:selectThread',
    hydrateSession: 'devscope:assistant:hydrateSession',
    renameSession: 'devscope:assistant:renameSession',
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
    getTranscriptionModelState: 'devscope:assistant:getTranscriptionModelState',
    downloadTranscriptionModel: 'devscope:assistant:downloadTranscriptionModel',
    transcribeAudioWithLocalModel: 'devscope:assistant:transcribeAudioWithLocalModel',
    eventStream: 'devscope:assistant:event'
} as const

export type AssistantIpcChannel = (typeof ASSISTANT_IPC)[keyof typeof ASSISTANT_IPC]

export interface AssistantConnectOptions {
    sessionId?: string
}

export interface AssistantBootstrapPayload {
    snapshot: AssistantSnapshot
    status: AssistantRuntimeStatus
}

export interface AssistantAccountOverviewPayload {
    overview: AssistantAccountOverview
}

export interface AssistantGetSessionTurnUsageInput {
    sessionId?: string
}

export interface AssistantSessionTurnUsageResultPayload {
    usage: AssistantSessionTurnUsagePayload
}

export interface AssistantSendPromptOptions {
    sessionId?: string
    model?: string
    runtimeMode?: AssistantRuntimeMode
    interactionMode?: AssistantInteractionMode
    effort?: AssistantReasoningEffort
    serviceTier?: 'fast'
    profile?: string
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

export type AssistantTranscriptionModelStatus = 'missing' | 'downloading' | 'ready' | 'error'

export interface AssistantTranscriptionModelState {
    provider: 'vosk'
    modelId: string
    modelName: string
    status: AssistantTranscriptionModelStatus
    installPath: string | null
    downloadUrl: string
    error: string | null
}

export interface AssistantTranscribeAudioInput {
    audioBuffer: ArrayBuffer
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
