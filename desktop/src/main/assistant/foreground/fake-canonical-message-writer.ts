import { createHash } from 'node:crypto'
import type {
    CanonicalLedgerAppendInput,
    CanonicalMessageCommitReceipt,
    CanonicalMessageWriter
} from '../../../shared/assistant/contracts'
import type { ForegroundClock } from './foreground-route-controller'
import { systemForegroundClock } from './foreground-route-controller'

export interface FakeCanonicalMessageRecord {
    input: CanonicalLedgerAppendInput
    receipt: CanonicalMessageCommitReceipt
}

export class FakeCanonicalMessageWriter implements CanonicalMessageWriter {
    private readonly byOperation = new Map<string, FakeCanonicalMessageRecord>()
    private readonly byMessage = new Map<string, FakeCanonicalMessageRecord>()
    private readonly conversationSequences = new Map<string, number>()
    private failBeforeWriteMessage: string | null = null
    private failAfterWriteMessage: string | null = null

    constructor(private readonly clock: ForegroundClock = systemForegroundClock) {}

    failNextBeforeWrite(message = 'Injected canonical ledger failure before append.'): void {
        this.failBeforeWriteMessage = message
    }

    failNextAfterWrite(message = 'Injected canonical ledger failure after append.'): void {
        this.failAfterWriteMessage = message
    }

    async append(input: CanonicalLedgerAppendInput): Promise<CanonicalMessageCommitReceipt> {
        const existing = this.byOperation.get(input.operationId)
        if (existing) {
            assertEquivalent(existing.input, input)
            return existing.receipt
        }
        const existingMessage = this.byMessage.get(`${input.conversationId}:${input.messageId}`)
        if (existingMessage) {
            assertEquivalent(existingMessage.input, input)
            return existingMessage.receipt
        }
        if (this.failBeforeWriteMessage) {
            const message = this.failBeforeWriteMessage
            this.failBeforeWriteMessage = null
            throw new Error(message)
        }
        const sequence = (this.conversationSequences.get(input.conversationId) || 0) + 1
        this.conversationSequences.set(input.conversationId, sequence)
        const observedAt = this.clock.now()
        const receipt: CanonicalMessageCommitReceipt = {
            receiptId: `receipt_${createHash('sha256').update(`${input.operationId}:${sequence}`).digest('hex').slice(0, 40)}`,
            operationId: input.operationId,
            canonicalMessageId: input.messageId,
            conversationId: input.conversationId,
            foregroundRouteId: input.routeClaim.foregroundRouteId,
            routeEpoch: input.routeClaim.routeEpoch,
            ownerClaimId: input.routeClaim.ownerClaimId,
            canonicalSequence: sequence,
            contentSha256: input.payloadSha256,
            observedAt
        }
        const record = { input: structuredClone(input), receipt }
        this.byOperation.set(input.operationId, record)
        this.byMessage.set(`${input.conversationId}:${input.messageId}`, record)
        if (this.failAfterWriteMessage) {
            const message = this.failAfterWriteMessage
            this.failAfterWriteMessage = null
            throw new Error(message)
        }
        return receipt
    }

    async findReceipt(operationId: string): Promise<CanonicalMessageCommitReceipt | null> {
        return this.byOperation.get(operationId)?.receipt || null
    }

    records(conversationId?: string): FakeCanonicalMessageRecord[] {
        return [...this.byOperation.values()]
            .filter((record) => !conversationId || record.input.conversationId === conversationId)
            .sort((left, right) => left.receipt.canonicalSequence - right.receipt.canonicalSequence)
            .map((record) => structuredClone(record))
    }
}

function assertEquivalent(left: CanonicalLedgerAppendInput, right: CanonicalLedgerAppendInput): void {
    const identity = (value: CanonicalLedgerAppendInput) => JSON.stringify({
        operationId: value.operationId,
        idempotencyKey: value.idempotencyKey,
        conversationId: value.conversationId,
        messageId: value.messageId,
        payloadSha256: value.payloadSha256,
        routeClaim: value.routeClaim
    })
    if (identity(left) !== identity(right)) {
        throw new Error('Canonical message identity was reused with different immutable content.')
    }
}
