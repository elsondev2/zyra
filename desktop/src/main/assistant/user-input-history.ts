import type { AssistantMessage, AssistantPendingUserInput, AssistantUserInputAnswer, AssistantUserInputQuestion } from '../../shared/assistant/contracts'
import { assistantUserInputContinuationVariants } from '../../shared/assistant/user-input-continuation'
import { toUserInputQuestions } from './codex-runtime-session-utils'

const record = (value: unknown): Record<string, unknown> | undefined => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined
const text = (value: unknown): string | undefined => typeof value === 'string' && value.trim() ? value.trim() : undefined
const normalized = (value: string) => value.replace(/\r\n/g, '\n').trim()
const occurredAt = (value: unknown) => {
    const stamp = typeof value === 'number' ? value : Date.parse(String(value || ''))
    return new Date(Number.isFinite(stamp) ? stamp : 0).toISOString()
}

function recoverAnswers(questions: AssistantUserInputQuestion[], prompt: string): Record<string, AssistantUserInputAnswer> | null {
    const body = normalized(prompt)
    if (!body.startsWith('Here are my answers:\n\n')) return null
    const lines = body.slice('Here are my answers:\n\n'.length).split('\n')
    const answers: Record<string, AssistantUserInputAnswer> = {}
    let cursor = 0
    for (let index = 0; index < questions.length; index++) {
        const question = questions[index]!
        const prefix = `- ${question.header}: `
        if (!lines[cursor]?.startsWith(prefix)) return null
        const value = [lines[cursor]!.slice(prefix.length)]
        cursor++
        const nextPrefix = questions[index + 1] ? `- ${questions[index + 1]!.header}: ` : null
        while (cursor < lines.length && (!nextPrefix || !lines[cursor]!.startsWith(nextPrefix))) value.push(lines[cursor++]!)
        // The core continuation formatter prefixes every nonempty answer line.
        const continuation = value.slice(1)
        const legacy = continuation.length > 0 && continuation.every(line => line.startsWith('- '))
        answers[question.id] = [value[0], ...continuation.map(line => legacy ? line.slice(2) : line)].join('\n')
    }
    return cursor === lines.length && assistantUserInputContinuationVariants(questions, answers).some(value => normalized(value) === body) ? answers : null
}

/** Recover only a generated response immediately following a real question tool.
 * Ordinary prompts and cancelled questions remain ordinary messages. */
export function recoverCanonicalUserInputReceipts(entries: unknown[], messages: AssistantMessage[], baseEntryIndex = 0): AssistantPendingUserInput[] {
    const bySequence = new Map(messages.map(message => [message.timelineSequence, message]))
    const receipts: AssistantPendingUserInput[] = []
    let pending: { toolCallId: string; requestId: string; questions: AssistantUserInputQuestion[]; answers?: Record<string, AssistantUserInputAnswer>; createdAt: string; turnId: string | null } | null = null
    let turnId: string | null = null
    const recordResponse = (projected: AssistantMessage) => {
        if (!pending) return
        const answers = pending.answers && assistantUserInputContinuationVariants(pending.questions, pending.answers).some(value => normalized(value) === normalized(projected.text))
            ? pending.answers : recoverAnswers(pending.questions, projected.text)
        if (answers) receipts.push({ id: `canonical-question:${pending.toolCallId}`, requestId: pending.requestId, questions: pending.questions, status: 'resolved', answers, responseMessageId: projected.id, turnId: pending.turnId, createdAt: pending.createdAt, resolvedAt: projected.createdAt })
    }
    for (let index = 0; index < entries.length; index++) {
        const entry = record(entries[index])
        const message = record(entry?.message)
        if (!message) continue
        const projected = bySequence.get(baseEntryIndex + index + 1)
        if (message.role === 'user') {
            if (projected) recordResponse(projected)
            pending = null
            turnId = projected?.turnId || null
            continue
        }
        const parts = Array.isArray(message.content) ? message.content.map(record).filter(Boolean) : []
        for (const part of parts) {
            if (part?.type !== 'toolCall' || part.name !== 'request_user_input') continue
            const questions = toUserInputQuestions(record(part.arguments)?.questions, record, text)
            pending = questions.length && text(part.id) ? { toolCallId: text(part.id)!, requestId: text(part.id)!, questions, createdAt: projected?.createdAt || occurredAt(message.timestamp || entry?.timestamp), turnId } : null
        }
        if (message.role === 'toolResult' && (message.toolName === 'request_user_input' || (pending && (message.toolCallId ?? message.tool_call_id) === pending.toolCallId))) {
            const details = record(message.details)
            const toolCallId = text(message.toolCallId ?? message.tool_call_id)
            if (details?.cancelled === true || details?.unavailable === true || message.isError === true) { pending = null; continue }
            const questions = toUserInputQuestions(details?.questions, record, text)
            if (questions.length && toolCallId) pending = { toolCallId, requestId: text(details?.requestId) || pending?.requestId || toolCallId, questions, createdAt: pending?.createdAt || occurredAt(message.timestamp || entry?.timestamp), turnId: pending?.turnId || turnId }
            if (pending && toolCallId === pending.toolCallId) {
                pending.requestId = text(details?.requestId) || pending.requestId
                const rawAnswers = record(details?.answers)
                if (rawAnswers && pending.questions.every(question => typeof rawAnswers[question.id] === 'string' || (Array.isArray(rawAnswers[question.id]) && (rawAnswers[question.id] as unknown[]).every(value => typeof value === 'string')))) pending.answers = rawAnswers as Record<string, AssistantUserInputAnswer>
            }
        }
    }
    // Older pages are contiguous with the persisted newer tail. Only its first
    // user boundary may answer this question; never scan past another prompt.
    const nextUser = messages.filter(message => message.role === 'user' && (message.timelineSequence || 0) > baseEntryIndex + entries.length)
        .sort((a, b) => (a.timelineSequence || 0) - (b.timelineSequence || 0))[0]
    if (pending && nextUser) recordResponse(nextUser)
    return receipts
}

export function mergeRecoveredUserInputReceipts(existing: AssistantPendingUserInput[], recovered: AssistantPendingUserInput[]): AssistantPendingUserInput[] {
    const merged = [...existing]
    for (const receipt of recovered) {
        const index = merged.findIndex(input => input.requestId === receipt.requestId || (input.responseMessageId && input.responseMessageId === receipt.responseMessageId))
        if (index < 0) merged.push(receipt)
        else {
            const prior = merged[index]!
            merged[index] = { ...prior, ...receipt, id: prior.id, questions: prior.questions.length ? prior.questions : receipt.questions, answers: prior.answers || receipt.answers }
        }
    }
    return merged
}
