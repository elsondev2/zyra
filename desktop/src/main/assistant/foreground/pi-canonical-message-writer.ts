import type {
    CanonicalLedgerAppendInput,
    CanonicalMessageCommitReceipt,
    CanonicalMessageWriter
} from '../../../shared/assistant/contracts'

export interface PiCanonicalMessageTransport {
    appendCanonicalMessage(conversationId: string, message: Record<string, unknown>): Promise<Record<string, unknown>>
    findCanonicalMessageReceipt(conversationId: string, operationId: string): Promise<Record<string, unknown> | null>
}

/**
 * Writes through the server-owned Pi SessionManager. The Pi JSONL stays the
 * canonical transcript; Desktop Assistant SQLite is updated only by the
 * optional projection callback after an authoritative receipt is returned.
 */
export class PiCanonicalMessageWriter implements CanonicalMessageWriter {
    private readonly conversationsByOperationId = new Map<string, string>()

    constructor(
        private readonly transport: PiCanonicalMessageTransport,
        private readonly resolveConversationId?: (operationId: string) => string | null,
        private readonly onCommitted?: (
            input: CanonicalLedgerAppendInput,
            receipt: CanonicalMessageCommitReceipt
        ) => Promise<void> | void
    ) {}

    async append(input: CanonicalLedgerAppendInput): Promise<CanonicalMessageCommitReceipt> {
        this.conversationsByOperationId.set(input.operationId, input.conversationId)
        const receipt = parseReceipt(await this.transport.appendCanonicalMessage(
            input.conversationId,
            input as unknown as Record<string, unknown>
        ))
        try {
            await this.onCommitted?.(input, receipt)
        } catch {
            // The Desktop projection is rebuildable from Pi JSONL. A projection
            // failure must not turn a durable canonical append into an unknown outcome.
        }
        return receipt
    }

    async findReceipt(operationId: string): Promise<CanonicalMessageCommitReceipt | null> {
        const conversationId = this.conversationsByOperationId.get(operationId)
            || this.resolveConversationId?.(operationId)
        if (!conversationId) return null
        const value = await this.transport.findCanonicalMessageReceipt(conversationId, operationId)
        return value ? parseReceipt(value) : null
    }
}

function parseReceipt(value: Record<string, unknown>): CanonicalMessageCommitReceipt {
    const canonicalSequence = Number(value['canonicalSequence'])
    const routeEpoch = Number(value['routeEpoch'])
    if (!Number.isSafeInteger(canonicalSequence) || canonicalSequence < 1) {
        throw new Error('Pi canonical receipt has an invalid sequence.')
    }
    if (!Number.isSafeInteger(routeEpoch) || routeEpoch < 1) {
        throw new Error('Pi canonical receipt has an invalid route epoch.')
    }
    return {
        receiptId: requiredString(value, 'receiptId'),
        operationId: requiredString(value, 'operationId'),
        canonicalMessageId: requiredString(value, 'canonicalMessageId'),
        conversationId: requiredString(value, 'conversationId'),
        canonicalSequence,
        foregroundRouteId: requiredString(value, 'foregroundRouteId'),
        routeEpoch,
        ownerClaimId: requiredString(value, 'ownerClaimId'),
        contentSha256: requiredString(value, 'contentSha256'),
        observedAt: requiredTimestamp(value, 'observedAt')
    }
}

function requiredString(value: Record<string, unknown>, key: string): string {
    const result = typeof value[key] === 'string' ? value[key].trim() : ''
    if (!result) throw new Error(`Pi canonical receipt omitted ${key}.`)
    return result
}

function requiredTimestamp(value: Record<string, unknown>, key: string): string {
    const result = requiredString(value, key)
    if (!Number.isFinite(Date.parse(result))) throw new Error(`Pi canonical receipt has invalid ${key}.`)
    return result
}
