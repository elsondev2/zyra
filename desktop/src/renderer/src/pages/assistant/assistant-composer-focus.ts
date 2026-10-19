/** Retain keyboard focus intent while the destination chat/composer is loading. */
export const ASSISTANT_COMPOSER_FOCUS_CLASS_NAME = 'focus-within:!border-[color-mix(in_srgb,var(--accent-primary)_55%,transparent)] focus-within:ring-1 focus-within:ring-[color-mix(in_srgb,var(--accent-primary)_25%,transparent)]'
let pending: { sessionId?: string } | null = null
const listeners = new Set<{ listener: () => boolean; sessionId?: string | null }>()
function deliverPendingFocus(): void {
    const request = pending
    if (!request) return
    for (const entry of listeners) {
        if (request.sessionId && entry.sessionId !== request.sessionId) continue
        if (entry.listener()) {
            if (pending === request) pending = null
            break
        }
    }
}
export function requestAssistantComposerFocus(sessionId?: string): void {
    pending = { sessionId }
    deliverPendingFocus()
}
export function subscribeAssistantComposerFocus(listener: () => boolean, sessionId?: string | null): () => void {
    const entry = { listener, sessionId }
    listeners.add(entry)
    deliverPendingFocus()
    return () => { listeners.delete(entry) }
}
