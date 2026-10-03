import type { AssistantPluginCatalog, AssistantPluginDownload, AssistantPluginInspection } from '@shared/assistant/contracts'
import { connectReviewedPlugin, type PluginInstallConnectApi } from './plugin-install-connect'
import { getReviewedCatalogPluginSelection } from './plugin-directory-state'

type Result<T = object> = ({ success: true } & T) | { success: false; error?: string }
export interface PluginDownloadApi extends PluginInstallConnectApi {
    startPluginDownload(input: { name: string }): Promise<Result<{ download: AssistantPluginDownload }>>
    getPluginDownload(input: { id: string }): Promise<Result<{ download: AssistantPluginDownload }>>
    cancelPluginDownload(input: { id: string }): Promise<Result>
    installInspectedPlugin?(input: { reviewId: string; confirmed: true }): Promise<Result<{ catalog: AssistantPluginCatalog }>>
}
export interface PluginDownloadState {
    phase: 'idle' | 'preparing' | 'ready' | 'installing' | 'connecting' | 'cancelling' | 'failed'
    name: string | null
    download?: AssistantPluginDownload
    error?: string
    installationRevision?: number
    installedName?: string
    installedPluginId?: string
    connectingServer?: string
    connectionRevision?: number
    connectionError?: string
}
type Operation = { id?: string; abort: AbortController; work: Promise<void>; cleanup?: Promise<void> }
const idle: PluginDownloadState = { phase: 'idle', name: null }
const message = (error: unknown) => error instanceof Error ? error.message : 'Could not prepare this Plugin.'

// Owned by one Desktop renderer window, not the Plugins route. Native main keeps
// authority over the bytes/review. Only an explicit Install click can request
// activation; navigation cannot cancel or approve a job.
export class PluginDownloadController {
    private state: PluginDownloadState = idle
    private operation: Operation | null = null
    private installationRevision = 0
    private connectionRevision = 0
    private listeners = new Set<() => void>()
    private expiry: ReturnType<typeof setTimeout> | undefined
    constructor(private api: () => PluginDownloadApi, private pollMs = 500, private now = Date.now) {}
    getSnapshot = () => this.state
    subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener) } }
    private set(state: PluginDownloadState) { this.state = { ...state, installationRevision: this.installationRevision, connectionRevision: this.connectionRevision }; for (const listener of this.listeners) listener() }

    async start(name: string, options?: { install: boolean; connect?: boolean }): Promise<void> {
        if (!name || ['preparing', 'ready', 'installing', 'connecting', 'cancelling'].includes(this.state.phase)) return
        if (this.operation) {
            await this.cancel()
            if (this.operation) return
        }
        const op: Operation = { abort: new AbortController(), work: Promise.resolve() }
        this.operation = op
        this.set({ phase: 'preparing', name })
        op.work = this.prepare(op, name, options?.install === true, options?.connect === true)
        await op.work
    }

    private async prepare(op: Operation, name: string, install: boolean, connect: boolean): Promise<void> {
        let ready = false
        try {
            const started = await this.api().startPluginDownload({ name })
            if (!started.success) throw Error(started.error || 'Could not start this download.')
            op.id = started.download.id
            const deadline = this.now() + 150_000
            while (!op.abort.signal.aborted && this.operation === op && this.now() < deadline) {
                const result = await this.api().getPluginDownload({ id: op.id })
                if (op.abort.signal.aborted || this.operation !== op) return
                if (!result.success) throw Error(result.error || 'Could not check this download.')
                const download = result.download
                if (download.status === 'failed') throw Error(download.error || 'Plugin download failed.')
                if (download.status === 'ready') {
                    if (!download.inspection || !(Date.parse(download.inspection.expiresAt) > this.now())) throw Error('This review expired. Try again.')
                    ready = true
                    this.set({ phase: 'ready', name, download })
                    if (install) {
                        const inspection = this.claimReview()
                        if (!inspection) throw Error('This review expired. Try again.')
                        try {
                            const api = this.api()
                            if (!api.installInspectedPlugin) throw Error('Restart Zyra Desktop to install this Plugin.')
                            const result = await api.installInspectedPlugin({ reviewId: inspection.reviewId, confirmed: true })
                            if (!result.success) throw Error(result.error || 'Could not install this Plugin.')
                            this.finishInstall()
                            if (connect) await this.finishConnection(result.catalog, name, inspection)
                        } catch (error) { this.finishInstall(`${message(error)} Try again.`) }
                        return
                    }
                    this.expiry = setTimeout(() => {
                        if (this.operation !== op || this.state.phase !== 'ready') return
                        this.set({ phase: 'failed', name, error: 'This review expired. Try again.' })
                        void this.release(op).catch(() => undefined)
                    }, Math.max(1, Date.parse(download.inspection.expiresAt) - this.now()))
                    return
                }
                this.set({ phase: 'preparing', name, download })
                await this.wait(op.abort.signal)
            }
            if (!op.abort.signal.aborted) throw Error('Plugin preparation timed out. Try again.')
        } catch (error) {
            if (!op.abort.signal.aborted && this.operation === op) this.set({ phase: 'failed', name, error: message(error) })
        } finally {
            if (!ready || op.abort.signal.aborted) {
                try { await this.release(op) }
                catch (error) { if (this.operation === op) this.set({ phase: 'failed', name, error: message(error) }) }
            }
        }
    }

    private async finishConnection(catalog: AssistantPluginCatalog, name: string, inspection: AssistantPluginInspection): Promise<void> {
        const selection = getReviewedCatalogPluginSelection(catalog, name, inspection)
        const installedPluginId = selection?.pluginId
        this.set({ phase: 'connecting', name, installedName: name, installedPluginId })
        let connectionError: string | undefined
        try {
            await connectReviewedPlugin(this.api(), catalog, name, inspection, connectingServer => {
                this.set({ ...this.state, connectingServer })
            })
        } catch (error) { connectionError = message(error) }
        this.connectionRevision += 1
        this.set({ ...idle, installedName: name, installedPluginId, ...(connectionError ? { connectionError } : {}) })
    }

    private wait(signal: AbortSignal): Promise<void> {
        return new Promise(resolve => {
            const finish = () => { clearTimeout(timer); signal.removeEventListener('abort', finish); resolve() }
            const timer = setTimeout(finish, this.pollMs)
            signal.addEventListener('abort', finish, { once: true })
            if (signal.aborted) finish()
        })
    }

    private release(op: Operation): Promise<void> {
        if (!op.id) return Promise.resolve()
        if (!op.cleanup) {
            op.cleanup = this.api().cancelPluginDownload({ id: op.id }).then(result => {
                if (!result.success && result.error !== 'Plugin download is missing or expired. Try again.') throw Error(result.error || 'Could not cancel this download.')
            }).catch(error => { op.cleanup = undefined; throw error })
        }
        return op.cleanup
    }

    async cancel(): Promise<void> {
        if (['installing', 'connecting'].includes(this.state.phase)) return
        clearTimeout(this.expiry)
        const op = this.operation
        if (!op) { this.set(idle); return }
        op.abort.abort()
        this.set({ ...this.state, phase: 'cancelling' })
        try {
            // Abort native work promptly; a late start response is cleaned by prepare.
            await this.release(op)
            await op.work
            await this.release(op)
            if (this.operation === op) { this.operation = null; this.set(idle) }
        } catch (error) {
            if (this.operation === op) this.set({ ...this.state, phase: 'failed', error: message(error) })
        }
    }

    claimReview(): AssistantPluginInspection | null {
        const inspection = this.state.download?.inspection
        if (this.state.phase !== 'ready' || !inspection) return null
        if (!(Date.parse(inspection.expiresAt) > this.now())) {
            this.set({ ...this.state, phase: 'failed', error: 'This review expired. Try again.' })
            return null
        }
        clearTimeout(this.expiry)
        this.set({ ...this.state, phase: 'installing' })
        return inspection
    }

    finishInstall(error?: string): void {
        if (this.state.phase !== 'installing') return
        const op = this.operation
        const installedName = this.state.name || undefined
        clearTimeout(this.expiry)
        if (!error) { this.operation = null; this.installationRevision += 1 }
        this.set(error ? { phase: 'failed', name: this.state.name, error } : { ...idle, installedName })
        if (op) void this.release(op).catch(cause => {
            if (error && this.operation === op && this.state.phase === 'failed') this.set({ ...this.state, error: `${error} ${message(cause)}` })
        })
    }
}

export const pluginDownloadController = new PluginDownloadController(() => window.devscope.assistant)
