const REQUEST_TTL_MS = 1500
let pendingAt = 0
const listeners = new Set<() => boolean>()

export function requestAssistantFileSave(): void {
    pendingAt = Date.now()
    for (const listener of listeners) {
        if (listener()) {
            pendingAt = 0
            break
        }
    }
}

export function subscribeAssistantFileSave(listener: () => boolean): () => void {
    listeners.add(listener)
    if (pendingAt && Date.now() - pendingAt <= REQUEST_TTL_MS && listener()) pendingAt = 0
    else if (pendingAt && Date.now() - pendingAt > REQUEST_TTL_MS) pendingAt = 0
    return () => listeners.delete(listener)
}
