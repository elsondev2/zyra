import log from 'electron-log'
import type { AssistantDomainEvent, AssistantSession } from '../../shared/assistant/contracts'
import {
    getSerializedAttachmentDisplayName,
    isSerializedClipboardAttachment,
    parseSerializedAssistantMessage,
    type SerializedAssistantAttachment
} from '../../shared/assistant/message-attachments'
import { generateCodexText } from '../ai/codex'
import { isDefaultSessionTitle, nowIso } from './utils'

const SESSION_TITLE_MAX_LENGTH = 60
const DEFAULT_TITLE_GENERATION_MODEL = 'gpt-5.4-mini'
const ATTACHMENT_EXCERPT_LIMIT = 240
const BODY_EXCERPT_LIMIT = 720
const ATTACHMENT_LIMIT = 4

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
        'You write concise titles for coding assistant chat sessions.',
        'Return only the title text. Do not use quotes, markdown, JSON, or commentary.',
        `Keep the title under ${SESSION_TITLE_MAX_LENGTH} characters.`,
        'Prefer concrete technical nouns and task intent over generic wording.',
        'If the request is primarily attachment-driven, use the attachment context.',
        'Avoid generic titles like "Help with code" or "New session".',
        '',
        `Current heuristic title: ${seedTitle}`,
        '',
        'First user message:',
        body || '(no message body)',
        '',
        'Attachment context:',
        attachmentLines || '(no attachments)'
    ].join('\n') + attachmentOverflow
}

function shouldApplyGeneratedTitle(session: AssistantSession | null, seedTitle: string): boolean {
    if (!session) return false
    const currentTitle = String(session.title || '').trim()
    if (!currentTitle) return true
    if (isDefaultSessionTitle(currentTitle)) return true
    return currentTitle === seedTitle.trim()
}

function hasExistingSessionHistory(session: AssistantSession): boolean {
    return session.threads.some((thread) => (
        Number(thread.messageCount || 0) > 0
        || thread.messages.some((message) => message.role === 'user' && String(message.text || '').trim().length > 0)
    ))
}

function getTitleGenerationModelCandidates(_preferredModel?: string | null): string[] {
    return [DEFAULT_TITLE_GENERATION_MODEL]
}

async function generateSessionTitleText(args: {
    prompt: string
    cwd: string
    preferredModel?: string | null
}): Promise<string | null> {
    const modelCandidates = getTitleGenerationModelCandidates(args.preferredModel)
    let lastError: string | null = null

    for (const model of modelCandidates) {
        const result = await generateCodexText(args.prompt, {
            cwd: args.cwd,
            model
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

export function shouldGenerateSessionTitleForPrompt(session: AssistantSession): boolean {
    if (!isDefaultSessionTitle(session.title)) return false
    return !hasExistingSessionHistory(session)
}

export function queueGeneratedSessionTitle(args: {
    sessionId: string
    threadId: string
    messageText: string
    seedTitle: string
    cwd: string
    preferredModel?: string | null
    getSnapshot: () => { sessions: AssistantSession[] }
    appendEvent: AppendEvent
}): void {
    const prompt = buildSessionTitlePrompt(args.messageText, args.seedTitle)
    void (async () => {
        const generatedText = await generateSessionTitleText({
            prompt,
            cwd: args.cwd,
            preferredModel: args.preferredModel
        })
        if (!generatedText) return

        const nextTitle = sanitizeGeneratedSessionTitle(generatedText, args.seedTitle)
        if (!nextTitle || nextTitle === args.seedTitle.trim()) return

        const session = args.getSnapshot().sessions.find((entry) => entry.id === args.sessionId) || null
        if (!shouldApplyGeneratedTitle(session, args.seedTitle)) return

        const occurredAt = nowIso()
        args.appendEvent('session.updated', occurredAt, {
            sessionId: args.sessionId,
            patch: {
                title: nextTitle,
                updatedAt: occurredAt
            }
        }, args.sessionId, args.threadId)
    })().catch((error) => {
        log.warn('[Assistant] Session title generation task failed:', error)
    })
}
