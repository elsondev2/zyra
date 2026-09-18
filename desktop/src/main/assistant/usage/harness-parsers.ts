import { createHash } from 'node:crypto'
import type { UsageEntry, UsageHarness } from '../../../shared/assistant/usage-summary'

export type ParserState = { session: string; model: string; provider: string; total?: Record<string, number>; sequence: number }
export const initialParserState = (session: string): ParserState => ({ session, model: 'unknown', provider: 'unknown', sequence: 0 })
const n = (value: unknown) => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0
type Json = Record<string, any>
function entry(harness: UsageHarness, session: string, id: string, timestamp: unknown, model: string, usage: UsageEntry['usage']): UsageEntry | null {
    const date = new Date(typeof timestamp === 'number' || typeof timestamp === 'string' ? timestamp : NaN)
    if (!Number.isFinite(date.getTime())) return null
    const time = date.toISOString()
    return { harness, id, sessionId: session, model, usage, requestedAt: time }
}
/** Only usage metadata leaves the parser. No prompts, tool output or credentials are retained. */
export function parseHarnessRecord(harness: UsageHarness, obj: Json, state: ParserState): UsageEntry | null {
    const p = obj.payload || {}
    if (harness === 'codex') {
        if (obj.type === 'session_meta') {
            state.session = p.id || state.session
            state.model = p.model || state.model
            state.provider = p.model_provider || 'openai-codex'
        }
        if (obj.type === 'turn_context') { state.model = p.model || state.model; state.provider = p.model_provider || state.provider }
        if (obj.type !== 'event_msg' || p.type !== 'token_count' || !p.info) return null
        const total = p.info.total_token_usage, last = p.info.last_token_usage
        if (!total && !last) return null
        const keys = ['input_tokens', 'output_tokens', 'cached_input_tokens']
        let u = last || total
        if (total) {
            const reset = keys.some(key => n(total[key]) < n(state.total?.[key]))
            if (!reset) u = Object.fromEntries(keys.map(key => [key, n(total[key]) - n(state.total?.[key])]))
            state.total = Object.fromEntries(keys.map(key => [key, n(total[key])]))
        }
        if (!keys.some(key => n(u[key]))) return null
        // Equal cumulative events contribute zero; identity also deduplicates archived copies/fork history.
        const id = createHash('sha256').update(`${obj.timestamp}:${JSON.stringify(total || u)}`).digest('hex')
        return entry(harness, state.session, id, obj.timestamp, `${state.provider}/${state.model}`, { inputTokens: n(u.input_tokens), outputTokens: n(u.output_tokens), cachedInputTokens: n(u.cached_input_tokens), inputIncludesCachedTokens: true })
    }
    if (harness === 'opencode') {
        if (obj.role !== 'assistant' || !obj.tokens) return null
        const u = obj.tokens
        return entry(harness, obj.sessionID || state.session, obj.id || state.session, obj.time?.created, `${obj.providerID || 'unknown'}/${obj.modelID || 'unknown'}`, { inputTokens: n(u.input), outputTokens: n(u.output), cachedInputTokens: n(u.cache?.read), cacheWriteTokens: n(u.cache?.write), inputIncludesCachedTokens: false, ...(typeof obj.cost === 'number' ? { costUsd: obj.cost } : {}) })
    }
    if (obj.type === 'session') { state.session = obj.id || state.session; return null }
    const msg = obj.message
    if (!msg || msg.role !== 'assistant' || !msg.usage || obj.isApiErrorMessage) return null
    const u = msg.usage
    if (harness === 'claude') {
        return entry(harness, obj.sessionId || state.session, msg.id || obj.uuid || `${state.session}:${++state.sequence}`, obj.timestamp, `anthropic/${msg.model || 'unknown'}`, { inputTokens: n(u.input_tokens), outputTokens: n(u.output_tokens), cachedInputTokens: n(u.cache_read_input_tokens), cacheWriteTokens: n(u.cache_creation_input_tokens), inputIncludesCachedTokens: false })
    }
    const record = entry(harness, state.session, msg.responseId || obj.id || `${state.session}:${++state.sequence}`, obj.timestamp || msg.timestamp, `${msg.provider || 'unknown'}/${msg.model || 'unknown'}`, { inputTokens: n(u.input), outputTokens: n(u.output), cachedInputTokens: n(u.cacheRead), cacheWriteTokens: n(u.cacheWrite), inputIncludesCachedTokens: false, ...(typeof u.cost?.total === 'number' ? { costUsd: u.cost.total } : {}) })
    return record ? { ...record, ...(typeof msg.responseId === 'string' ? { providerResponseId: msg.responseId } : {}) } : null
}

export function putUsageRecord(records: Record<string, UsageEntry>, record: UsageEntry | null) {
    if (!record) return
    // Response IDs survive Pi branch copies; Claude repeats message IDs as content blocks stream.
    const key = record.providerResponseId ? `response:${record.model.split('/')[0]}:${record.providerResponseId}` : `${record.harness}:${record.id}`
    const prior = records[key]
    if (prior && record.harness === 'claude') {
        for (const field of ['inputTokens','outputTokens','cachedInputTokens','cacheWriteTokens'] as const) record.usage![field] = Math.max(n(prior.usage?.[field]), n(record.usage?.[field]))
    }
    records[key] = record
}
