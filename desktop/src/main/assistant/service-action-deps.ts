import type {
    AssistantApprovePendingPlaygroundLabRequestInput,
    AssistantCreatePlaygroundLabInput,
    AssistantCreateSessionInput,
    AssistantDeclinePendingPlaygroundLabRequestInput,
    AssistantDeleteMessageInput,
    AssistantDomainEvent,
    AssistantAccountIdentity,
    AssistantApprovalDecision,
    AssistantInteractionMode,
    AssistantModelInfo,
    AssistantPlaygroundState,
    AssistantRateLimitSnapshot,
    AssistantReasoningEffort,
    AssistantRuntimeEvent,
    AssistantRuntimeMode,
    AssistantSendPromptOptions,
    AssistantSession,
    AssistantSnapshot,
    AssistantThread
} from '../../shared/assistant/contracts'

export interface AssistantRuntimeBridge {
    checkAvailability(): Promise<{ available: boolean; reason: string | null }>
    listModels(forceRefresh?: boolean): Promise<AssistantModelInfo[]>
    getAccount(): Promise<{
        account: AssistantAccountIdentity | null
        authMode: 'apikey' | 'chatgpt' | 'chatgptAuthTokens' | null
        requiresOpenaiAuth: boolean
    }>
    getAccountRateLimits(): Promise<{
        rateLimits: AssistantRateLimitSnapshot | null
        rateLimitsByLimitId: Record<string, AssistantRateLimitSnapshot>
    }>
    connect(thread: AssistantThread, cwd: string): Promise<void>
    hasSession(threadId: string): boolean
    sendPrompt(
        threadId: string,
        prompt: string,
        options?: {
            model?: string
            runtimeMode?: AssistantRuntimeMode
            interactionMode?: AssistantInteractionMode
            effort?: AssistantReasoningEffort
            serviceTier?: 'fast'
            profile?: string
        }
    ): Promise<{ turnId: string; providerThreadId: string | null }>
    interruptTurn(threadId: string, turnId?: string): Promise<void>
    rollbackThread(threadId: string, numTurns: number): Promise<void>
    respondApproval(threadId: string, requestId: string, decision: AssistantApprovalDecision): Promise<void>
    respondUserInput(threadId: string, requestId: string, answers: Record<string, string | string[]>): Promise<void>
    disconnect(threadId: string): void
    dispose(): void
    on(event: 'runtime', listener: (event: AssistantRuntimeEvent) => void): this
}

export interface AssistantServiceActionDeps {
    readonly runtime: AssistantRuntimeBridge
    ensureReady(): Promise<void>
    getSnapshot(): AssistantSnapshot
    hydrateSelectedSession(sessionId: string): Promise<void>
    appendEvent(
        type: AssistantDomainEvent['type'],
        occurredAt: string,
        payload: Record<string, unknown>,
        sessionId?: string,
        threadId?: string
    ): void
    getSessionRuntimeCwd(
        session: AssistantSession,
        thread: AssistantThread
    ): string
    createSession(input?: AssistantCreateSessionInput): Promise<{ success: true; sessionId: string }>
    createPlaygroundLab(
        input: AssistantCreatePlaygroundLabInput
    ): Promise<{ success: true; labId: string; sessionId: string | null; playground: AssistantPlaygroundState }>
    sendPrompt(
        prompt: string,
        options?: AssistantSendPromptOptions
    ): Promise<{ success: true; sessionId: string; threadId: string; turnId?: string }>
    suppressAssistantTextForTurn(threadId: string, turnId: string): void
}

export type AssistantServicePlaygroundApprovalInput =
    | AssistantApprovePendingPlaygroundLabRequestInput
    | AssistantDeclinePendingPlaygroundLabRequestInput

export type AssistantServiceDeleteMessageInput = AssistantDeleteMessageInput
