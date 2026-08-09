import type { ForegroundRouteClaim } from './foreground-route'
import type { StrongAgentProviderCapabilityReport } from './provider-capabilities'

export interface PrimaryDirectTurnInput {
    conversationId: string
    routeClaim: ForegroundRouteClaim
    userMessageId: string
    text: string
    attachmentIds: string[]
    signal: AbortSignal
}

export interface PrimaryDirectTurnHandle {
    turnId: string
    providerSessionId: string
    conversationId: string
    routeClaim: ForegroundRouteClaim
}

export interface PrimaryTaskPacket {
    packetId: string
    conversationId: string
    taskId: string
    attemptId: string
    primaryAgentRunId: string
    sourceUserMessageId: string
    verbatimRequest: string
    contextVersion: number
    projectCwd: string
}

export interface PrimaryPrivateAttemptHandle {
    taskId: string
    attemptId: string
    primaryAgentRunId: string
    providerSessionId: string
}

export type PrimaryAgentDomainEvent =
    | {
        type: 'primary.direct.text.delta' | 'primary.direct.text.completed'
        conversationId: string
        turnId: string
        providerItemId: string
        routeClaim: ForegroundRouteClaim
        text: string
        occurredAt: string
    }
    | {
        type: 'primary.private.attempt.started' | 'primary.private.attempt.completed'
        conversationId: string
        taskId: string
        attemptId: string
        primaryAgentRunId: string
        occurredAt: string
    }
    | {
        type: 'primary.private.progress'
        conversationId: string
        taskId: string
        attemptId: string
        primaryAgentRunId: string
        summary: string
        verified: boolean
        occurredAt: string
    }
    | {
        type: 'primary.context.acknowledged'
        conversationId: string
        taskId: string
        attemptId: string
        contextVersion: number
        occurredAt: string
    }

export interface PrimaryAgentAdapter {
    capabilities(): Promise<StrongAgentProviderCapabilityReport>
    respondDirect(input: PrimaryDirectTurnInput): Promise<PrimaryDirectTurnHandle>
    startPrivate(packet: PrimaryTaskPacket, signal: AbortSignal): Promise<PrimaryPrivateAttemptHandle>
    steer(attemptId: string, contextVersion: number, instruction: string): Promise<void>
    cancel(attemptId: string, reason: string): Promise<void>
    subscribe(listener: (event: PrimaryAgentDomainEvent) => void): () => void
}
