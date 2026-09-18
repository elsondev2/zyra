import type { AssistantTurnOutcome } from '../../shared/assistant/contracts'

export type TerminalAssistantMessageOutcome = {
    turnId: string
    outcome: 'interrupted' | 'failed'
    errorMessage: string | null
    sourceMessageId: string
}

function asRecord(value: unknown): Record<string, unknown> | null {
    return value && typeof value === 'object' ? value as Record<string, unknown> : null
}

function asString(value: unknown): string | null {
    return typeof value === 'string' && value.trim() ? value : null
}

export function isAssistantInterruptionErrorMessage(value: unknown): boolean {
    return /\b(?:abort(?:ed)?|cancel(?:led|ed)?|interrupt(?:ed)?|stopp?ed)\b/i.test(String(value || ''))
}

function canonicalAssistantMessageSourceId(message: Record<string, unknown> | null, fallback: string): string {
    const canonicalMetadata = asRecord(message?.['zyraCanonicalMessage'])
    const canonicalMessageId = asString(canonicalMetadata?.['canonicalMessageId'])
    if (canonicalMessageId) return canonicalMessageId
    const timestamp = Number(message?.['timestamp'])
    return Number.isFinite(timestamp) && timestamp > 0
        ? `pi-message:assistant:${Math.trunc(timestamp)}`
        : fallback
}

export function readTerminalAssistantMessageOutcome(
    message: Record<string, unknown> | null,
    fallbackSourceMessageId: string
): Omit<TerminalAssistantMessageOutcome, 'turnId'> | null {
    const stopReason = String(message?.['stopReason'] || '').trim().toLowerCase()
    const errorMessage = asString(message?.['errorMessage'])
    const sourceMessageId = canonicalAssistantMessageSourceId(message, fallbackSourceMessageId)
    if (
        stopReason === 'aborted'
        || stopReason === 'cancelled'
        || stopReason === 'canceled'
        || stopReason === 'interrupted'
        || stopReason === 'stopped'
        || isAssistantInterruptionErrorMessage(errorMessage)
    ) return { outcome: 'interrupted', errorMessage, sourceMessageId }
    if (stopReason === 'error' || errorMessage) return { outcome: 'failed', errorMessage, sourceMessageId }
    return null
}

export function resolveZyraTerminalOutcome(
    type: string,
    event: Record<string, unknown>,
    messageOutcome: TerminalAssistantMessageOutcome | null
): AssistantTurnOutcome {
    if (messageOutcome) return messageOutcome.outcome
    if (type === 'agent_end') return 'completed'
    const outcome = String(event['outcome'] || '').trim().toLowerCase()
    if (outcome === 'interrupted' || outcome === 'cancelled' || outcome === 'canceled') return 'interrupted'
    if (outcome === 'failed') {
        const errorMessage = asString(event['errorMessage']) || ''
        return isAssistantInterruptionErrorMessage(errorMessage) ? 'interrupted' : 'failed'
    }
    return 'completed'
}
