import { initializeNativeOverlayDocument, type NativeOverlayDocument } from './native-overlay-document'
import { getOverlayActiveElement, getOverlayEventDocuments, registerOverlayDocument } from './native-overlay-events'
import { dismissTransientMenus } from '@/lib/transient-menu'
import type { NativeOverlayApi, NativeOverlayKind } from '@shared/contracts/native-overlay'

type Kind = NativeOverlayKind
type NativeOverlayBridge = Pick<NativeOverlayApi, 'prepareNativeOverlay' | 'setNativeOverlayVisible'> & Partial<Pick<NativeOverlayApi, 'onNativeOverlayDismiss' | 'recoverNativeOverlay'>>
interface Surface { window: Window; frameName: string; document: NativeOverlayDocument; unregister: () => void }
export interface NativeOverlayLease {
    ready: Promise<HTMLElement | null>
    present: () => Promise<boolean>
    release: () => void
}

function bridge(): NativeOverlayBridge | null {
    if (typeof window === 'undefined') return null
    const api = window.devscope as unknown as Partial<NativeOverlayBridge> | undefined
    return api?.prepareNativeOverlay && api.setNativeOverlayVisible ? api as NativeOverlayBridge : null
}
export function supportsNativeOverlay(): boolean { return Boolean(bridge()) }

function dismissCallers() {
    dismissTransientMenus()
    for (const document of getOverlayEventDocuments()) {
        const KeyboardEvent = document.defaultView?.KeyboardEvent
        if (KeyboardEvent) document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
    }
}

class NativeOverlayHost {
    private surface: Surface | null = null
    private pending: Promise<Surface | null> | null = null
    private pendingGeneration = 0
    private pendingFrameName: string | null = null
    private revision = Date.now() * 1000
    private visibility = false
    private visibilityPending: Promise<void> | null = null
    private hideFrame = 0
    private restoreFocus: HTMLElement | null = null
    private leases = new Set<symbol>()
    private presented = new Set<symbol>()
    private suspended = new Set<symbol>()
    private hasPresented = () => [...this.presented].some(id => !this.suspended.has(id))
    private changes = new Set<() => void>()
    private generation = 0
    private disposed = false

    constructor(readonly kind: Kind) {}
    snapshot = () => this.generation
    subscribe = (listener: () => void) => { this.changes.add(listener); return () => { this.changes.delete(listener) } }
    matches = (frameName: string) => this.surface?.frameName === frameName || (!this.surface && this.pendingFrameName === frameName)

    private async setVisible(visible: boolean): Promise<void> {
        if (this.visibility === visible) { await this.visibilityPending; return }
        this.visibility = visible
        const api = bridge()
        const frameName = this.surface?.frameName
        if (api && frameName) {
            const request = api.setNativeOverlayVisible({ kind: this.kind, frameName, visible, revision: ++this.revision, focus: false }).then(result => {
                if (!this.matches(frameName)) return
                if (!result.success) {
                    this.visibility = false
                    throw new Error('Native overlay visibility was rejected')
                }
            })
            this.visibilityPending = request
            try { await request } finally { if (this.visibilityPending === request) this.visibilityPending = null }
        }
    }

    invalidate = () => {
        const child = this.surface?.window
        this.surface?.unregister()
        this.surface?.document.dispose()
        this.surface = null
        this.pendingFrameName = null
        if (child && !child.closed) child.close()
        this.visibility = false
        this.generation++
        for (const listener of this.changes) listener()
    }

    private getSurface(): Promise<Surface | null> {
        if (this.surface && !this.surface.window.closed) return Promise.resolve(this.surface)
        if (this.pending) {
            if (this.pendingGeneration === this.generation) return this.pending
            return this.pending.catch(() => null).then(() => this.leases.size && !this.disposed ? this.getSurface() : null)
        }
        const api = bridge()
        if (!api) return Promise.resolve(null)
        const generation = this.generation
        this.pendingGeneration = generation
        const attempt = async (): Promise<Surface> => {
            let cancelled = false
            let created: Surface | undefined
            let timer: ReturnType<typeof setTimeout>
            const operation = async () => {
                const prepared = await api.prepareNativeOverlay({ kind: this.kind })
                if (cancelled || this.disposed || generation !== this.generation || !this.leases.size) throw new Error('Overlay preparation cancelled')
                if (!prepared.success) throw new Error(prepared.error || 'Native overlay was not prepared')
                this.pendingFrameName = prepared.frameName
                const child = window.open('about:blank', prepared.frameName)
                if (!child) throw new Error('Native overlay window was unavailable')
                const document = initializeNativeOverlayDocument(window.document, child.document)
                const unregister = this.kind === 'interactive' ? registerOverlayDocument(child.document) : () => {}
                created = { window: child, frameName: prepared.frameName, document, unregister }
                await document.ready
                if (cancelled || this.disposed || generation !== this.generation || !this.leases.size || child.closed) throw new Error('Overlay document unavailable')
                this.surface = created
                return created
            }
            try {
                return await Promise.race([operation(), new Promise<never>((_, reject) => {
                    timer = setTimeout(() => reject(new Error('Native overlay preparation timed out')), 8000)
                })])
            } catch (error) {
                cancelled = true
                created?.unregister()
                created?.document.dispose()
                if (this.pendingFrameName === created?.frameName) this.pendingFrameName = null
                if (created && !created.window.closed) created.window.close()
                throw error
            } finally { clearTimeout(timer!) }
        }
        const request = (async () => {
            installDismissListener(api)
            while (!this.disposed) {
                let failure: unknown
                for (let count = 0; count < 2; count++) {
                    try { return await attempt() } catch (error) { failure = error }
                    if (!this.leases.size || this.disposed || generation !== this.generation) return null
                }
                if (!api.recoverNativeOverlay) throw failure
                const decision = await api.recoverNativeOverlay({ kind: this.kind })
                if (this.disposed || !this.leases.size || generation !== this.generation) return null
                if (decision.success && decision.retry) continue
                dismissCallers()
                return null
            }
            return null
        })().finally(() => { if (this.pending === request) { this.pending = null; this.pendingFrameName = null } })
        this.pending = request
        return request
    }

    /** A lease remains held while React runs existing exit animations and nested content. */
    acquire(): NativeOverlayLease {
        const id = Symbol('native-overlay')
        this.leases.add(id)
        cancelAnimationFrame(this.hideFrame)
        if (this.leases.size === 1 && this.kind === 'interactive') this.restoreFocus = getOverlayActiveElement()
        return {
            ready: this.getSurface().then(value => this.leases.has(id) ? value?.document.container ?? null : null),
            present: async () => {
                if (!this.leases.has(id) || !this.surface) return false
                const presentingFrameName = this.surface.frameName
                this.presented.add(id)
                if (this.suspended.has(id)) return true
                cancelAnimationFrame(this.hideFrame)
                try { await this.setVisible(true); return true }
                catch (error) {
                    const api = bridge()
                    if (!api?.recoverNativeOverlay) throw error
                    const decision = await api.recoverNativeOverlay({ kind: this.kind })
                    if (decision.success && decision.retry && this.leases.has(id)) {
                        if (this.matches(presentingFrameName)) this.invalidate()
                    }
                    else dismissCallers()
                    return false
                }
            },
            release: () => {
                if (!this.leases.delete(id)) return
                this.presented.delete(id)
                if (this.hasPresented()) return
                cancelAnimationFrame(this.hideFrame)
                this.hideFrame = requestAnimationFrame(() => {
                    if (this.hasPresented()) return
                    const ownedFocus = this.surface?.window.document.hasFocus() === true
                    void this.setVisible(false).then(() => {
                        if (this.hasPresented() || this.kind !== 'interactive') return
                        const active = document.activeElement
                        if (ownedFocus && document.hasFocus() && (active === document.body || active === this.restoreFocus) && this.restoreFocus?.isConnected) this.restoreFocus.focus({ preventScroll: true })
                        this.restoreFocus = null
                    }).catch(error => console.error('Native overlay dismissal failed', error))
                })
            }
        }
    }

    /** Temporarily move existing modal surfaces behind an owned Browser view.
     * New leases (such as a link chooser) can still present normally.
     */
    suspendCurrentPresentation(): () => void {
        const ids = [...this.leases].filter(id => !this.suspended.has(id))
        for (const id of ids) this.suspended.add(id)
        cancelAnimationFrame(this.hideFrame)
        if (!this.hasPresented()) void this.setVisible(false).catch(error => console.error('Overlay suspension failed', error))
        let restored = false
        return () => {
            if (restored) return
            restored = true
            for (const id of ids) this.suspended.delete(id)
            if (!this.disposed && this.hasPresented()) void this.setVisible(true).catch(error => console.error('Overlay restoration failed', error))
        }
    }

    dispose() {
        this.disposed = true
        cancelAnimationFrame(this.hideFrame)
        this.leases.clear()
        this.presented.clear()
        const child = this.surface?.window
        this.surface?.unregister()
        this.surface?.document.dispose()
        this.surface = null
        if (child && !child.closed) child.close()
    }
}

const hosts = { interactive: new NativeOverlayHost('interactive'), passive: new NativeOverlayHost('passive') }
let removeDismiss: (() => void) | undefined
function installDismissListener(api: NativeOverlayBridge) {
    if (removeDismiss) return
    removeDismiss = api.onNativeOverlayDismiss?.(({ kind, frameName, reason }) => {
        // Losing app focus dismisses transient callers through their blur listener, not dialogs.
        if (reason === 'closed' && hosts[kind].matches(frameName)) hosts[kind].invalidate()
    })
}
export function getNativeOverlayHost(passive = false) { return hosts[passive ? 'passive' : 'interactive'] }

function disposeHosts() {
    removeDismiss?.()
    for (const host of Object.values(hosts)) host.dispose()
}
if (typeof window !== 'undefined') window.addEventListener('beforeunload', disposeHosts, { once: true })
if (import.meta.hot) import.meta.hot.dispose(() => {
    window.removeEventListener('beforeunload', disposeHosts)
    disposeHosts()
})
