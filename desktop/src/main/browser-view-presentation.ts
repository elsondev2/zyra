import type { WebContents } from 'electron'

type ManagedBrowserPresentation = {
    guest: WebContents
    userZoomFactor: number
    presentationScale: number
    controlViewport: { width: number; height: number; visible: boolean }
    controlViewportListeners: Set<() => void>
    retainedForAgent: boolean
}

const managedPresentations = new Map<number, ManagedBrowserPresentation>()

function apply(entry: ManagedBrowserPresentation): void {
    if (entry.guest.isDestroyed()) return
    entry.guest.setZoomFactor(Math.max(0.01, entry.userZoomFactor * entry.presentationScale))
}

export function registerManagedBrowserPresentation(guest: WebContents): void {
    if (managedPresentations.has(guest.id)) return
    managedPresentations.set(guest.id, { guest, userZoomFactor: 1, presentationScale: 1, controlViewport: { width: 1200, height: 800, visible: false }, controlViewportListeners: new Set(), retainedForAgent: false })
    guest.once('destroyed', () => managedPresentations.delete(guest.id))
}

export function setManagedBrowserControlViewport(guest: WebContents, viewport: { width: number; height: number; visible: boolean }): void {
    const entry = managedPresentations.get(guest.id)
    if (!entry) return
    const previous = entry.controlViewport
    entry.controlViewport = {
        width: viewport.width >= 32 ? Math.round(viewport.width) : entry.controlViewport.width,
        height: viewport.height >= 32 ? Math.round(viewport.height) : entry.controlViewport.height,
        visible: viewport.visible
    }
    if (previous.width !== entry.controlViewport.width || previous.height !== entry.controlViewport.height || previous.visible !== entry.controlViewport.visible) {
        for (const listener of entry.controlViewportListeners) listener()
    }
}

export function subscribeManagedBrowserControlViewport(guest: WebContents, listener: () => void): () => void {
    const entry = managedPresentations.get(guest.id)
    if (!entry) return () => {}
    entry.retainedForAgent = true
    entry.controlViewportListeners.add(listener)
    return () => { entry.controlViewportListeners.delete(listener) }
}

export function isManagedBrowserRetainedForAgent(guest: WebContents): boolean {
    return managedPresentations.get(guest.id)?.retainedForAgent === true
}

export function getManagedBrowserControlViewport(guest: WebContents) {
    return managedPresentations.get(guest.id)?.controlViewport
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
