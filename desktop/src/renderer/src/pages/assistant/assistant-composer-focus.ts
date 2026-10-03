/** Retain keyboard focus intent while the chat route/composer is loading. */
export const ASSISTANT_COMPOSER_FOCUS_CLASS_NAME = 'focus-within:!border-[color-mix(in_srgb,var(--accent-primary)_55%,transparent)] focus-within:ring-1 focus-within:ring-[color-mix(in_srgb,var(--accent-primary)_25%,transparent)]'
let pending = false
const listeners = new Set<() => boolean>()
export function requestAssistantComposerFocus(): void {
    pending = true
    for (const listener of listeners) if (listener()) { pending = false; break }
}
export function subscribeAssistantComposerFocus(listener: () => boolean): () => void {
    listeners.add(listener)
    if (pending && listener()) pending = false
    return () => { listeners.delete(listener) }
}
