import { randomUUID } from 'node:crypto'
import { mkdir, rename, rm, stat, utimes } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { Worker } from 'node:worker_threads'
import log from 'electron-log'
import type {
    DevScopeBrowserThreatNavigationKind,
    DevScopeBrowserThreatWarning
} from '../shared/contracts/devscope-api'
import { hashBrowserThreatUrl, isBrowserThreatTestUrl } from './browser-threat-protection-policy'
import { resolveZyraRoot } from './zyra/zyra-root'

const DATABASE_MAX_BYTES = 50 * 1024 * 1024
const UPDATE_INTERVAL_MS = 12 * 60 * 60 * 1000
const INITIAL_UPDATE_DELAY_MS = 2_000
const DECISION_TTL_MS = 5 * 60 * 1000
const ALLOWANCE_TTL_MS = 30_000
const MAX_PENDING_DECISIONS = 32
const MAX_ALLOWANCES = 64

type NativeStatement = {
    get: (...params: unknown[]) => Record<string, unknown> | undefined
}

type NativeDatabase = {
    close: () => void
    exec: (sql: string) => void
    prepare: (sql: string) => NativeStatement
}

type SqliteModule = {
    DatabaseSync: new (path: string, options?: { readOnly?: boolean }) => NativeDatabase
}

type WorkerUpdateResult = {
    notModified: boolean
    entryCount?: number
    databaseBytes?: number
    updatedAt?: string
}

type PendingDecision = {
    ownerWebContentsId: number
    warning: DevScopeBrowserThreatWarning
    expiresAt: number
    proceed: () => void | Promise<void>
}

export type BrowserThreatNavigationInput = {
    ownerWebContentsId: number
    sourceGuestWebContentsId: number
    blockedGuestWebContentsId: number
    navigationKind: DevScopeBrowserThreatNavigationKind
    previousUrl: string
    url: string
    proceed: () => void | Promise<void>
}

export type BrowserThreatProtectionOptions = {
    userDataPath: string
    notify: (ownerWebContentsId: number, warning: DevScopeBrowserThreatWarning) => void
    autoUpdate?: boolean
    workerUrl?: URL
    now?: () => number
}

function allowanceKey(guestWebContentsId: number, hash: Buffer): string {
    return `${guestWebContentsId}:${hash.toString('hex')}`
}

export class BrowserThreatProtectionService {
    private readonly directoryPath: string
    private readonly databasePath: string
    private readonly nextDatabasePath: string
    private readonly backupDatabasePath: string
    private readonly notify: BrowserThreatProtectionOptions['notify']
    private readonly autoUpdate: boolean
    private readonly workerUrl: URL
    private readonly now: () => number
    private database: NativeDatabase | null = null
    private lookupStatement: NativeStatement | null = null
    private metadataStatement: NativeStatement | null = null
    private initialization: Promise<void> | null = null
    private updatePromise: Promise<void> | null = null
    private updateTimer: NodeJS.Timeout | null = null
    private activeWorker: Worker | null = null
    private disposed = false
    private readonly pendingDecisions = new Map<string, PendingDecision>()
    private readonly allowances = new Map<string, number>()
    private readonly ownerAllowances = new Map<string, number>()

    constructor(options: BrowserThreatProtectionOptions) {
        this.directoryPath = join(options.userDataPath, 'security')
        this.databasePath = join(this.directoryPath, 'browser-threats.sqlite')
        this.nextDatabasePath = join(this.directoryPath, 'browser-threats.next.sqlite')
        this.backupDatabasePath = join(this.directoryPath, 'browser-threats.backup.sqlite')
        this.notify = options.notify
        this.autoUpdate = options.autoUpdate !== false
        this.workerUrl = options.workerUrl || pathToFileURL(join(resolveZyraRoot(), 'src', 'browser-threat-feed-worker.mjs'))
        this.now = options.now || Date.now
    }

    start(): void {
        if (this.disposed || this.initialization) return
        this.initialization = this.initialize().catch((error) => {
            log.warn('[BrowserThreatProtection] Local protection could not start.', error)
        })
    }

    async ready(): Promise<void> {
        this.start()
        await this.initialization
    }

    checkUrl(rawUrl: string): boolean {
        return this.matchUrl(rawUrl) !== null
    }

    private matchUrl(rawUrl: string): 'phishtank' | 'test' | null {
        if (isBrowserThreatTestUrl(rawUrl)) return 'test'
        const statement = this.lookupStatement
        const hash = hashBrowserThreatUrl(rawUrl)
        if (!statement || !hash) return null
        try {
            return statement.get(hash) ? 'phishtank' : null
        } catch (error) {
            log.warn('[BrowserThreatProtection] Local URL lookup failed open.', error)
            return null
        }
    }

    blockNavigation(input: BrowserThreatNavigationInput): DevScopeBrowserThreatWarning | null {
        const source = this.matchUrl(input.url)
        if (!source) return null
        this.pruneEphemeralState()
        while (this.pendingDecisions.size >= MAX_PENDING_DECISIONS) {
            const oldest = this.pendingDecisions.keys().next().value
            if (!oldest) break
            this.pendingDecisions.delete(oldest)
        }
        const canonical = new URL(input.url)
        canonical.hash = ''
        const decisionId = randomUUID()
        const warning: DevScopeBrowserThreatWarning = {
            decisionId,
            url: canonical.toString(),
            hostname: canonical.hostname,
            threatType: 'phishing',
            source,
            sourceGuestWebContentsId: input.sourceGuestWebContentsId,
            blockedGuestWebContentsId: input.blockedGuestWebContentsId,
            navigationKind: input.navigationKind,
            previousUrl: input.previousUrl,
            blockedAt: new Date(this.now()).toISOString()
        }
        this.pendingDecisions.set(decisionId, {
            ownerWebContentsId: input.ownerWebContentsId,
            warning,
            expiresAt: this.now() + DECISION_TTL_MS,
            proceed: input.proceed
        })
        this.notify(input.ownerWebContentsId, warning)
        return warning
    }

    async proceed(ownerWebContentsId: number, decisionId: string): Promise<void> {
        this.pruneEphemeralState()
        const decision = this.pendingDecisions.get(decisionId)
        if (!decision || decision.ownerWebContentsId !== ownerWebContentsId) {
            throw new Error('This blocked navigation is no longer available.')
        }
        this.pendingDecisions.delete(decisionId)
        const hash = hashBrowserThreatUrl(decision.warning.url)
        if (hash) {
            const key = allowanceKey(decision.warning.blockedGuestWebContentsId, hash)
            this.allowances.set(key, this.now() + ALLOWANCE_TTL_MS)
            while (this.allowances.size > MAX_ALLOWANCES) {
                const oldest = this.allowances.keys().next().value
                if (!oldest) break
                this.allowances.delete(oldest)
            }
            const opensNewGuest = decision.warning.navigationKind === 'new-tab'
                || (decision.warning.navigationKind === 'popup'
                    && decision.warning.blockedGuestWebContentsId === decision.warning.sourceGuestWebContentsId)
            if (opensNewGuest) {
                this.ownerAllowances.set(allowanceKey(ownerWebContentsId, hash), this.now() + ALLOWANCE_TTL_MS)
                while (this.ownerAllowances.size > MAX_ALLOWANCES) {
                    const oldest = this.ownerAllowances.keys().next().value
                    if (!oldest) break
                    this.ownerAllowances.delete(oldest)
                }
            }
        }
        try {
            await decision.proceed()
        } catch (error) {
            if (hash) {
                this.allowances.delete(allowanceKey(decision.warning.blockedGuestWebContentsId, hash))
                this.ownerAllowances.delete(allowanceKey(ownerWebContentsId, hash))
            }
            throw error
        }
    }

    dismiss(ownerWebContentsId: number, decisionId: string): void {
        this.pruneEphemeralState()
        const decision = this.pendingDecisions.get(decisionId)
        if (!decision || decision.ownerWebContentsId !== ownerWebContentsId) {
            throw new Error('This blocked navigation is no longer available.')
        }
        this.pendingDecisions.delete(decisionId)
    }

    transferGuestOwner(guestWebContentsId: number, previousOwnerWebContentsId: number, ownerWebContentsId: number): void {
        this.pruneEphemeralState()
        for (const decision of this.pendingDecisions.values()) {
            if (decision.ownerWebContentsId !== previousOwnerWebContentsId) continue
            if (decision.warning.sourceGuestWebContentsId !== guestWebContentsId && decision.warning.blockedGuestWebContentsId !== guestWebContentsId) continue
            decision.ownerWebContentsId = ownerWebContentsId
            try { this.notify(ownerWebContentsId, decision.warning) } catch (error) {
                log.debug('[BrowserThreatProtection] Could not republish a transferred warning.', error)
            }
        }
    }

    consumeOneTimeAllowance(guestWebContentsId: number, rawUrl: string): boolean {
        this.pruneEphemeralState()
        const hash = hashBrowserThreatUrl(rawUrl)
        if (!hash) return false
        const key = allowanceKey(guestWebContentsId, hash)
        const expiresAt = this.allowances.get(key)
        if (!expiresAt || expiresAt <= this.now()) return false
        this.allowances.delete(key)
        return true
    }

    consumeOneTimeOwnerAllowance(ownerWebContentsId: number, rawUrl: string): boolean {
        this.pruneEphemeralState()
        const hash = hashBrowserThreatUrl(rawUrl)
        if (!hash) return false
        const key = allowanceKey(ownerWebContentsId, hash)
        const expiresAt = this.ownerAllowances.get(key)
        if (!expiresAt || expiresAt <= this.now()) return false
        this.ownerAllowances.delete(key)
        return true
    }

    async refreshNow(): Promise<void> {
        await this.ready()
        await this.updateDatabase(true)
    }

    async dispose(): Promise<void> {
        this.disposed = true
        if (this.updateTimer) clearTimeout(this.updateTimer)
        this.updateTimer = null
        const worker = this.activeWorker
        this.activeWorker = null
        if (worker) await worker.terminate().catch(() => 0)
        await this.updatePromise?.catch(() => undefined)
        this.closeDatabase()
        this.pendingDecisions.clear()
        this.allowances.clear()
        this.ownerAllowances.clear()
    }

    private async initialize(): Promise<void> {
        await mkdir(this.directoryPath, { recursive: true })
        await this.recoverDatabaseFiles()
        const hasExistingDatabase = await stat(this.databasePath).then(() => true, () => false)
        if (hasExistingDatabase) {
            await this.openDatabase().catch((error) => {
                log.warn('[BrowserThreatProtection] Existing local database was ignored.', error)
            })
        }
        if (!this.autoUpdate || this.disposed) return
        this.updateTimer = setTimeout(() => {
            this.updateTimer = null
            void this.updateDatabase(false)
        }, INITIAL_UPDATE_DELAY_MS)
        this.updateTimer.unref?.()
    }

    private async recoverDatabaseFiles(): Promise<void> {
        await rm(this.nextDatabasePath, { force: true }).catch(() => undefined)
        const currentExists = await stat(this.databasePath).then(() => true, () => false)
        const backupExists = await stat(this.backupDatabasePath).then(() => true, () => false)
        if (!currentExists && backupExists) {
            await rename(this.backupDatabasePath, this.databasePath)
        } else if (backupExists) {
            await rm(this.backupDatabasePath, { force: true })
        }
    }

    private async openDatabase(): Promise<void> {
        const databaseStat = await stat(this.databasePath)
        if (databaseStat.size > DATABASE_MAX_BYTES) throw new Error('Local phishing database exceeds its disk budget.')
        const moduleName = 'node:sqlite'
        const sqlite = await import(moduleName) as SqliteModule
        const database = new sqlite.DatabaseSync(this.databasePath, { readOnly: true })
        try {
            database.exec('PRAGMA query_only = ON; PRAGMA cache_size = -2048; PRAGMA mmap_size = 0;')
            const lookup = database.prepare('SELECT 1 AS found FROM threat_urls WHERE url_hash = ? LIMIT 1')
            const metadata = database.prepare('SELECT value FROM metadata WHERE key = ? LIMIT 1')
            lookup.get(Buffer.alloc(16))
            this.closeDatabase()
            this.database = database
            this.lookupStatement = lookup
            this.metadataStatement = metadata
        } catch (error) {
            database.close()
            throw error
        }
    }

    private closeDatabase(): void {
        this.lookupStatement = null
        this.metadataStatement = null
        try { this.database?.close() } catch {}
        this.database = null
    }

    private async updateDatabase(force: boolean): Promise<void> {
        if (this.disposed) return
        if (this.updatePromise) return this.updatePromise
        this.updatePromise = this.performUpdate(force).catch((error) => {
            log.warn('[BrowserThreatProtection] Background feed update failed; the existing database remains active.', error)
        }).finally(() => {
            this.updatePromise = null
            if (!this.disposed && this.autoUpdate) {
                this.updateTimer = setTimeout(() => {
                    this.updateTimer = null
                    void this.updateDatabase(false)
                }, UPDATE_INTERVAL_MS)
                this.updateTimer.unref?.()
            }
        })
        return this.updatePromise
    }

    private async performUpdate(force: boolean): Promise<void> {
        if (!force) {
            const databaseStat = await stat(this.databasePath).catch(() => null)
            if (databaseStat && this.now() - databaseStat.mtimeMs < UPDATE_INTERVAL_MS) return
        }
        await rm(this.nextDatabasePath, { force: true })
        const etag = String(this.metadataStatement?.get('etag')?.value || '') || undefined
        const result = await this.runUpdateWorker(etag)
        if (result.notModified) {
            const now = new Date(this.now())
            await utimes(this.databasePath, now, now).catch(() => undefined)
            return
        }
        if (!result.databaseBytes || result.databaseBytes > DATABASE_MAX_BYTES) {
            throw new Error('The downloaded phishing database exceeded its disk budget.')
        }
        await this.swapDatabase()
        log.info(`[BrowserThreatProtection] Local phishing database updated (${result.entryCount || 0} entries).`)
    }

    private runUpdateWorker(etag?: string): Promise<WorkerUpdateResult> {
        return new Promise((resolve, reject) => {
            const worker = new Worker(this.workerUrl, {
                workerData: {
                    outputPath: this.nextDatabasePath,
                    etag,
                    userAgent: 'Zyra browser phishing protection'
                }
            })
            worker.unref()
            this.activeWorker = worker
            let settled = false
            const finish = (error?: Error, result?: WorkerUpdateResult) => {
                if (settled) return
                settled = true
                if (this.activeWorker === worker) this.activeWorker = null
                void worker.terminate().catch(() => 0)
                if (error) reject(error)
                else resolve(result || { notModified: true })
            }
            worker.once('message', (message: { type?: string; error?: string; result?: WorkerUpdateResult }) => {
                if (message?.type === 'result') finish(undefined, message.result)
                else finish(new Error(message?.error || 'Phishing feed update failed.'))
            })
            worker.once('error', (error) => finish(error))
            worker.once('exit', (code) => {
                if (!settled) finish(new Error(`Phishing feed worker exited with code ${code}.`))
            })
        })
    }

    private async swapDatabase(): Promise<void> {
        this.closeDatabase()
        await rm(this.backupDatabasePath, { force: true })
        const hadCurrent = await stat(this.databasePath).then(() => true, () => false)
        if (hadCurrent) await rename(this.databasePath, this.backupDatabasePath)
        try {
            await rename(this.nextDatabasePath, this.databasePath)
            await this.openDatabase()
            await rm(this.backupDatabasePath, { force: true })
        } catch (error) {
            await rm(this.databasePath, { force: true }).catch(() => undefined)
            if (hadCurrent) await rename(this.backupDatabasePath, this.databasePath).catch(() => undefined)
            await this.openDatabase().catch(() => undefined)
            throw error
        }
    }

    private pruneEphemeralState(): void {
        const now = this.now()
        for (const [decisionId, decision] of this.pendingDecisions) {
            if (decision.expiresAt <= now) this.pendingDecisions.delete(decisionId)
        }
        for (const [key, expiresAt] of this.allowances) {
            if (expiresAt <= now) this.allowances.delete(key)
        }
        for (const [key, expiresAt] of this.ownerAllowances) {
            if (expiresAt <= now) this.ownerAllowances.delete(key)
        }
    }
}

let browserThreatProtectionService: BrowserThreatProtectionService | null = null

export function configureBrowserThreatProtectionService(options: BrowserThreatProtectionOptions): BrowserThreatProtectionService {
    if (!browserThreatProtectionService) browserThreatProtectionService = new BrowserThreatProtectionService(options)
    browserThreatProtectionService.start()
    return browserThreatProtectionService
}

export function getBrowserThreatProtectionService(): BrowserThreatProtectionService | null {
    return browserThreatProtectionService
}

export async function disposeBrowserThreatProtectionService(): Promise<void> {
    const service = browserThreatProtectionService
    browserThreatProtectionService = null
    await service?.dispose()
}
