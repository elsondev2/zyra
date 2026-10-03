import { randomUUID } from 'node:crypto'
import { chromeWebStoreIdFromUrl, type WebStoreInstallPresentation, type WebStoreInstallState } from '../shared/browser-web-store'
import type { BrowserExtensionRecord } from '../shared/browser-extensions'

type InstallTarget = { url: string; document: number; available: boolean }
type Installer = {
    inspectWebStore(id: string): Promise<BrowserExtensionRecord>
    approveWebStore(id: string): Promise<BrowserExtensionRecord>
    discardWebStore(id: string): Promise<void>
}
type Options = {
    current(): InstallTarget
    installer: Installer
    present(value: WebStoreInstallPresentation | null): Promise<void>
    confirm(extension: BrowserExtensionRecord): Promise<boolean>
    reportError(message: string): Promise<void>
}

/** No page IPC or filesystem authority. A single-use request belongs to one exact listing/document. */
export class BrowserWebStoreInstall {
    private offer?: { id: string; document: number; requestUrl: string; state: WebStoreInstallState }
    private busy = false
    constructor(private readonly options: Options) {}

    async refresh(): Promise<void> {
        const target = this.options.current()
        const id = target.available ? chromeWebStoreIdFromUrl(target.url) : null
        if (!id) { this.offer = undefined; await this.options.present(null); return }
        if (this.offer?.id !== id || this.offer.document !== target.document) {
            this.offer = { id, document: target.document, requestUrl: `zyra-extension://install/${id}?request=${randomUUID()}`, state: 'ready' }
        }
        await this.options.present({ ...this.offer })
    }

    async request(url: string): Promise<void> {
        const offer = this.offer
        const ownsDocument = () => {
            const current = this.options.current()
            return current.available && this.offer === offer && current.document === offer?.document && chromeWebStoreIdFromUrl(current.url) === offer?.id
        }
        if (!offer || this.busy || url !== offer.requestUrl || !ownsDocument() || !['ready', 'error'].includes(offer.state)) return
        this.busy = true
        // Consume the request before any asynchronous work. Retrying gets a fresh token.
        offer.requestUrl = `zyra-extension://install/${offer.id}?request=${randomUUID()}`
        let pending = false
        const present = async (state: WebStoreInstallState) => {
            offer.state = state
            if (ownsDocument()) await this.options.present({ ...offer })
        }
        try {
            await present('downloading')
            if (!ownsDocument()) return
            const review = await this.options.installer.inspectWebStore(offer.id)
            pending = true
            if (!ownsDocument()) return
            await present('reviewing')
            if (!ownsDocument()) return
            const approved = await this.options.confirm(review)
            if (!ownsDocument()) return
            if (!approved) { await present('ready'); return }
            await this.options.installer.approveWebStore(offer.id)
            pending = false
            await present('installed')
        } catch (error) {
            await present('error')
            if (ownsDocument()) await this.options.reportError(error instanceof Error ? error.message : 'The extension could not be installed.')
        } finally {
            if (pending) await this.options.installer.discardWebStore(offer.id).catch(() => undefined)
            this.busy = false
        }
    }
}
