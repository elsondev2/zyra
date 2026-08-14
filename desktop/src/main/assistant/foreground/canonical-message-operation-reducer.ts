import type {
    CanonicalMessageOperation,
    CanonicalMessageOperationReceipt,
    ForegroundRouteClaim
} from '../../../shared/assistant/contracts'
import { ForegroundRouteConflictError } from './foreground-route-reducer'

const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/
const SHA256_PATTERN = /^[a-f0-9]{64}$/
const TERMINAL = new Set(['succeeded', 'failed', 'cancelled', 'outcome_unknown'])

export interface CreateCanonicalMessageOperationInput {
    operationId: string
    conversationId: string
    canonicalMessageId: string
    idempotencyKey: string
    routeClaim: ForegroundRouteClaim
    adapterId: string
    protectedPayloadRef: string
    payloadSha256: string
    redactedSummary: string
    intentAt: string
}

export function createCanonicalMessageOperation(input: CreateCanonicalMessageOperationInput): CanonicalMessageOperation {
    const operation: CanonicalMessageOperation = {
        schema_version: 2,
        operation_id: input.operationId,
        revision: 1,
        previous_revision: null,
        conversation_id: input.conversationId,
        task_id: null,
        attempt_id: null,
        foreground_route_id: input.routeClaim.foregroundRouteId,
        foreground_route_epoch: input.routeClaim.routeEpoch,
        foreground_owner_claim_id: input.routeClaim.ownerClaimId,
        canonical_message_id: input.canonicalMessageId,
        idempotency_key: input.idempotencyKey,
        operation_class: 'canonical_message_commit',
        consequence: 'reversible',
        action_hash: null,
        capability_lease_id: null,
        adapter_id: input.adapterId,
        protected_payload_ref: input.protectedPayloadRef,
        payload_sha256: input.payloadSha256,
        redacted_summary: input.redactedSummary,
        status: 'intended',
        intent_at: input.intentAt,
        dispatched_at: null,
        terminal_at: null,
        receipt: null,
        unknown_reason: null
    }
    return validateCanonicalMessageOperation(operation)
}

export function dispatchCanonicalMessageOperation(
    current: CanonicalMessageOperation,
    dispatchedAt: string
): CanonicalMessageOperation {
    validateCanonicalMessageOperation(current)
    if (current.status !== 'intended') throw conflict(`Cannot dispatch an operation in ${current.status} state.`)
    const next = nextRevision(current, {
        status: 'dispatched',
        dispatched_at: dispatchedAt
    })
    validateCanonicalMessageOperationRevision(current, next)
    return next
}

export function completeCanonicalMessageOperation(
    current: CanonicalMessageOperation,
    receipt: CanonicalMessageOperationReceipt,
    terminalAt: string
): CanonicalMessageOperation {
    validateCanonicalMessageOperation(current)
    if (current.status !== 'dispatched') throw conflict(`Cannot complete an operation in ${current.status} state.`)
    const next = nextRevision(current, {
        status: receipt.outcome,
        terminal_at: terminalAt,
        receipt
    })
    validateCanonicalMessageOperationRevision(current, next)
    return next
}

export function cancelCanonicalMessageOperation(
    current: CanonicalMessageOperation,
    receipt: CanonicalMessageOperationReceipt,
    terminalAt: string
): CanonicalMessageOperation {
    validateCanonicalMessageOperation(current)
    if (current.status !== 'intended' && current.status !== 'dispatched') {
        throw conflict(`Cannot cancel an operation in ${current.status} state.`)
    }
    if (receipt.outcome !== 'cancelled') throw invalid('A cancellation receipt must have cancelled outcome.')
    const next = nextRevision(current, {
        status: 'cancelled',
        terminal_at: terminalAt,
        receipt
    })
    validateCanonicalMessageOperationRevision(current, next)
    return next
}

export function markCanonicalMessageOutcomeUnknown(
    current: CanonicalMessageOperation,
    reason: string,
    terminalAt: string
): CanonicalMessageOperation {
    validateCanonicalMessageOperation(current)
    if (current.status !== 'dispatched') throw conflict('Only a dispatched operation can have an unknown outcome.')
    const unknownReason = String(reason || '').trim()
    if (!unknownReason) throw invalid('Unknown outcome requires a bounded reason.')
    const next = nextRevision(current, {
        status: 'outcome_unknown',
        terminal_at: terminalAt,
        unknown_reason: unknownReason.slice(0, 2000)
    })
    validateCanonicalMessageOperationRevision(current, next)
    return next
}

export function validateCanonicalMessageOperation(operation: CanonicalMessageOperation): CanonicalMessageOperation {
    if (!operation || typeof operation !== 'object') throw invalid('Canonical message operation must be an object.')
    if (operation.schema_version !== 2 || operation.operation_class !== 'canonical_message_commit') {
        throw invalid('Unsupported canonical-message operation contract.')
    }
    for (const [name, value] of [
        ['operation_id', operation.operation_id],
        ['conversation_id', operation.conversation_id],
        ['foreground_route_id', operation.foreground_route_id],
        ['foreground_owner_claim_id', operation.foreground_owner_claim_id],
        ['canonical_message_id', operation.canonical_message_id],
        ['adapter_id', operation.adapter_id],
        ['protected_payload_ref', operation.protected_payload_ref]
    ] as const) assertId(value, name)
    assertSafeInteger(operation.revision, 'revision', 1)
    assertSafeInteger(operation.foreground_route_epoch, 'foreground_route_epoch', 1)
    if (!operation.idempotency_key || operation.idempotency_key.length > 256) throw invalid('Invalid idempotency key.')
    if (!SHA256_PATTERN.test(operation.payload_sha256)) throw invalid('payload_sha256 must be lowercase SHA-256.')
    if (!operation.redacted_summary || operation.redacted_summary.length > 2000) throw invalid('Invalid redacted summary.')
    if (operation.task_id !== null || operation.attempt_id !== null || operation.action_hash !== null || operation.capability_lease_id !== null) {
        throw invalid('A canonical-message operation cannot carry task execution authority.')
    }
    parseTimestamp(operation.intent_at, 'intent_at')

    if (operation.revision === 1 && operation.previous_revision !== null) throw invalid('Revision 1 cannot name a previous revision.')
    if (operation.revision > 1 && operation.previous_revision !== operation.revision - 1) {
        throw invalid('Operation revisions must be contiguous.')
    }

    if (operation.status === 'intended') {
        if (operation.dispatched_at || operation.terminal_at || operation.receipt || operation.unknown_reason) {
            throw invalid('An intended operation cannot have dispatch or terminal fields.')
        }
    } else if (operation.status === 'dispatched') {
        assertTimestampOrder(operation.intent_at, operation.dispatched_at, 'dispatched_at')
        if (operation.terminal_at || operation.receipt || operation.unknown_reason) {
            throw invalid('A dispatched operation cannot have terminal fields.')
        }
    } else if (operation.status === 'outcome_unknown') {
        assertTimestampOrder(operation.intent_at, operation.dispatched_at, 'dispatched_at')
        assertTimestampOrder(operation.dispatched_at as string, operation.terminal_at, 'terminal_at')
        if (operation.receipt || !operation.unknown_reason) throw invalid('Unknown outcome requires a reason and no receipt.')
    } else if (TERMINAL.has(operation.status)) {
        if (!operation.receipt || operation.receipt.outcome !== operation.status) {
            throw invalid(`A ${operation.status} operation requires a matching receipt.`)
        }
        if (operation.status === 'succeeded' || operation.status === 'failed') {
            assertTimestampOrder(operation.intent_at, operation.dispatched_at, 'dispatched_at')
        }
        const lower = operation.dispatched_at || operation.intent_at
        assertTimestampOrder(lower, operation.terminal_at, 'terminal_at')
        validateReceipt(operation.receipt)
        if (operation.unknown_reason) throw invalid('A receipted operation cannot have an unknown reason.')
    } else {
        throw invalid(`Unsupported canonical-message operation status ${operation.status}.`)
    }
    return operation
}

export function validateCanonicalMessageOperationRevision(
    previous: CanonicalMessageOperation,
    next: CanonicalMessageOperation
): void {
    validateCanonicalMessageOperation(previous)
    validateCanonicalMessageOperation(next)
    if (TERMINAL.has(previous.status)) throw conflict('A terminal operation cannot receive another revision.')
    if (next.revision !== previous.revision + 1 || next.previous_revision !== previous.revision) {
        throw conflict('Operation revision compare-and-swap failed.')
    }
    const immutable: Array<keyof CanonicalMessageOperation> = [
        'schema_version', 'operation_id', 'conversation_id', 'task_id', 'attempt_id',
        'foreground_route_id', 'foreground_route_epoch', 'foreground_owner_claim_id',
        'canonical_message_id', 'idempotency_key', 'operation_class', 'consequence',
        'action_hash', 'capability_lease_id', 'adapter_id', 'protected_payload_ref',
        'payload_sha256', 'redacted_summary', 'intent_at'
    ]
    for (const key of immutable) {
        if (JSON.stringify(previous[key]) !== JSON.stringify(next[key])) {
            throw invalid(`Canonical-message operation identity field ${key} is immutable.`)
        }
    }
}

function nextRevision(
    current: CanonicalMessageOperation,
    patch: Partial<CanonicalMessageOperation>
): CanonicalMessageOperation {
    return {
        ...current,
        ...patch,
        revision: current.revision + 1,
        previous_revision: current.revision
    }
}

function validateReceipt(receipt: CanonicalMessageOperationReceipt): void {
    assertId(receipt.receipt_id, 'receipt.receipt_id')
    parseTimestamp(receipt.observed_at, 'receipt.observed_at')
    if (receipt.external_receipt_id !== null && (!receipt.external_receipt_id || receipt.external_receipt_id.length > 1000)) {
        throw invalid('Invalid external receipt ID.')
    }
    if (receipt.result_ref !== null) throw invalid('Canonical-message receipt result_ref is intentionally null in V1 core.')
}

function assertId(value: unknown, name: string): asserts value is string {
    if (typeof value !== 'string' || !ID_PATTERN.test(value)) throw invalid(`${name} must be a stable ID.`)
}

function assertSafeInteger(value: unknown, name: string, minimum: number): asserts value is number {
    if (!Number.isSafeInteger(value) || (value as number) < minimum) throw invalid(`${name} must be a safe integer >= ${minimum}.`)
}

function parseTimestamp(value: unknown, name: string): number {
    if (typeof value !== 'string' || !value || !Number.isFinite(Date.parse(value))) throw invalid(`${name} must be an ISO date-time.`)
    return Date.parse(value)
}

function assertTimestampOrder(lower: string, upper: string | null, name: string): void {
    const lowerMs = parseTimestamp(lower, 'prior timestamp')
    const upperMs = parseTimestamp(upper, name)
    if (upperMs < lowerMs) throw invalid(`${name} cannot precede the prior operation timestamp.`)
}

function invalid(message: string): ForegroundRouteConflictError {
    return new ForegroundRouteConflictError(message, 'route_invalid')
}

function conflict(message: string): ForegroundRouteConflictError {
    return new ForegroundRouteConflictError(message, 'route_conflict')
}
