import type { AssistantMessage } from '@shared/assistant/contracts'

export type AssistantConversationFindMatch = { messageId: string }

export function matchAssistantConversationMessages(messages: AssistantMessage[], query: string): AssistantConversationFindMatch[] {
    const term = query.trim().toLocaleLowerCase()
    if (!term) return []
    return messages
        .filter(message => message.text.toLocaleLowerCase().includes(term))
        .map(message => ({ messageId: message.id }))
}
