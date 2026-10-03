export type AssistantConversationFindRequest = { query?: string }

let pending: AssistantConversationFindRequest | null = null
const listeners = new Set<(request: AssistantConversationFindRequest) => boolean>()

export function requestAssistantConversationFind(request: AssistantConversationFindRequest = {}): void {
    pending = request
    for (const listener of listeners) {
        if (listener(request)) {
            pending = null
            break
        }
    }
}

export function subscribeAssistantConversationFind(listener: (request: AssistantConversationFindRequest) => boolean): () => void {
    listeners.add(listener)
    if (pending && listener(pending)) pending = null
    return () => listeners.delete(listener)
}

export function cancelAssistantConversationFind(): void {
    pending = null
}
