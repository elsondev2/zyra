import { randomUUID } from 'node:crypto'
import {
    closeSync,
    existsSync,
    fsyncSync,
    mkdirSync,
    openSync,
    readFileSync,
    renameSync,
    unlinkSync,
    writeSync
} from 'node:fs'
import { dirname, join } from 'node:path'
import initSqlJs, { type Database as SqlDatabase, type SqlJsStatic } from 'sql.js/dist/sql-asm.js'
import type {
    CanonicalMessageOperation,
    ForegroundRoute,
    ForegroundRouteExpectation,
    RealtimeScopeBinding
} from '../../../shared/assistant/contracts'
import {
    SqlForegroundControllerStore,
    type ForegroundControllerStore
} from './foreground-controller-store'
import type { ForegroundRouteTransition } from './foreground-route-reducer'

/**
 * File owner for canonical foreground controller tables. It intentionally uses
 * a separate controller.sqlite rather than the rebuildable assistant UI DB.
 */
export class ForegroundControllerPersistence implements ForegroundControllerStore {
    private constructor(
        private readonly SQL: SqlJsStatic,
        readonly filePath: string,
        private db: SqlDatabase,
        private store: SqlForegroundControllerStore
    ) {}

    static async open(filePath: string): Promise<ForegroundControllerPersistence> {
        const SQL = await initSqlJs()
        mkdirSync(dirname(filePath), { recursive: true })
        const db = existsSync(filePath)
            ? new SQL.Database(readFileSync(filePath))
            : new SQL.Database()
        const store = new SqlForegroundControllerStore(db)
        const persistence = new ForegroundControllerPersistence(SQL, filePath, db, store)
        if (!existsSync(filePath)) persistence.flush()
        return persistence
    }

    static defaultPath(userDataPath: string): string {
        return join(userDataPath, 'assistant', 'controller.sqlite')
    }

    initializeConversation(route: ForegroundRoute): ForegroundRoute {
        return this.mutate(() => this.store.initializeConversation(route))
    }

    activeRoute(conversationId: string): ForegroundRoute | null {
        return this.store.activeRoute(conversationId)
    }

    routeHistory(conversationId: string): ForegroundRoute[] {
        return this.store.routeHistory(conversationId)
    }

    scopeBinding(routeId: string): RealtimeScopeBinding | null {
        return this.store.scopeBinding(routeId)
    }

    commitRouteTransition(
        expectation: ForegroundRouteExpectation,
        transition: ForegroundRouteTransition,
        scopeBinding: RealtimeScopeBinding | null
    ): ForegroundRoute {
        return this.mutate(() => this.store.commitRouteTransition(expectation, transition, scopeBinding))
    }

    prepareCanonicalMessageOperation(
        expectation: ForegroundRouteExpectation,
        operation: CanonicalMessageOperation
    ): CanonicalMessageOperation {
        return this.mutate(() => this.store.prepareCanonicalMessageOperation(expectation, operation))
    }

    canonicalMessageOperation(operationId: string): CanonicalMessageOperation | null {
        return this.store.canonicalMessageOperation(operationId)
    }

    canonicalMessageOperationByIdempotencyKey(idempotencyKey: string): CanonicalMessageOperation | null {
        return this.store.canonicalMessageOperationByIdempotencyKey(idempotencyKey)
    }

    commitCanonicalMessageOperationRevision(
        expectedRevision: number,
        next: CanonicalMessageOperation,
        options?: { requireActiveRoute?: boolean }
    ): CanonicalMessageOperation {
        return this.mutate(() => this.store.commitCanonicalMessageOperationRevision(expectedRevision, next, options))
    }

    pendingCanonicalMessageOperations(routeId: string): CanonicalMessageOperation[] {
        return this.store.pendingCanonicalMessageOperations(routeId)
    }

    flush(): void {
        const bytes = this.db.export()
        const temporaryPath = `${this.filePath}.${process.pid}.${randomUUID()}.tmp`
        let descriptor: number | null = null
        try {
            descriptor = openSync(temporaryPath, 'w', 0o600)
            writeSync(descriptor, bytes)
            fsyncSync(descriptor)
            closeSync(descriptor)
            descriptor = null
            renameSync(temporaryPath, this.filePath)
        } catch (error) {
            if (descriptor !== null) closeSync(descriptor)
            if (existsSync(temporaryPath)) unlinkSync(temporaryPath)
            throw error
        }
    }

    close(): void {
        this.flush()
        this.db.close()
    }

    private mutate<T>(operation: () => T): T {
        const previous = this.db.export()
        try {
            const result = operation()
            this.flush()
            return result
        } catch (error) {
            this.restore(previous)
            throw error
        }
    }

    private restore(bytes: Uint8Array): void {
        try {
            this.db.close()
        } catch {
            // The failed mutation may already have invalidated the old handle.
        }
        this.db = new this.SQL.Database(bytes)
        this.store = new SqlForegroundControllerStore(this.db)
    }
}
