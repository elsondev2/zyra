import { useSyncExternalStore } from 'react'
import { DESKTOP_LINK_PREFERENCE_KEY, normalizeDesktopLinkPreference, type DesktopLinkPreference, type DesktopLinkResult } from '@shared/desktop-link-policy'

const changed = 'zyra:desktop-link-preference'
let request: ((url: string) => Promise<DesktopLinkResult>) | null = null
export function installDesktopLinkHandler(handler: NonNullable<typeof request>): () => void {
    request = handler
    return () => { if (request === handler) request = null }
}
export function openDesktopLink(url: string): Promise<DesktopLinkResult> {
    return request ? request(url) : Promise.resolve({ success: false, error: 'Link opening is not ready. Try again.' })
}
export function getDesktopLinkPreference(): DesktopLinkPreference {
    try { return normalizeDesktopLinkPreference(window.localStorage.getItem(DESKTOP_LINK_PREFERENCE_KEY)) }
    catch { return 'ask' }
}
export function setDesktopLinkPreference(value: DesktopLinkPreference): void {
    window.localStorage.setItem(DESKTOP_LINK_PREFERENCE_KEY, normalizeDesktopLinkPreference(value))
    window.dispatchEvent(new Event(changed))
}
function subscribe(callback: () => void) {
    const storage = (event: StorageEvent) => { if (!event.key || event.key === DESKTOP_LINK_PREFERENCE_KEY) callback() }
    window.addEventListener(changed, callback)
    window.addEventListener('storage', storage)
    return () => { window.removeEventListener(changed, callback); window.removeEventListener('storage', storage) }
}
export function useDesktopLinkPreference() {
    return useSyncExternalStore(subscribe, getDesktopLinkPreference, () => 'ask' as const)
}
