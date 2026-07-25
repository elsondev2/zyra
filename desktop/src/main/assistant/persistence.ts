import { app } from 'electron'
import { existsSync, mkdirSync, readFileSync, renameSync } from 'node:fs'
import { rename as renameFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import log from 'electron-log'
import initSqlJs, { type Database as SqlDatabase } from 'sql.js/dist/sql-asm.js'
import type {
    AssistantDomainEvent,
    AssistantGetHistoryPageInput,
    AssistantHistoryPage,
    AssistantReviewIndex,
    AssistantSearchTurnsResult,
    AssistantSessionTurnUsageEntry,
    AssistantTurnDetail,
    AssistantSnapshot,
    AssistantThreadDetail,
    FleetSnapshot
} from '../../shared/assistant/contracts'
import { is } from '../utils'
import { createDefaultSnapshot, recoverPersistedSnapshot } from './projector'
import { readAssistantHistoryPage, readAssistantReviewIndex, readAssistantThreadDetail, readAssistantTurnDetail, searchAssistantTurns } from './persistence-history'
import { hydrateSnapshotThreads } from './persistence-snapshot'
import { deleteFleetProjection, projectFleetSnapshot, readFleetSnapshot } from './fleet-persistence'
import {
    readHydratedThreadDetails,
    readAssistantFirstUserMessageText,
    readAssistantLatestUserMessageText,
    readAssistantPersistenceRecord,
    readAssistantSessionTurnUsage
} from './persistence-read'
import {
    initializeAssistantPersistenceSchema,
    PERSISTENCE_FLUSH_DEBOUNCE_MS,
    PERSISTENCE_VERSION,
    readAssistantPersistenceVersion
} from './persistence-utils'
import {
    persistAssistantEvent,
    persistAssistantSnapshotMeta,
    replaceAssistantSnapshot,
    upsertAssistantMeta
} from './persistence-write'
import {
    coalesceAssistantPersistenceEvents,
    type PendingAssistantPersistenceEvent
} from './persistence-event-batching'

const PERSISTENCE_EVENT_BATCH_DELAY_MS = 240
const FORCE_ASSISTANT_DB_RESET_ENV = 'DEVSCOPE_RESET_ASSISTANT_DB'

function isRecoverableSqlitePersistenceError(error: unknown): boolean {
    const message = error instanceof Error ? error.message : String(error || '')
    const normalized = message.toLowerCase()
    return normalized.includes('database disk image is malformed')
        || normalized.includes('file is not a database')
        || normalized.includes('malformed')
        || normalized.includes('not a database')
}

async function writeFileAtomically(filePath: string, contents: Uint8Array | string): Promise<void> {
    const temporaryPath = `${filePath}.tmp`
    await writeFile(temporaryPath, contents)
    await renameFile(temporaryPath, filePath)
}

function shouldForceAssistantDbReset(): boolean {
    return is.dev && process.env[FORCE_ASSISTANT_DB_RESET_ENV] === '1'
}

export class AssistantPersistence {
    private readonly filePath: string
    private readonly legacyFilePath: string
    private db: SqlDatabase | null = null
    private initPromise: Promise<void> | null = null
    private operationQueue: Promise<void> = Promise.resolve()
    private writeTimer: NodeJS.Timeout | null = null
    private pendingEvents: PendingAssistantPersistenceEvent[] = []
    private pendingEventTimer: NodeJS.Timeout | null = null
    private readonly activeStreamingThreadIds = new Set<string>()
    private diskFlushDeferred = false

    constructor() {
        const assistantDir = join(app.getPath('userData'), 'assistant')
        if (!existsSync(assistantDir)) {
            mkdirSync(assistantDir, { recursive: true })
        }
        this.filePath = join(assistantDir, 'assistant-state.sqlite')
        this.legacyFilePath = join(assistantDir, 'assistant-state.json')
    }

    async load(): Promise<{ version: number; snapshot: AssistantSnapshot; events: AssistantDomainEvent[] }> {
        await this.ensureInitialized()
        return this.enqueue(async () => {
            const record = readAssistantPersistenceRecord(this.requireDb())
            await this.flushNow()
            return record
        })
    }

    appendEvent(event: AssistantDomainEvent, snapshot: AssistantSnapshot): void {
        this.pendingEvents.push({ event, snapshot })
        this.schedulePendingEventProcessing()
    }

    setStreamingActive(threadId: string, active: boolean): void {
        const normalizedThreadId = String(threadId || '').trim()
        if (!normalizedThreadId) return

        if (active) {
            this.activeStreamingThreadIds.add(normalizedThreadId)
            if (this.writeTimer) {
                clearTimeout(this.writeTimer)
                this.writeTimer = null
                this.diskFlushDeferred = true
            }
            return
        }

        this.activeStreamingThreadIds.delete(normalizedThreadId)
        if (this.activeStreamingThreadIds.size === 0 && this.diskFlushDeferred) {
            this.diskFlushDeferred = false
            this.scheduleFlush()
        }
    }

    replaceSnapshot(snapshot: AssistantSnapshot): void {
        this.pendingEvents = []
        this.clearPendingEventTimer()
        void this.enqueue(() => {
            replaceAssistantSnapshot(this.requireDb(), snapshot)
            this.scheduleFlush()
        }).catch((error) => {
            log.error('[AssistantPersistence] Failed to replace assistant snapshot.', error)
        })
    }

    updateMetadata(snapshot: AssistantSnapshot): void {
        void this.enqueue(() => {
            persistAssistantSnapshotMeta(this.requireDb(), snapshot)
            this.scheduleFlush()
        }).catch((error) => {
            log.error('[AssistantPersistence] Failed to update assistant metadata.', error)
        })
    }

    async hydrateSelectedSession(snapshot: AssistantSnapshot, sessionId: string): Promise<AssistantSnapshot> {
        await this.ensureInitialized()
        this.clearPendingEventTimer()
        await this.processPendingEvents()
        return this.enqueue(() => hydrateSnapshotThreads(
            snapshot,
            sessionId,
            readHydratedThreadDetails(this.requireDb(), snapshot, sessionId)
        ))
    }

    async readThreadDetail(threadId: string): Promise<AssistantThreadDetail> {
        await this.ensureInitialized()
        this.clearPendingEventTimer()
        await this.processPendingEvents()
        return this.enqueue(() => readAssistantThreadDetail(this.requireDb(), threadId))
    }

    async readHistoryPage(input: AssistantGetHistoryPageInput): Promise<AssistantHistoryPage> {
        await this.ensureInitialized()
        this.clearPendingEventTimer()
        await this.processPendingEvents()
        return this.enqueue(() => readAssistantHistoryPage(this.requireDb(), input))
    }

    async readReviewIndex(threadId: string): Promise<AssistantReviewIndex> {
        await this.ensureInitialized()
        this.clearPendingEventTimer()
        await this.processPendingEvents()
        return this.enqueue(() => readAssistantReviewIndex(this.requireDb(), threadId))
    }

    async searchTurns(threadId: string, query: string, limit?: number): Promise<AssistantSearchTurnsResult> {
        await this.ensureInitialized()
        return this.enqueue(() => searchAssistantTurns(this.requireDb(), threadId, query, limit))
    }

    async readTurnDetail(threadId: string, turnId: string): Promise<AssistantTurnDetail> {
        await this.ensureInitialized()
        this.clearPendingEventTimer()
        await this.processPendingEvents()
        return this.enqueue(() => readAssistantTurnDetail(this.requireDb(), threadId, turnId))
    }

    async readFirstUserMessageText(sessionId: string): Promise<string | null> {
        await this.ensureInitialized()
        this.clearPendingEventTimer()
        await this.processPendingEvents()
        return this.enqueue(() => readAssistantFirstUserMessageText(this.requireDb(), sessionId))
    }

    async readLatestUserMessageText(sessionId: string): Promise<string | null> {
        await this.ensureInitialized()
        this.clearPendingEventTimer()
        await this.processPendingEvents()
        return this.enqueue(() => readAssistantLatestUserMessageText(this.requireDb(), sessionId))
    }

    async readSessionTurnUsage(sessionId: string): Promise<AssistantSessionTurnUsageEntry[]> {
        await this.ensureInitialized()
        return this.enqueue(() => readAssistantSessionTurnUsage(this.requireDb(), sessionId))
    }

    projectFleet(threadId: string, snapshot: FleetSnapshot): void {
        void this.enqueue(() => {
            projectFleetSnapshot(this.requireDb(), threadId, snapshot)
            this.scheduleFlush()
        }).catch((error) => {
            log.error('[AssistantPersistence] Failed to project fleet snapshot.', error)
        })
    }

    async readFleet(threadId: string): Promise<FleetSnapshot | null> {
        await this.ensureInitialized()
        return this.enqueue(() => readFleetSnapshot(this.requireDb(), threadId))
    }

    deleteFleet(threadId: string): void {
        void this.enqueue(() => {
            deleteFleetProjection(this.requireDb(), threadId)
            this.scheduleFlush()
        }).catch((error) => log.error('[AssistantPersistence] Failed to delete fleet projection.', error))
    }

    async flush(): Promise<void> {
        await this.ensureInitialized()
        this.clearPendingEventTimer()
        await this.processPendingEvents()
        await this.enqueue(async () => {
            if (this.writeTimer) {
                clearTimeout(this.writeTimer)
                this.writeTimer = null
            }
            this.diskFlushDeferred = false
            await this.flushNow()
        })
    }

    private async ensureInitialized(): Promise<void> {
        if (this.initPromise) return this.initPromise
        this.initPromise = this.initialize()
        return this.initPromise
    }

    private async initialize(): Promise<void> {
        try {
            const SQL = await initSqlJs()
            const dbBytes = existsSync(this.filePath) ? readFileSync(this.filePath) : null
            this.db = dbBytes ? new SQL.Database(dbBytes) : new SQL.Database()
            initializeAssistantPersistenceSchema(this.requireDb())

            const storedVersion = dbBytes ? readAssistantPersistenceVersion(this.requireDb()) : PERSISTENCE_VERSION
            if (shouldForceAssistantDbReset()) {
                log.warn('[AssistantPersistence] Forced dev assistant DB reset requested.')
                await this.rebuildDatabase({
                    sql: SQL,
                    backupReason: 'forced-reset',
                    importLegacyJson: false,
                    backupLegacyJson: true
                })
                return
            }

            if (dbBytes && is.dev && storedVersion !== PERSISTENCE_VERSION) {
                log.warn(`[AssistantPersistence] Dev assistant DB version mismatch (${storedVersion ?? 'unknown'} -> ${PERSISTENCE_VERSION}). Resetting dev assistant database.`)
                await this.rebuildDatabase({
                    sql: SQL,
                    backupReason: `dev-v${storedVersion ?? 'unknown'}-to-v${PERSISTENCE_VERSION}`,
                    importLegacyJson: false,
                    backupLegacyJson: true
                })
                return
            }

            upsertAssistantMeta(this.requireDb(), 'persistenceVersion', String(PERSISTENCE_VERSION))

            if (!dbBytes && existsSync(this.legacyFilePath)) {
                this.importLegacyJson()
                await this.flushNow()
            }
        } catch (error) {
            if (existsSync(this.filePath) && isRecoverableSqlitePersistenceError(error)) {
                log.warn('[AssistantPersistence] Corrupt SQLite persistence detected. Rebuilding assistant database.')
                log.debug('[AssistantPersistence] Corrupt SQLite initialize error:', error)
                await this.rebuildDatabase({
                    backupReason: 'corrupt',
                    importLegacyJson: true,
                    backupLegacyJson: false
                })
                return
            }
            log.error('[AssistantPersistence] Failed to initialize SQLite persistence.', error)
            throw error
        }
    }

    private importLegacyJson(): void {
        try {
            const raw = readFileSync(this.legacyFilePath, 'utf8')
            const parsed = JSON.parse(raw) as Partial<{ snapshot: AssistantSnapshot }>
            const snapshot = recoverPersistedSnapshot(parsed.snapshot || createDefaultSnapshot())
            replaceAssistantSnapshot(this.requireDb(), snapshot)
        } catch (error) {
            log.error('[AssistantPersistence] Failed to import legacy assistant JSON state.', error)
        }
    }

    private async rebuildDatabase(options: {
        sql?: Awaited<ReturnType<typeof initSqlJs>>
        backupReason: string
        importLegacyJson: boolean
        backupLegacyJson: boolean
    }): Promise<void> {
        try {
            this.db?.close()
        } catch {
            // Ignore close failures while recovering a corrupt database.
        }
        this.db = null

        const timestamp = Date.now()
        if (existsSync(this.filePath)) {
            const backupPath = `${this.filePath}.${options.backupReason}-${timestamp}.bak`
            try {
                renameSync(this.filePath, backupPath)
                log.warn(`[AssistantPersistence] Backed up assistant database to ${backupPath}`)
            } catch (backupError) {
                log.error('[AssistantPersistence] Failed to back up assistant database.', backupError)
                throw backupError
            }
        }

        if (options.backupLegacyJson && existsSync(this.legacyFilePath)) {
            const legacyBackupPath = `${this.legacyFilePath}.${options.backupReason}-${timestamp}.bak`
            try {
                renameSync(this.legacyFilePath, legacyBackupPath)
                log.warn(`[AssistantPersistence] Backed up assistant JSON snapshot to ${legacyBackupPath}`)
            } catch (backupError) {
                log.error('[AssistantPersistence] Failed to back up assistant JSON snapshot.', backupError)
                throw backupError
            }
        }

        const SQL = options.sql || await initSqlJs()
        this.db = new SQL.Database()
        initializeAssistantPersistenceSchema(this.requireDb())
        upsertAssistantMeta(this.requireDb(), 'persistenceVersion', String(PERSISTENCE_VERSION))

        if (options.importLegacyJson && existsSync(this.legacyFilePath)) {
            this.importLegacyJson()
        }

        await this.flushNow()
    }

    private schedulePendingEventProcessing(): void {
        if (this.pendingEventTimer) return
        this.pendingEventTimer = setTimeout(() => {
            this.pendingEventTimer = null
            void this.processPendingEvents()
        }, PERSISTENCE_EVENT_BATCH_DELAY_MS)
        this.pendingEventTimer.unref?.()
    }

    private clearPendingEventTimer(): void {
        if (!this.pendingEventTimer) return
        clearTimeout(this.pendingEventTimer)
        this.pendingEventTimer = null
    }

    private async processPendingEvents(): Promise<void> {
        if (this.pendingEvents.length === 0) return
        const eventsToPersist = coalesceAssistantPersistenceEvents(
            this.pendingEvents.splice(0, this.pendingEvents.length)
        )

        await this.enqueue(() => {
            for (const entry of eventsToPersist) {
                persistAssistantEvent(this.requireDb(), entry.event, entry.snapshot)
            }
            this.scheduleFlush()
        }).catch((error) => {
            log.error('[AssistantPersistence] Failed to persist assistant event batch.', error)
        })
    }

    private scheduleFlush(): void {
        if (this.activeStreamingThreadIds.size > 0) {
            if (this.writeTimer) {
                clearTimeout(this.writeTimer)
                this.writeTimer = null
            }
            this.diskFlushDeferred = true
            return
        }

        this.diskFlushDeferred = false
        if (this.writeTimer) {
            clearTimeout(this.writeTimer)
        }
        this.writeTimer = setTimeout(() => {
            this.writeTimer = null
            void this.enqueue(async () => {
                await this.flushNow()
            })
        }, PERSISTENCE_FLUSH_DEBOUNCE_MS)
        this.writeTimer.unref?.()
    }

    private async flushNow(): Promise<void> {
        const db = this.requireDb()

        try {
            const bytes = Buffer.from(db.export())
            await writeFileAtomically(this.filePath, bytes)
        } catch (error) {
            log.error('[AssistantPersistence] Failed to write SQLite assistant state.', error)
        }

        try {
            const snapshot = readAssistantPersistenceRecord(db).snapshot
            await writeFileAtomically(this.legacyFilePath, JSON.stringify({ snapshot }, null, 2))
        } catch (error) {
            log.error('[AssistantPersistence] Failed to write JSON assistant fallback state.', error)
        }
    }

    private enqueue<T>(work: () => T | Promise<T>): Promise<T> {
        const nextOperation = this.operationQueue.then(work)
        this.operationQueue = nextOperation.then(() => undefined, () => undefined)
        return nextOperation
    }

    private requireDb(): SqlDatabase {
        if (!this.db) {
            throw new Error('Assistant SQLite database is not initialized.')
        }
        return this.db
    }
}
