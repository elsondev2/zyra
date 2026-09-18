import type { SqlValue } from 'sql.js/dist/sql-asm.js'
import type { AssistantActivity } from '../../shared/assistant/contracts'
import { parseJson, toNumber } from './persistence-utils'
import { isAssistantInterruptionErrorMessage } from './assistant-terminal-outcome'

export const ASSISTANT_ACTIVITY_PAYLOAD_MAX_CHARACTERS = 512 * 1024
export const ASSISTANT_TRUNCATED_ACTIVITY_PAYLOAD_ESTIMATED_CHARACTERS = 160
// SQL NULL is reserved for rows written before whole-turn metadata existed.
const ASSISTANT_ACTIVITY_NONTERMINAL_OUTCOME = 'nonterminal'

const COMPACT_PAYLOAD_KEYS = [
    'status',
    'stopReason',
    'toolName',
    'toolCallId',
    'canonicalMessageId',
    'actionBatchIntent',
    'historyBodyRef',
    'args',
    'paths',
    'fileCount',
    'surface',
    'startedAt',
    'completedAt',
    'durationMs',
    'command',
    'query',
    'url',
    'pageTitle',
    'pageText',
    'faviconUrl',
    'contentType',
    'statusCode',
    'bytesRead',
    'webResults',
    'operation',
    'targetId',
    'executableIdentity',
    'action',
    'runId',
    'agentRunId',
    'workflowRunId',
    'requestedAgent',
    'label',
    'prompt',
    'skillPath',
    'skillName',
    'readStartLine',
    'readEndLine',
    'readLineCount',
    'readTotalLines',
    'readRequestedLimit',
    'readComplete',
    'readTruncated',
    'readIsImage',
    'category',
    'provider',
    'source',
    'authoritative',
    'revision',
    'additions',
    'deletions',
    'createdPaths',
    'diffUnavailableReason'
] as const

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function summarizePayloadValue(value: unknown): unknown {
    if (typeof value === 'string') {
        return value.length <= 16_384
            ? value
            : `${value.slice(0, 16_384)}… [oversized value omitted]`
    }
    if (Array.isArray(value)) {
        return value.slice(0, 100).map(summarizePayloadValue)
    }
    if (isRecord(value)) {
        return Object.fromEntries(
            Object.entries(value)
                .slice(0, 100)
                .map(([key, entry]) => [key, summarizePayloadValue(entry)])
        )
    }
    return value
}

export function serializeAssistantActivityPayload(payload: AssistantActivity['payload']): string {
    const serialized = JSON.stringify(payload ?? null)
    if (serialized.length <= ASSISTANT_ACTIVITY_PAYLOAD_MAX_CHARACTERS) return serialized

    const source = isRecord(payload) ? payload : {}
    const withoutResult = { ...source }
    const omittedPayloadFields: string[] = []
    for (const key of ['result', 'rawResult', 'data', 'content'] as const) {
        if (!(key in withoutResult)) continue
        delete withoutResult[key]
        omittedPayloadFields.push(key)
    }
    const compact = {
        ...withoutResult,
        persistencePayloadTruncated: true,
        originalPayloadCharacters: serialized.length,
        omittedPayloadFields
    }
    const compactSerialized = JSON.stringify(compact)
    if (compactSerialized.length <= ASSISTANT_ACTIVITY_PAYLOAD_MAX_CHARACTERS) return compactSerialized

    const summary: Record<string, unknown> = {}
    for (const key of COMPACT_PAYLOAD_KEYS) {
        if (key in source) summary[key] = summarizePayloadValue(source[key])
    }
    return JSON.stringify({
        ...summary,
        persistencePayloadTruncated: true,
        originalPayloadCharacters: serialized.length,
        omittedPayloadFields: [...new Set([...omittedPayloadFields, 'oversized-fields'])]
    })
}

export function assistantActivityPayloadColumns(columnName = 'payload_json'): string {
    return `CASE WHEN LENGTH(COALESCE(${columnName}, '')) <= ${ASSISTANT_ACTIVITY_PAYLOAD_MAX_CHARACTERS} THEN ${columnName} ELSE NULL END, LENGTH(COALESCE(${columnName}, ''))`
}

export function parseAssistantActivityPayload(
    value: SqlValue,
    originalCharactersValue?: SqlValue
): AssistantActivity['payload'] {
    const parsed = parseJson<Record<string, unknown> | undefined>(value, undefined)
    if (parsed) return parsed

    const originalPayloadCharacters = toNumber(originalCharactersValue ?? null)
    if (originalPayloadCharacters <= ASSISTANT_ACTIVITY_PAYLOAD_MAX_CHARACTERS) return undefined
    return {
        persistencePayloadTruncated: true,
        originalPayloadCharacters,
        omittedPayloadFields: ['oversized-persisted-payload']
    }
}

export function assistantActivityTerminalOutcomeColumn(): string {
    // A later assistant response proves a legacy error was an attempt, not the turn's end.
    // Fresh projections carry an explicit value and do not need this correlated lookup.
    return `CASE WHEN assistant_activities.turn_terminal_outcome IS NULL
        AND assistant_activities.kind = 'error'
        AND EXISTS (SELECT 1 FROM assistant_messages later
            WHERE later.thread_id = assistant_activities.thread_id
              AND later.turn_id = assistant_activities.turn_id
              AND later.role = 'assistant'
              AND LENGTH(TRIM(later.text)) > 0
              AND (later.created_at > assistant_activities.created_at
                OR (later.created_at = assistant_activities.created_at
                  AND COALESCE(later.timeline_sequence, -1) > COALESCE(assistant_activities.timeline_sequence, -1))))
        THEN '${ASSISTANT_ACTIVITY_NONTERMINAL_OUTCOME}' ELSE assistant_activities.turn_terminal_outcome END`
}

export function serializeAssistantActivityTerminalOutcome(
    outcome: AssistantActivity['turnTerminalOutcome']
): string {
    return outcome ?? ASSISTANT_ACTIVITY_NONTERMINAL_OUTCOME
}

export function parseAssistantActivityTerminalOutcome(
    value: SqlValue,
    kind: string,
    payload: AssistantActivity['payload'],
    detail?: string
): AssistantActivity['turnTerminalOutcome'] {
    if (value === 'failed' || value === 'interrupted') return value
    if (value !== null) return undefined
    if (kind !== 'error') return undefined

    const stopReason = String(payload?.['stopReason'] || '').trim().toLowerCase()
    if (['aborted', 'cancelled', 'canceled', 'interrupted', 'stopped'].includes(stopReason)) return 'interrupted'
    if (stopReason === 'error') return isAssistantInterruptionErrorMessage(detail) ? 'interrupted' : 'failed'
    if (payload?.['canonicalMessageId'] && payload?.['status'] === 'failed') return 'failed'
    return undefined
}
