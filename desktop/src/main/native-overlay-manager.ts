import { randomUUID } from 'node:crypto'
import { BrowserWindow, WebContentsView, dialog, screen, type IpcMainInvokeEvent, type WebContents, type WindowOpenHandlerResponse, type HandlerDetails } from 'electron'
import { ipcMain } from './ipc/trusted-ipc'
import { addNativeWindowView } from './native-view-layers'
import { NATIVE_OVERLAY_FRAME_PREFIX, NATIVE_OVERLAY_IPC as IPC, type NativeOverlayDismissReason, type NativeOverlayKind, type NativeOverlayVisibility } from '../shared/contracts/native-overlay'

type OverlaySlot = {
    kind: NativeOverlayKind
    view: WebContentsView | null
    companion: BrowserWindow | null
    contents: WebContents | null
    frameName: string | null
    armedUntil: number
    frame: WebContents['mainFrame'] | null
    revision: number
    visible: boolean
    focus: boolean
}
type Owner = {
    window: BrowserWindow
    contents: WebContents
    slots: Record<NativeOverlayKind, OverlaySlot>
    recovery: Promise<boolean> | null
    cancelRecovery: (() => void) | null
    dispose: () => void
}
const isKind = (kind: unknown): kind is NativeOverlayKind => kind === 'interactive' || kind === 'passive'
const createSlot = (kind: NativeOverlayKind): OverlaySlot => ({ kind, view: null, companion: null, contents: null, frameName: null, armedUntil: 0, frame: null, revision: -1, visible: false, focus: false })

/** Native portal documents share their trusted opener's React ownership, never its IPC authority. */
export class NativeOverlayManager {
    private readonly owners = new Map<number, Owner>()
    private watchingDisplays = false
    private readonly displayMetricsChanged = () => {
        for (const owner of this.owners.values()) for (const slot of Object.values(owner.slots)) this.resize(owner, slot)
    }

    constructor(private readonly options: { showRecoveryDialog?: (owner: BrowserWindow) => Promise<boolean> } = {}) {}

    registerIpc(): void {
        ipcMain.handle(IPC.prepare, (event, input: { kind?: unknown } | null) => {
            const owner = this.ownerFor(event)
            if (!owner || !isKind(input?.kind)) return { success: false, error: 'This window cannot open an app overlay.' }
            const slot = owner.slots[input.kind]
            if (!slot.contents) {
                slot.frameName = NATIVE_OVERLAY_FRAME_PREFIX + input.kind + '-' + randomUUID()
                slot.armedUntil = Date.now() + 5_000
                slot.frame = event.sender.mainFrame
            }
            return { success: true, frameName: slot.frameName }
        })
        ipcMain.handle(IPC.visibility, (event, input: NativeOverlayVisibility) => {
            const owner = this.ownerFor(event)
            if (!owner || !input || !isKind(input.kind)) return { success: false }
            const slot = owner.slots[input.kind]
            if (!slot.contents || input.frameName !== slot.frameName || typeof input.visible !== 'boolean'
                || !Number.isSafeInteger(input.revision) || input.revision < 0
                || input.revision <= slot.revision) return { success: false }
            slot.revision = input.revision
            slot.visible = input.visible
            slot.focus = input.focus === true
            this.present(owner, slot)
            return { success: true }
        })
        ipcMain.handle(IPC.recover, async (event, input: { kind?: unknown } | null) => {
            const owner = this.ownerFor(event)
            if (!owner || !isKind(input?.kind)) return { success: false }
            const recoveryFrameName = owner.slots[input.kind].frameName
            if (!owner.recovery) {
                const cancelled = new Promise<boolean>(resolve => { owner.cancelRecovery = () => resolve(false) })
                const show = this.options.showRecoveryDialog
                    ? this.options.showRecoveryDialog(owner.window)
                    : dialog.showMessageBox(owner.window, {
                        type: 'error', title: 'Zyra', message: 'App controls could not open.',
                        detail: 'Try opening them again.', buttons: ['Retry', 'Close'], defaultId: 0, cancelId: 1
                    }).then(result => result.response === 0)
                owner.recovery = Promise.race([show.catch(() => false), cancelled]).finally(() => {
                    owner.recovery = null
                    owner.cancelRecovery = null
                })
            }
            const retry = await owner.recovery
            if (retry && !owner.window.isDestroyed() && owner.slots[input.kind].frameName === recoveryFrameName) this.closeSlot(owner, owner.slots[input.kind], true)
            return { success: true, retry: retry && !owner.window.isDestroyed() }
        })
    }

    registerOwner(window: BrowserWindow): void {
        if (this.owners.has(window.webContents.id)) return
        if (!this.watchingDisplays) { screen.on('display-metrics-changed', this.displayMetricsChanged); this.watchingDisplays = true }
        const contents = window.webContents
        const owner: Owner = { window, contents, slots: { interactive: createSlot('interactive'), passive: createSlot('passive') }, recovery: null, cancelRecovery: null, dispose: () => {} }
        this.owners.set(contents.id, owner)
        const resize = () => { for (const slot of Object.values(owner.slots)) this.resize(owner, slot) }
        const focus = () => { for (const slot of Object.values(owner.slots)) this.present(owner, slot) }
        const blur = () => {
            for (const slot of Object.values(owner.slots)) {
                this.present(owner, slot, false)
                if (slot.visible) this.notify(owner, slot, 'blur')
            }
        }
        const reset = () => {
            owner.cancelRecovery?.()
            for (const slot of Object.values(owner.slots)) { this.closeSlot(owner, slot, true); slot.revision = -1 }
        }
        const navigation = (_event: unknown, _url: string, inPlace: boolean, mainFrame: boolean) => { if (mainFrame && !inPlace) reset() }
        const destroyed = () => {
            owner.cancelRecovery?.()
            owner.dispose()
            this.owners.delete(contents.id)
            for (const slot of Object.values(owner.slots)) this.closeSlot(owner, slot, false)
        }
        window.on('resize', resize)
        window.on('move', resize)
        window.on('focus', focus)
        window.on('blur', blur)
        window.on('hide', blur)
        window.on('minimize', blur)
        window.once('closed', destroyed)
        contents.on('did-start-navigation', navigation)
        contents.on('render-process-gone', reset)
        contents.on('zoom-changed', resize)
        contents.once('destroyed', destroyed)
        owner.dispose = () => {
            window.removeListener('resize', resize)
            window.removeListener('move', resize)
            window.removeListener('focus', focus)
            window.removeListener('blur', blur)
            window.removeListener('hide', blur)
            window.removeListener('minimize', blur)
            window.removeListener('closed', destroyed)
            contents.removeListener('did-start-navigation', navigation)
            contents.removeListener('render-process-gone', reset)
            contents.removeListener('zoom-changed', resize)
            contents.removeListener('destroyed', destroyed)
        }
    }

    /** Null leaves ordinary popups with the existing external/browser routing. */
    handleWindowOpen(window: BrowserWindow, details: HandlerDetails): WindowOpenHandlerResponse | null {
        if (!details.frameName.startsWith(NATIVE_OVERLAY_FRAME_PREFIX)) return null
        const owner = this.owners.get(window.webContents.id)
        const slot = owner && Object.values(owner.slots).find(entry => entry.frameName === details.frameName)
        if (!owner || !slot || owner.window !== window || slot.contents || owner.contents.isDestroyed()
            || details.url !== 'about:blank' || slot.armedUntil < Date.now()
            || slot.frame !== owner.contents.mainFrame) return { action: 'deny' }
        slot.armedUntil = 0
        return {
            action: 'allow', outlivesOpener: false,
            createWindow: options => {
                // Electron's custom-window contract passes the window.open WebContents
                // in options (documented in its example, omitted from its options type).
                const supplied = (options as typeof options & { webContents?: WebContents }).webContents
                if (!supplied || window.isDestroyed() || owner.contents.isDestroyed() || slot.contents) {
                    throw new Error('The app overlay owner closed before creation.')
                }
                if (slot.kind === 'interactive') {
                    const view = new WebContentsView({ webContents: supplied, webPreferences: options.webPreferences })
                    slot.view = view
                    slot.contents = view.webContents
                    view.setBackgroundColor('#00000000')
                    view.setVisible(false)
                    addNativeWindowView(window, view, 'overlay')
                } else {
                    // A WebContentsView cannot ignore native mouse input.
                    const companion = new BrowserWindow({ ...options, parent: window, show: false,
                        frame: false, transparent: true, backgroundColor: '#00000000',
                        focusable: false, skipTaskbar: true, hasShadow: false, resizable: false,
                        minimizable: false, maximizable: false, fullscreenable: false, title: 'Zyra overlay' })
                    if (companion.webContents !== supplied) {
                        companion.destroy()
                        throw new Error('Electron did not adopt the passive overlay document.')
                    }
                    slot.companion = companion
                    slot.contents = companion.webContents
                    companion.setMenu(null)
                    companion.setIgnoreMouseEvents(true, { forward: true })
                }
                this.resize(owner, slot)
                const contents = slot.contents
                contents.setWindowOpenHandler(() => ({ action: 'deny' }))
                contents.on('will-navigate', event => event.preventDefault())
                contents.on('will-frame-navigate', event => event.preventDefault())
                contents.on('will-attach-webview', event => event.preventDefault())
                contents.on('content-bounds-updated', event => event.preventDefault())
                const lost = () => { if (slot.contents === contents) this.closeSlot(owner, slot, true) }
                contents.once('render-process-gone', lost)
                contents.once('destroyed', lost)
                return contents
            }
        }
    }

    private ownerFor(event: IpcMainInvokeEvent): Owner | undefined {
        const owner = this.owners.get(event.sender.id)
        return owner && owner.contents === event.sender && !owner.window.isDestroyed()
            && event.senderFrame === event.sender.mainFrame ? owner : undefined
    }

    private resize(owner: Owner, slot: OverlaySlot): void {
        if (!slot.contents || owner.window.isDestroyed()) return
        const bounds = owner.window.getContentBounds()
        slot.contents.setZoomFactor(owner.contents.getZoomFactor())
        slot.view?.setBounds({ x: 0, y: 0, width: bounds.width, height: bounds.height })
        slot.companion?.setBounds(bounds, false)
    }

    private present(owner: Owner, slot: OverlaySlot, allowed = owner.window.isFocused() && owner.window.isVisible() && !owner.window.isMinimized()): void {
        if (!slot.contents || slot.contents.isDestroyed()) return
        const visible = slot.visible && (slot.kind === 'interactive' || allowed)
        if (visible) this.resize(owner, slot)
        if (slot.view) {
            if (visible) addNativeWindowView(owner.window, slot.view, 'overlay')
            const changed = slot.view.getVisible() !== visible
            const heldFocus = slot.contents.isFocused()
            if (changed) slot.view.setVisible(visible)
            if (changed && visible && slot.focus && owner.window.isFocused()) slot.contents.focus()
            else if (changed && !visible && heldFocus && allowed && !owner.contents.isDestroyed()) owner.contents.focus()
        } else if (slot.companion) {
            if (visible && !slot.companion.isVisible()) slot.companion.showInactive()
            else if (!visible && slot.companion.isVisible()) slot.companion.hide()
        }
    }

    private notify(owner: Owner, slot: OverlaySlot, reason: NativeOverlayDismissReason, frameName = slot.frameName): void {
        if (frameName && !owner.contents.isDestroyed()) owner.contents.send(IPC.dismissed, { kind: slot.kind, frameName, reason })
    }

    private closeSlot(owner: Owner, slot: OverlaySlot, notify: boolean): void {
        const { view, companion, contents, frameName } = slot
        slot.view = null
        slot.companion = null
        slot.contents = null
        slot.frameName = null
        slot.frame = null
        slot.armedUntil = 0
        slot.visible = false
        // Keep revisions across child loss; an old queued show must not revive it.
        if (view && !owner.window.isDestroyed()) owner.window.contentView.removeChildView(view)
        if (companion && !companion.isDestroyed()) companion.destroy()
        else if (contents && !contents.isDestroyed()) contents.close()
        if (contents && notify) this.notify(owner, slot, 'closed', frameName)
    }

    dispose(): void {
        if (this.watchingDisplays) screen.removeListener('display-metrics-changed', this.displayMetricsChanged)
        this.watchingDisplays = false
        ipcMain.removeHandler(IPC.prepare)
        ipcMain.removeHandler(IPC.visibility)
        ipcMain.removeHandler(IPC.recover)
        for (const owner of this.owners.values()) {
            owner.cancelRecovery?.()
            owner.dispose()
            for (const slot of Object.values(owner.slots)) this.closeSlot(owner, slot, false)
        }
        this.owners.clear()
    }
}
