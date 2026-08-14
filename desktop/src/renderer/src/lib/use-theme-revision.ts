import { useSyncExternalStore } from 'react'
import { ZYRA_THEME_CHANGED_EVENT } from './theme-events'

const subscribers = new Set<() => void>()
let revision = 0
let listening = false

function notifyThemeSubscribers() {
    revision += 1
    for (const subscriber of subscribers) subscriber()
}

function subscribe(subscriber: () => void): () => void {
    subscribers.add(subscriber)
    if (!listening && typeof window !== 'undefined') {
        window.addEventListener(ZYRA_THEME_CHANGED_EVENT, notifyThemeSubscribers)
        listening = true
    }
    return () => {
        subscribers.delete(subscriber)
        if (subscribers.size === 0 && listening && typeof window !== 'undefined') {
            window.removeEventListener(ZYRA_THEME_CHANGED_EVENT, notifyThemeSubscribers)
            listening = false
        }
    }
}

function getSnapshot() {
    return revision
}

export function useThemeRevision(): number {
    return useSyncExternalStore(subscribe, getSnapshot, () => 0)
}
