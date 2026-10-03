const listeners = new Set<() => void>()
let state: any
export const assistantStore = {
    retain: () => {},
    release: () => {},
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } },
    getState: () => state,
    update: (next: any) => { state = next; for (const listener of listeners) listener() }
}
