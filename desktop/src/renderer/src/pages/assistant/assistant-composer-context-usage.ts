import type { AssistantSessionTurnUsageEntry, AssistantTurnUsage } from '@shared/assistant/contracts'

export function resolveAssistantComposerContextUsage(input: {
    liveUsage?: AssistantTurnUsage | null
    sessionTurns?: readonly AssistantSessionTurnUsageEntry[] | null
    threadId?: string | null
}): AssistantTurnUsage | null {
    if (input.liveUsage) return input.liveUsage

    const threadId = String(input.threadId || '').trim()
    for (let index = (input.sessionTurns?.length || 0) - 1; index >= 0; index -= 1) {
        const turn = input.sessionTurns?.[index]
        if (!turn?.usage || (threadId && turn.threadId !== threadId)) continue
        return turn.usage
    }
    return null
}
