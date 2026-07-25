import { useSyncExternalStore } from 'react'
import { ZYRA_THEME_CHANGED_EVENT } from '@/lib/theme-events'
const subscribers = new Set<() => void>()
let listening = false

function notifyThemeSubscribers() {
    for (const subscriber of subscribers) subscriber()
}

function subscribeToMarkdownTheme(subscriber: () => void): () => void {
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

function readMarkdownTheme(): 'light' | 'dark' {
    if (typeof document === 'undefined') return 'dark'
    return document.body.classList.contains('light') ? 'light' : 'dark'
}

export function useMarkdownVisualTheme(): 'light' | 'dark' {
    return useSyncExternalStore(subscribeToMarkdownTheme, readMarkdownTheme, () => 'dark')
}

