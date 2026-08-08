import type { Database as SqlDatabase, SqlValue } from 'sql.js/dist/sql-asm.js'
import type {
    CanonicalMessageOperation,
    ForegroundRoute,
    ForegroundRouteExpectation,
    RealtimeScopeBinding
} from '../../../shared/assistant/contracts'
import {
    validateCanonicalMessageOperation,
    validateCanonicalMessageOperationRevision
} from './canonical-message-operation-reducer'
import {
    assertActiveExpectation,
    ForegroundRouteConflictError,
    type ForegroundRouteTransition,
    validateForegroundRoute,
    validateForegroundRouteRevision
} from './foreground-route-reducer'

const CONTROLLER_SCHEMA_VERSION = 1

export interface ForegroundControllerStore {
    initializeConversation(route: ForegroundRoute): ForegroundRoute
    activeRoute(conversationId: string): ForegroundRoute | null
    routeHistory(conversationId: string): ForegroundRoute[]
    scopeBinding(routeId: string): RealtimeScopeBinding | null
    commitRouteTransition(
        expectation: ForegroundRouteExpectation,
        transition: ForegroundRouteTransition,
        scopeBinding: RealtimeScopeBinding | null
    ): ForegroundRoute
    prepareCanonicalMessageOperation(
        expectation: ForegroundRouteExpectation,
        operation: CanonicalMessageOperation
    ): CanonicalMessageOperation
    canonicalMessageOperation(operationId: string): CanonicalMessageOperation | null
    canonicalMessageOperationByIdempotencyKey(idempotencyKey: string): CanonicalMessageOperation | null
    commitCanonicalMessageOperationRevision(
        expectedRevision: number,
        next: CanonicalMessageOperation,
        options?: { requireActiveRoute?: boolean }
    ): CanonicalMessageOperation
    pendingCanonicalMessageOperations(routeId: string): CanonicalMessageOperation[]
}

export class SqlForegroundControllerStore implements ForegroundControllerStore {
    constructor(private readonly db: SqlDatabase) {
        initializeForegroundControllerSchema(db)
    }

    initializeConversation(route: ForegroundRoute): ForegroundRoute {
        validateForegroundRoute(route)
        if (route.route_epoch !== 1 || route.status !== 'active') {
            throw invalid('Conversation initialization requires an active epoch-1 route.')
        }
        return transaction(this.db, () => {
            const existing = this.activeRoute(route.conversation_id)
            if (existing) {
                if (existing.foreground_route_id === route.foreground_route_id) return existing
                throw conflict(`Conversation ${route.conversation_id} already has an active foreground route.`)
            }
            insertRouteRevision(this.db, route)
            upsertRouteHead(this.db, route)
            this.db.run(`
                INSERT INTO controller_foreground_conversations (
                    conversation_id, active_route_id, active_route_epoch, route_watermark
                ) VALUES (?, ?, ?, ?)
            `, [route.conversation_id, route.foreground_route_id, route.route_epoch, 1])
            return route
        })
    }

    activeRoute(conversationId: string): ForegroundRoute | null {
        const json = scalar(this.db, `
            SELECT h.payload_json
            FROM controller_foreground_conversations c
            JOIN controller_foreground_route_heads h ON h.foreground_route_id = c.active_route_id
            WHERE c.conversation_id = ?
        `, [conversationId])
        return parseRoute(json)
    }

    routeHistory(conversationId: string): ForegroundRoute[] {
        const result = this.db.exec(`
            SELECT payload_json
            FROM controller_foreground_route_revisions
            WHERE conversation_id = ?
            ORDER BY route_epoch ASC, revision ASC
        `, [conversationId])[0]
        return (result?.values || []).map((row) => parseRoute(row[0])).filter((route): route is ForegroundRoute => Boolean(route))
    }

    scopeBinding(routeId: string): RealtimeScopeBinding | null {
        const result = this.db.exec(`
            SELECT b.conversation_id, b.provider_thread_id, b.realtime_session_id, b.session_generation
            FROM controller_realtime_scope_bindings b
            WHERE b.foreground_route_id = ?
        `, [routeId])[0]?.values?.[0]
        if (!result) return null
        return {
            conversationId: String(result[0]),
            realtimeProviderThreadId: String(result[1]),
            realtimeSessionId: String(result[2]),
            realtimeSessionGeneration: Number(result[3])
        }
    }

    commitRouteTransition(
        expectation: ForegroundRouteExpectation,
        transitionValue: ForegroundRouteTransition,
        scopeBinding: RealtimeScopeBinding | null
    ): ForegroundRoute {
        const { terminated, activated } = transitionValue
        validateForegroundRouteRevision({ ...terminated, revision: 1, previous_revision: null, status: 'active', superseded_by_route_id: null, updated_at: terminated.created_at, terminal_at: null }, terminated)
        validateForegroundRoute(activated)
        if (terminated.superseded_by_route_id !== activated.foreground_route_id
            || activated.supersedes_route_id !== terminated.foreground_route_id
            || terminated.terminal_at !== activated.created_at) {
            throw invalid('Foreground route predecessor/successor linkage is inconsistent.')
        }

        return transaction(this.db, () => {
            const current = this.activeRoute(terminated.conversation_id)
            if (!current) throw conflict('The canonical conversation has no active foreground route.')
            assertActiveExpectation(current, expectation)
            validateForegroundRouteRevision(current, terminated)
            if (this.pendingCanonicalMessageOperations(current.foreground_route_id).length > 0) {
                throw new ForegroundRouteConflictError(
                    'The foreground output lane must quiesce canonical message commits before handoff.',
                    'route_quiescence_required'
                )
            }
            if (activated.route_epoch !== current.route_epoch + 1) throw conflict('Foreground route epoch compare-and-swap failed.')
            if (this.routeByEpoch(current.conversation_id, activated.route_epoch)) {
                throw conflict('The next foreground route epoch already exists.')
            }

            validateScopeBinding(activated, scopeBinding)
            insertRouteRevision(this.db, terminated)
            upsertRouteHead(this.db, terminated)
            insertRouteRevision(this.db, activated)
            upsertRouteHead(this.db, activated)
            if (scopeBinding) this.insertScopeBinding(activated, scopeBinding)
            this.db.run(`
                UPDATE controller_foreground_conversations
                SET active_route_id = ?, active_route_epoch = ?, route_watermark = route_watermark + 2
                WHERE conversation_id = ? AND active_route_id = ? AND active_route_epoch = ?
            `, [
                activated.foreground_route_id,
                activated.route_epoch,
                current.conversation_id,
                current.foreground_route_id,
                current.route_epoch
            ])
            const committedRouteId = scalar(this.db, `
                SELECT active_route_id FROM controller_foreground_conversations WHERE conversation_id = ?
            `, [current.conversation_id])
            if (committedRouteId !== activated.foreground_route_id) {
                throw conflict('Foreground route compare-and-swap lost a concurrent transition.')
            }
            return activated
        })
    }

    prepareCanonicalMessageOperation(
        expectation: ForegroundRouteExpectation,
        operation: CanonicalMessageOperation
    ): CanonicalMessageOperation {
        validateCanonicalMessageOperation(operation)
        if (operation.status !== 'intended' || operation.revision !== 1) {
            throw invalid('A newly prepared canonical-message operation must be intended revision 1.')
        }
        return transaction(this.db, () => {
            const active = this.activeRoute(operation.conversation_id)
            if (!active) throw conflict('The canonical conversation has no active foreground route.')
            assertActiveExpectation(active, expectation)
            assertOperationBoundToRoute(operation, active)

            const existing = this.canonicalMessageOperationByIdempotencyKey(operation.idempotency_key)
            if (existing) {
                assertSameOperationIdentity(existing, operation)
                return existing
            }
            const messageOwner = scalar(this.db, `
                SELECT operation_id FROM controller_canonical_message_operation_heads
                WHERE conversation_id = ? AND canonical_message_id = ?
            `, [operation.conversation_id, operation.canonical_message_id])
            if (messageOwner) throw conflict('The canonical message ID is already bound to another operation.')
            insertOperationRevision(this.db, operation)
            upsertOperationHead(this.db, operation)
            return operation
        })
    }

    canonicalMessageOperation(operationId: string): CanonicalMessageOperation | null {
        const json = scalar(this.db, `
            SELECT payload_json FROM controller_canonical_message_operation_heads WHERE operation_id = ?
        `, [operationId])
        return parseOperation(json)
    }

    canonicalMessageOperationByIdempotencyKey(idempotencyKey: string): CanonicalMessageOperation | null {
        const json = scalar(this.db, `
            SELECT payload_json FROM controller_canonical_message_operation_heads WHERE idempotency_key = ?
        `, [idempotencyKey])
        return parseOperation(json)
    }

    commitCanonicalMessageOperationRevision(
        expectedRevision: number,
        next: CanonicalMessageOperation,
        options: { requireActiveRoute?: boolean } = {}
    ): CanonicalMessageOperation {
        validateCanonicalMessageOperation(next)
        return transaction(this.db, () => {
            const current = this.canonicalMessageOperation(next.operation_id)
            if (!current) throw conflict(`Unknown canonical-message operation ${next.operation_id}.`)
            if (current.revision !== expectedRevision) throw conflict('Canonical-message operation compare-and-swap failed.')
            validateCanonicalMessageOperationRevision(current, next)
            if (options.requireActiveRoute !== false) {
                const active = this.activeRoute(next.conversation_id)
                if (!active) throw conflict('The canonical conversation has no active foreground route.')
                assertOperationBoundToRoute(next, active)
            }
            insertOperationRevision(this.db, next)
            upsertOperationHead(this.db, next)
            return next
        })
    }

    pendingCanonicalMessageOperations(routeId: string): CanonicalMessageOperation[] {
        const result = this.db.exec(`
            SELECT payload_json
            FROM controller_canonical_message_operation_heads
            WHERE foreground_route_id = ? AND status IN ('intended', 'dispatched')
            ORDER BY operation_id ASC
        `, [routeId])[0]
        return (result?.values || []).map((row) => parseOperation(row[0])).filter((operation): operation is CanonicalMessageOperation => Boolean(operation))
    }

    private routeByEpoch(conversationId: string, routeEpoch: number): ForegroundRoute | null {
        const json = scalar(this.db, `
            SELECT payload_json FROM controller_foreground_route_heads
            WHERE conversation_id = ? AND route_epoch = ?
        `, [conversationId, routeEpoch])
        return parseRoute(json)
    }

    private insertScopeBinding(route: ForegroundRoute, binding: RealtimeScopeBinding): void {
        const existingConversation = scalar(this.db, `
            SELECT conversation_id FROM controller_realtime_provider_threads WHERE provider_thread_id = ?
        `, [binding.realtimeProviderThreadId])
        if (existingConversation && existingConversation !== binding.conversationId) {
            throw conflict('A realtime provider thread cannot be rebound to another canonical conversation.')
        }
        if (!existingConversation) {
            this.db.run(`
                INSERT INTO controller_realtime_provider_threads (provider_thread_id, conversation_id)
                VALUES (?, ?)
            `, [binding.realtimeProviderThreadId, binding.conversationId])
        }
        this.db.run(`
            INSERT INTO controller_realtime_scope_bindings (
                foreground_route_id, conversation_id, provider_thread_id, realtime_session_id, session_generation
            ) VALUES (?, ?, ?, ?, ?)
        `, [
            route.foreground_route_id,
            binding.conversationId,
            binding.realtimeProviderThreadId,
            binding.realtimeSessionId,
            binding.realtimeSessionGeneration
        ])
    }
}

export function initializeForegroundControllerSchema(db: SqlDatabase): void {
    db.run('PRAGMA foreign_keys = ON;')
    db.run(`
        CREATE TABLE IF NOT EXISTS controller_meta (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS controller_foreground_conversations (
            conversation_id TEXT PRIMARY KEY,
            active_route_id TEXT NOT NULL UNIQUE,
            active_route_epoch INTEGER NOT NULL,
            route_watermark INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS controller_foreground_route_revisions (
            foreground_route_id TEXT NOT NULL,
            revision INTEGER NOT NULL,
            conversation_id TEXT NOT NULL,
            route_epoch INTEGER NOT NULL,
            status TEXT NOT NULL,
            payload_json TEXT NOT NULL,
            PRIMARY KEY (foreground_route_id, revision)
        );
        CREATE TABLE IF NOT EXISTS controller_foreground_route_heads (
            foreground_route_id TEXT PRIMARY KEY,
            conversation_id TEXT NOT NULL,
            route_epoch INTEGER NOT NULL,
            revision INTEGER NOT NULL,
            status TEXT NOT NULL,
            owner_claim_id TEXT NOT NULL UNIQUE,
            payload_json TEXT NOT NULL,
            UNIQUE (conversation_id, route_epoch)
        );
        CREATE TABLE IF NOT EXISTS controller_realtime_provider_threads (
            provider_thread_id TEXT PRIMARY KEY,
            conversation_id TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS controller_realtime_scope_bindings (
            foreground_route_id TEXT PRIMARY KEY,
            conversation_id TEXT NOT NULL,
            provider_thread_id TEXT NOT NULL,
            realtime_session_id TEXT NOT NULL,
            session_generation INTEGER NOT NULL,
            UNIQUE (realtime_session_id, session_generation),
            FOREIGN KEY (foreground_route_id) REFERENCES controller_foreground_route_heads(foreground_route_id),
            FOREIGN KEY (provider_thread_id) REFERENCES controller_realtime_provider_threads(provider_thread_id)
        );
        CREATE TABLE IF NOT EXISTS controller_canonical_message_operation_revisions (
            operation_id TEXT NOT NULL,
            revision INTEGER NOT NULL,
            conversation_id TEXT NOT NULL,
            foreground_route_id TEXT NOT NULL,
            status TEXT NOT NULL,
            payload_json TEXT NOT NULL,
            PRIMARY KEY (operation_id, revision)
        );
        CREATE TABLE IF NOT EXISTS controller_canonical_message_operation_heads (
            operation_id TEXT PRIMARY KEY,
            revision INTEGER NOT NULL,
            conversation_id TEXT NOT NULL,
            canonical_message_id TEXT NOT NULL,
            foreground_route_id TEXT NOT NULL,
            foreground_route_epoch INTEGER NOT NULL,
            idempotency_key TEXT NOT NULL UNIQUE,
            status TEXT NOT NULL,
            payload_json TEXT NOT NULL,
            UNIQUE (conversation_id, canonical_message_id)
        );
        CREATE INDEX IF NOT EXISTS idx_controller_route_revisions_conversation
            ON controller_foreground_route_revisions(conversation_id, route_epoch, revision);
        CREATE INDEX IF NOT EXISTS idx_controller_message_operations_route
            ON controller_canonical_message_operation_heads(foreground_route_id, status);
    `)
    thisVersion(db)
}

function thisVersion(db: SqlDatabase): void {
    const stored = scalar(db, `SELECT value FROM controller_meta WHERE key = 'schema_version'`)
    if (stored && Number(stored) !== CONTROLLER_SCHEMA_VERSION) {
        throw new Error(`Unsupported foreground controller schema version ${stored}.`)
    }
    db.run(`INSERT OR REPLACE INTO controller_meta (key, value) VALUES ('schema_version', ?)`, [String(CONTROLLER_SCHEMA_VERSION)])
}

function insertRouteRevision(db: SqlDatabase, route: ForegroundRoute): void {
    db.run(`
        INSERT INTO controller_foreground_route_revisions (
            foreground_route_id, revision, conversation_id, route_epoch, status, payload_json
        ) VALUES (?, ?, ?, ?, ?, ?)
    `, [
        route.foreground_route_id,
        route.revision,
        route.conversation_id,
        route.route_epoch,
        route.status,
        JSON.stringify(route)
    ])
}

function upsertRouteHead(db: SqlDatabase, route: ForegroundRoute): void {
    db.run(`
        INSERT INTO controller_foreground_route_heads (
            foreground_route_id, conversation_id, route_epoch, revision, status, owner_claim_id, payload_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(foreground_route_id) DO UPDATE SET
            revision = excluded.revision,
            status = excluded.status,
            payload_json = excluded.payload_json
    `, [
        route.foreground_route_id,
        route.conversation_id,
        route.route_epoch,
        route.revision,
        route.status,
        route.owner_claim_id,
        JSON.stringify(route)
    ])
}

function insertOperationRevision(db: SqlDatabase, operation: CanonicalMessageOperation): void {
    db.run(`
        INSERT INTO controller_canonical_message_operation_revisions (
            operation_id, revision, conversation_id, foreground_route_id, status, payload_json
        ) VALUES (?, ?, ?, ?, ?, ?)
    `, [
        operation.operation_id,
        operation.revision,
        operation.conversation_id,
        operation.foreground_route_id,
        operation.status,
        JSON.stringify(operation)
    ])
}

function upsertOperationHead(db: SqlDatabase, operation: CanonicalMessageOperation): void {
    db.run(`
        INSERT INTO controller_canonical_message_operation_heads (
            operation_id, revision, conversation_id, canonical_message_id,
            foreground_route_id, foreground_route_epoch, idempotency_key, status, payload_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(operation_id) DO UPDATE SET
            revision = excluded.revision,
            status = excluded.status,
            payload_json = excluded.payload_json
    `, [
        operation.operation_id,
        operation.revision,
        operation.conversation_id,
        operation.canonical_message_id,
        operation.foreground_route_id,
        operation.foreground_route_epoch,
        operation.idempotency_key,
        operation.status,
        JSON.stringify(operation)
    ])
}

function validateScopeBinding(route: ForegroundRoute, binding: RealtimeScopeBinding | null): void {
    if (route.surface_mode === 'chat') {
        if (binding !== null) throw invalid('A Chat route cannot persist a realtime scope binding.')
        return
    }
    if (!binding
        || binding.conversationId !== route.conversation_id
        || binding.realtimeSessionId !== route.realtime_session_id
        || binding.realtimeSessionGeneration !== route.realtime_session_generation) {
        throw invalid('A Voice route requires an exact immutable realtime scope binding.')
    }
}

function assertOperationBoundToRoute(operation: CanonicalMessageOperation, route: ForegroundRoute): void {
    if (operation.conversation_id !== route.conversation_id
        || operation.foreground_route_id !== route.foreground_route_id
        || operation.foreground_route_epoch !== route.route_epoch
        || operation.foreground_owner_claim_id !== route.owner_claim_id
        || route.status !== 'active') {
        throw conflict('Canonical-message operation is bound to a stale foreground owner claim.')
    }
}

function assertSameOperationIdentity(left: CanonicalMessageOperation, right: CanonicalMessageOperation): void {
    const keys: Array<keyof CanonicalMessageOperation> = [
        'operation_id', 'conversation_id', 'foreground_route_id', 'foreground_route_epoch',
        'foreground_owner_claim_id', 'canonical_message_id', 'idempotency_key', 'adapter_id',
        'protected_payload_ref', 'payload_sha256'
    ]
    for (const key of keys) {
        if (left[key] !== right[key]) throw conflict(`Idempotency key was reused with different ${key}.`)
    }
}

function parseRoute(value: SqlValue | undefined): ForegroundRoute | null {
    if (typeof value !== 'string' || !value) return null
    return validateForegroundRoute(JSON.parse(value) as ForegroundRoute)
}

function parseOperation(value: SqlValue | undefined): CanonicalMessageOperation | null {
    if (typeof value !== 'string' || !value) return null
    return validateCanonicalMessageOperation(JSON.parse(value) as CanonicalMessageOperation)
}

function scalar(db: SqlDatabase, sql: string, params: SqlValue[] = []): SqlValue | undefined {
    return db.exec(sql, params)[0]?.values?.[0]?.[0]
}

function transaction<T>(db: SqlDatabase, work: () => T): T {
    db.run('BEGIN IMMEDIATE')
    try {
        const result = work()
        db.run('COMMIT')
        return result
    } catch (error) {
        db.run('ROLLBACK')
        throw error
    }
}

function invalid(message: string): ForegroundRouteConflictError {
    return new ForegroundRouteConflictError(message, 'route_invalid')
}

function conflict(message: string): ForegroundRouteConflictError {
    return new ForegroundRouteConflictError(message, 'route_conflict')
}
