import type { AssistantCreateSessionInput } from '@shared/assistant/contracts'
import { buildAssistantChatRoute } from './assistant-chat-route'

type CreateAssistantSessionResult =
    | { success: true; sessionId: string; snapshot?: { sessions?: Array<{ id: string; activeThreadId?: string | null }> } }
    | { success: false; error: string }

type CreateAssistantChatActions = {
    createSessionResult: (input?: AssistantCreateSessionInput) => Promise<CreateAssistantSessionResult>
}

export async function createAssistantChatAndNavigate(
    actions: CreateAssistantChatActions,
    navigate: (to: string) => void,
    input: AssistantCreateSessionInput = { mode: 'work' }
): Promise<CreateAssistantSessionResult> {
    const result = await actions.createSessionResult(input)
    if (!result.success) return result

    const session = result.snapshot?.sessions?.find((entry) => entry.id === result.sessionId) || null
    navigate(buildAssistantChatRoute(result.sessionId, session?.activeThreadId || null))
    return result
}
