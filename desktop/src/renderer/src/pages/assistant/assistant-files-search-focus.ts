let pending = false
const listeners = new Set<() => boolean>()

export function requestAssistantFilesSearchFocus(): void {
    pending = true
    for (const listener of listeners) {
        if (listener()) {
            pending = false
            break
        }
    }
}

export function subscribeAssistantFilesSearchFocus(listener: () => boolean): () => void {
    listeners.add(listener)
    if (pending && listener()) pending = false
    return () => listeners.delete(listener)
}
