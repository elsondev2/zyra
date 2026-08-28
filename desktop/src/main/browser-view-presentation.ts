import type { WebContents } from 'electron'

type ManagedBrowserPresentation = {
    guest: WebContents
    userZoomFactor: number
    presentationScale: number
}

const managedPresentations = new Map<number, ManagedBrowserPresentation>()

function apply(entry: ManagedBrowserPresentation): void {
    if (entry.guest.isDestroyed()) return
    entry.guest.setZoomFactor(Math.max(0.01, entry.userZoomFactor * entry.presentationScale))
}

export function registerManagedBrowserPresentation(guest: WebContents): void {
    if (managedPresentations.has(guest.id)) return
    managedPresentations.set(guest.id, { guest, userZoomFactor: 1, presentationScale: 1 })
    guest.once('destroyed', () => managedPresentations.delete(guest.id))
}

export function setManagedBrowserPresentationScale(guest: WebContents, scale: number): boolean {
    const entry = managedPresentations.get(guest.id)
    if (!entry || guest.isDestroyed()) return false
    const normalized = Number.isFinite(scale) ? Math.max(0.01, Math.min(1, scale)) : 1
    if (Math.abs(entry.presentationScale - normalized) < 0.0001) return true
    entry.presentationScale = normalized
    apply(entry)
    return true
}

export function setManagedBrowserUserZoomFactor(guest: WebContents, factor: number): boolean {
    const entry = managedPresentations.get(guest.id)
    if (!entry || guest.isDestroyed()) return false
    entry.userZoomFactor = factor
    apply(entry)
    return true
}

export function getBrowserUserZoomFactor(guest: WebContents): number {
    return managedPresentations.get(guest.id)?.userZoomFactor ?? guest.getZoomFactor()
}
