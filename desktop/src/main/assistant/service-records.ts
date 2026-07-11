import type {
    AssistantLatestTurn,
    AssistantMessage,
    AssistantSendPromptOptions,
    AssistantSession,
    AssistantThread
} from '../../shared/assistant/contracts'

export function createAssistantSessionRecord(params: {
    sessionId: string
    title: string
    mode?: AssistantSession['mode']
    projectPath: string | null
    playgroundLabId?: string | null
    createdAt: string
    thread: AssistantThread
}): AssistantSession {
    return {
        id: params.sessionId,
        title: params.title,
        mode: 'work',
        projectPath: params.projectPath,
        playgroundLabId: null,
        pendingLabRequest: null,
        archived: false,
        createdAt: params.createdAt,
        updatedAt: params.createdAt,
        activeThreadId: params.thread.id,
        threadIds: [params.thread.id],
        threads: [params.thread]
    }
}

export function createAssistantUserMessage(input: string, occurredAt: string, id: string): AssistantMessage {
    return {
        id,
        role: 'user',
        text: input,
        turnId: null,
        streaming: false,
        createdAt: occurredAt,
        updatedAt: occurredAt
    }
}

export function createRunningLatestTurn(
    turnId: string,
    occurredAt: string,
    options?: Pick<AssistantSendPromptOptions, 'effort' | 'serviceTier'>
): AssistantLatestTurn {
    return {
        id: turnId,
        state: 'running',
        requestedAt: occurredAt,
        startedAt: occurredAt,
        completedAt: null,
        assistantMessageId: null,
        effort: options?.effort || null,
        serviceTier: options?.serviceTier || null,
        usage: null
    }
}
