/**
 * Zyra - AI Debug Log Store
 * Keeps an in-memory ring buffer of AI request/response traces for Settings > Logs.
 */

export type AiLogProvider = 'groq' | 'gemini' | 'codex'
export type AiLogAction = 'generateCommitMessage' | 'testConnection'
export type AiLogStatus = 'success' | 'error'

export interface AiDebugLogEntry {
    id: string
    timestamp: number
    provider: AiLogProvider
    action: AiLogAction
    status: AiLogStatus
    model?: string
    error?: string
    promptPreview?: string
    requestPayload?: string
    rawResponse?: string
    candidateMessage?: string
    finalMessage?: string
    metadata?: Record<string, string | number | boolean | null>
}

type CreateAiDebugLogInput = Omit<AiDebugLogEntry, 'id' | 'timestamp'>

const MAX_LOG_ENTRIES = 200
const MAX_TEXT_FIELD = 12000

const aiDebugLogs: AiDebugLogEntry[] = []

function trimText(value: string | undefined): string | undefined {
    if (!value) return undefined
    if (value.length <= MAX_TEXT_FIELD) return value
    return `${value.slice(0, MAX_TEXT_FIELD)}\n... (truncated for log)`
}

function toStringPayload(value: unknown): string | undefined {
    if (value === undefined || value === null) return undefined
    if (typeof value === 'string') return trimText(value)
    try {
        return trimText(JSON.stringify(value, null, 2))
    } catch {
        return trimText(String(value))
    }
}

export function recordAiDebugLog(entry: CreateAiDebugLogInput): void {
    const timestamp = Date.now()
    const id = `${timestamp}-${Math.random().toString(36).slice(2, 10)}`

    aiDebugLogs.unshift({
        ...entry,
        id,
        timestamp,
        error: trimText(entry.error),
        promptPreview: trimText(entry.promptPreview),
        requestPayload: trimText(entry.requestPayload),
        rawResponse: trimText(entry.rawResponse),
        candidateMessage: trimText(entry.candidateMessage),
        finalMessage: trimText(entry.finalMessage)
    })

    if (aiDebugLogs.length > MAX_LOG_ENTRIES) {
        aiDebugLogs.length = MAX_LOG_ENTRIES
    }
}

export function getAiDebugLogs(limit = 100): AiDebugLogEntry[] {
    const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.min(500, Math.floor(limit))) : 100
    return aiDebugLogs.slice(0, safeLimit)
}

export function clearAiDebugLogs(): void {
    aiDebugLogs.length = 0
}

export function serializeForAiLog(value: unknown): string | undefined {
    return toStringPayload(value)
}
