import log from 'electron-log'
import type { AssistantDomainEvent, AssistantReviewTurnIndexEntry, AssistantSession } from '../../shared/assistant/contracts'
import {
    ASSISTANT_TITLE_GENERATION_PROMPT_PREFIX,
    DEFAULT_ASSISTANT_TITLE_MODEL,
    normalizeAssistantAutoTitleTurnInterval,
    type AssistantTitleAutomationPreferences
} from '../../shared/assistant/title-generation'
import {
    getSerializedAttachmentDisplayName,
    isSerializedClipboardAttachment,
    parseSerializedAssistantMessage,
    type SerializedAssistantAttachment
} from '../../shared/assistant/message-attachments'
import { deriveSessionTitleFromPrompt, isDefaultSessionTitle, nowIso } from './utils'

const SESSION_TITLE_MAX_LENGTH = 60
const TITLE_GENERATION_FALLBACK_MODEL = 'openai-codex/gpt-5.4-mini'
const ATTACHMENT_EXCERPT_LIMIT = 240
const BODY_EXCERPT_LIMIT = 720
const ATTACHMENT_LIMIT = 4
const RETITLE_TURN_LIMIT = 4
const RETITLE_USER_EXCERPT_LIMIT = 720
const RETITLE_ASSISTANT_EXCERPT_LIMIT = 1_200
const pendingTitleGenerationSessionIds = new Set<string>()

type AppendEvent = (
    type: AssistantDomainEvent['type'],
    occurredAt: string,
    payload: Record<string, unknown>,
    sessionId?: string,
    threadId?: string
) => void

function normalizeWhitespace(value: string): string {
    return String(value || '')
        .replace(/\s+/g, ' ')
        .trim()
}

function clip(value: string, limit: number): string {
    const normalized = normalizeWhitespace(value)
    if (!normalized) return ''
    if (normalized.length <= limit) return normalized
    return `${normalized.slice(0, Math.max(limit - 1, 1)).trimEnd()}…`
}

function sanitizeGeneratedSessionTitle(value: string, fallbackTitle: string): string {
    let title = String(value || '').trim()
    if (!title) return fallbackTitle

    const fencedMatch = title.match(/```(?:json|text)?\s*([\s\S]*?)```/i)
    if (fencedMatch?.[1]) {
        title = fencedMatch[1].trim()
    }

    if (title.startsWith('{') && title.endsWith('}')) {
        try {
            const parsed = JSON.parse(title) as { title?: unknown }
            if (typeof parsed.title === 'string' && parsed.title.trim()) {
                title = parsed.title.trim()
            }
        } catch {
            // ignore malformed JSON and keep best-effort text
        }
    }

    title = title
        .replace(/^title\s*:\s*/i, '')
        .replace(/^["'`]+|["'`]+$/g, '')
        .split(/\r?\n/)[0]
        .trim()

    title = normalizeWhitespace(title).slice(0, SESSION_TITLE_MAX_LENGTH).trim()
    return title || fallbackTitle
}

function describeAttachment(attachment: SerializedAssistantAttachment): string {
    const displayName = getSerializedAttachmentDisplayName(attachment)
    const type = String(attachment.type || '').trim().toLowerCase()
    const mime = String(attachment.mime || '').trim().toLowerCase()
    const prefixParts = [displayName]
    if (type) prefixParts.push(type)
    if (mime) prefixParts.push(mime)

    const contentExcerpt = clip(attachment.content || attachment.preview || attachment.note || '', ATTACHMENT_EXCERPT_LIMIT)
    const source = isSerializedClipboardAttachment(attachment) ? 'clipboard' : 'file'
    const summary = prefixParts.join(' • ')
    if (!contentExcerpt) {
        return `${summary} • ${source}`
    }
    return `${summary} • ${source} • excerpt: ${contentExcerpt}`
}

function buildSessionTitlePrompt(messageText: string, seedTitle: string): string {
    const parsed = parseSerializedAssistantMessage(messageText)
    const body = clip(parsed.body, BODY_EXCERPT_LIMIT)
    const attachmentLines = parsed.attachments
        .slice(0, ATTACHMENT_LIMIT)
        .map((attachment) => `- ${describeAttachment(attachment)}`)
        .join('\n')
    const attachmentOverflow = parsed.attachments.length > ATTACHMENT_LIMIT
        ? `\n- ${parsed.attachments.length - ATTACHMENT_LIMIT} more attachment(s) omitted`
        : ''

    return [
        ASSISTANT_TITLE_GENERATION_PROMPT_PREFIX,
        'Return only the title text. Do not use quotes, markdown, JSON, or commentary.',
        `Keep the title under ${SESSION_TITLE_MAX_LENGTH} characters.`,
        'Prefer concrete technical nouns and task intent over generic wording.',
        'If the request is primarily attachment-driven, use the attachment context.',
        'Avoid generic titles like "Help with code" or "New session".',
        '',
        `Current heuristic title: ${seedTitle}`,
        '',
        'User request to title:',
        body || '(no message body)',
        '',
        'Attachment context:',
        attachmentLines || '(no attachments)'
    ].join('\n') + attachmentOverflow
}

export function buildSessionRetitlePrompt(turns: AssistantReviewTurnIndexEntry[], currentTitle: string): string {
    const recentTurns = turns
        .filter((turn) => turn.state === 'completed' && turn.prompt?.text.trim() && turn.response?.text.trim())
        .sort((left, right) => left.requestedAt.localeCompare(right.requestedAt) || left.id.localeCompare(right.id))
        .slice(-RETITLE_TURN_LIMIT)
    const transcript = recentTurns.map((turn, index) => {
        const userPrompt = clip(parseSerializedAssistantMessage(turn.prompt?.text || '').body, RETITLE_USER_EXCERPT_LIMIT)
        const finalResponse = clip(turn.response?.text || '', RETITLE_ASSISTANT_EXCERPT_LIMIT)
        return [
            `Turn ${index + 1}`,
            `User prompt: ${userPrompt || '(empty)'}`,
            `Final assistant response: ${finalResponse || '(empty)'}`
        ].join('\n')
    }).join('\n\n')

    return [
        ASSISTANT_TITLE_GENERATION_PROMPT_PREFIX,
        'Return only the title text. Do not use quotes, markdown, JSON, or commentary.',
        `Keep the title under ${SESSION_TITLE_MAX_LENGTH} characters.`,
        'Name the current coherent topic represented by the recent completed turns.',
        'Prefer concrete technical nouns and task intent over generic wording.',
        'Do not mention tools, implementation steps, or that the title was regenerated.',
        '',
        `Current title: ${clip(currentTitle, SESSION_TITLE_MAX_LENGTH) || 'Untitled thread'}`,
        '',
        'Recent completed turns:',
        transcript || '(no completed conversation available)'
    ].join('\n')
}

function shouldApplyGeneratedTitle(session: AssistantSession | null, seedTitle: string): boolean {
    if (!session) return false
    const currentTitle = String(session.title || '').trim()
    if (!currentTitle) return true
    if (isDefaultSessionTitle(currentTitle)) return true
    return currentTitle === seedTitle.trim()
}

export type AssistantTitleTextGenerator = (
    prompt: string,
    options: { cwd: string; model?: string; effort?: 'low' }
) => Promise<{ success: boolean; text?: string; model?: string; error?: string }>

function normalizeTitleModel(model?: string | null): string | null {
    const normalized = String(model || '').trim()
    if (!normalized) return null
    if (normalized.includes('/')) return normalized
    if (normalized.startsWith('gpt-') || normalized.startsWith('o')) return `openai-codex/${normalized}`
    return normalized
}

export function getTitleGenerationModelCandidates(preferredModel?: string | null): string[] {
    return [...new Set([
        normalizeTitleModel(preferredModel) || DEFAULT_ASSISTANT_TITLE_MODEL,
        DEFAULT_ASSISTANT_TITLE_MODEL,
        TITLE_GENERATION_FALLBACK_MODEL
    ])]
}

function firstUserMessageText(session: AssistantSession): string | null {
    const messages = session.threads
        .flatMap((thread) => thread.messages)
        .filter((message) => message.role === 'user' && String(message.text || '').trim().length > 0)
        .sort((left, right) => left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id))
    return messages[0]?.text || null
}

async function generateSessionTitleText(args: {
    prompt: string
    cwd: string
    preferredModel?: string | null
    generateText: AssistantTitleTextGenerator
}): Promise<string | null> {
    const modelCandidates = getTitleGenerationModelCandidates(args.preferredModel)
    let lastError: string | null = null

    for (const model of modelCandidates) {
        const result = await args.generateText(args.prompt, {
            cwd: args.cwd,
            model,
            effort: 'low'
        })
        if (result.success && result.text) {
            return result.text
        }
        lastError = result.error || lastError
    }

    if (lastError) {
        log.warn('[Assistant] Session title generation failed:', lastError)
    }
    return null
}

export function shouldAutoRegenerateSessionTitle(
    completedTurnCount: number,
    preferences: AssistantTitleAutomationPreferences
): boolean {
    if (!preferences.enabled) return false
    const turnInterval = normalizeAssistantAutoTitleTurnInterval(preferences.turnInterval)
    return completedTurnCount >= turnInterval && completedTurnCount % turnInterval === 0
}

export function shouldGenerateSessionTitleForPrompt(session: AssistantSession, persistedFirstUserMessage?: string | null): boolean {
    if (isDefaultSessionTitle(session.title)) return true

    const firstMessage = persistedFirstUserMessage || firstUserMessageText(session)
    if (!firstMessage) return false
    return session.title.trim() === deriveSessionTitleFromPrompt(firstMessage).trim()
}

type SessionTitleGenerationTask = {
    sessionId: string
    threadId: string
    prompt: string
    seedTitle: string
    cwd: string
    preferredModel?: string | null
    generateText: AssistantTitleTextGenerator
    getSnapshot: () => { sessions: AssistantSession[] }
    appendEvent: AppendEvent
    onApplied?: (title: string) => void | Promise<void>
    announceState: boolean
}

async function runSessionTitleGeneration(args: SessionTitleGenerationTask): Promise<string | null> {
    if (pendingTitleGenerationSessionIds.has(args.sessionId)) return null
    pendingTitleGenerationSessionIds.add(args.sessionId)
    let settledState = false
    if (args.announceState) {
        const occurredAt = nowIso()
        args.appendEvent('session.updated', occurredAt, {
            sessionId: args.sessionId,
            patch: { titleGenerating: true }
        }, args.sessionId, args.threadId)
    }

    try {
        const generatedText = await generateSessionTitleText({
            prompt: args.prompt,
            cwd: args.cwd,
            preferredModel: args.preferredModel,
            generateText: args.generateText
        })
        if (!generatedText) return null

        const nextTitle = sanitizeGeneratedSessionTitle(generatedText, args.seedTitle)
        if (!nextTitle || nextTitle === args.seedTitle.trim()) return null

        const session = args.getSnapshot().sessions.find((entry) => entry.id === args.sessionId) || null
        if (!shouldApplyGeneratedTitle(session, args.seedTitle)) return null

        const occurredAt = nowIso()
        args.appendEvent('session.updated', occurredAt, {
            sessionId: args.sessionId,
            patch: {
                title: nextTitle,
                titleGenerating: false,
                updatedAt: occurredAt
            }
        }, args.sessionId, args.threadId)
        settledState = true
        try {
            await args.onApplied?.(nextTitle)
        } catch (error) {
            log.warn('[Assistant] Generated title applied locally but canonical metadata update failed:', error)
        }
        return nextTitle
    } finally {
        pendingTitleGenerationSessionIds.delete(args.sessionId)
        if (args.announceState && !settledState) {
            const occurredAt = nowIso()
            args.appendEvent('session.updated', occurredAt, {
                sessionId: args.sessionId,
                patch: { titleGenerating: false }
            }, args.sessionId, args.threadId)
        }
    }
}

export function queueGeneratedSessionTitle(args: {
    sessionId: string
    threadId: string
    messageText: string
    seedTitle: string
    cwd: string
    preferredModel?: string | null
    generateText: AssistantTitleTextGenerator
    getSnapshot: () => { sessions: AssistantSession[] }
    appendEvent: AppendEvent
    onApplied?: (title: string) => void | Promise<void>
}): Promise<void> {
    const task = runSessionTitleGeneration({
        ...args,
        prompt: buildSessionTitlePrompt(args.messageText, args.seedTitle),
        announceState: false
    }).then(() => undefined)
    task.catch((error) => {
        log.warn('[Assistant] Session title generation task failed:', error)
    })
    return task
}

export function regenerateSessionTitle(args: {
    sessionId: string
    threadId: string
    turns: AssistantReviewTurnIndexEntry[]
    seedTitle: string
    cwd: string
    preferredModel?: string | null
    generateText: AssistantTitleTextGenerator
    getSnapshot: () => { sessions: AssistantSession[] }
    appendEvent: AppendEvent
    onApplied?: (title: string) => void | Promise<void>
}): Promise<string | null> {
    return runSessionTitleGeneration({
        ...args,
        prompt: buildSessionRetitlePrompt(args.turns, args.seedTitle),
        announceState: true
    })
}
