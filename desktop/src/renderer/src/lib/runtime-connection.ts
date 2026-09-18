import { useSyncExternalStore } from 'react'
import { runtimeConnectionPresentation, type RuntimeActivationStatus } from '@shared/runtime-activation'

let status: RuntimeActivationStatus = { phase: 'idle', connection: 'unknown' }
const listeners = new Set<() => void>()
let stop: (() => void) | undefined
function update(next: RuntimeActivationStatus) {
    status = next
    for (const listener of listeners) listener()
}
function subscribe(listener: () => void) {
    listeners.add(listener)
    if (listeners.size === 1) {
        let live = true, received = false
        const api = window.devscope.runtimeActivation
        const unsubscribe = api?.onStateChange(next => { if (live) { received = true; update(next) } })
        void api?.getState().then(next => { if (live && !received) update(next) }).catch(() => {
            if (live && !received) update({ ...status, phase: 'failed', connection: 'disconnected' })
        })
        // Re-evaluate freshness even when the upstream silently stops delivering.
        const timer = window.setInterval(() => update({ ...status }), 15_000)
        stop = () => { live = false; unsubscribe?.(); window.clearInterval(timer) }
    }
    return () => {
        listeners.delete(listener)
        if (!listeners.size) { stop?.(); stop = undefined }
    }
}
export function useRuntimeConnection() {
    const state = useSyncExternalStore(subscribe, () => status, () => status)
    return { state, ...runtimeConnectionPresentation(state) }
}
