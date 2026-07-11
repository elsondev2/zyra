export type SerializedAssistantAttachment = {
    name: string
    type: string
    path: string | null
    mime: string | null
    size: string | null
    preview: string | null
    note: string | null
    origin: string | null
    content: string | null
}

export type SerializedAssistantMessage = {
    body: string
    attachments: SerializedAssistantAttachment[]
}

const ATTACHMENT_BLOCK_MARKER = /\n\nAttached files \((\d+)\):\n/
const ATTACHMENT_HEADER_PATTERN = /^\d+\.\s+(.+?)\s+\[([A-Z]+)\]$/
const ATTACHMENT_DETAIL_KEYS = new Set(['path', 'ref', 'mime', 'size', 'preview', 'note', 'origin'])

function parseSerializedAttachmentSection(section: string, index: number): SerializedAssistantAttachment {
    const lines = section.split(/\r?\n/)
    const headerLine = lines[0]?.trim() || `${index + 1}. Attachment [FILE]`
    const headerMatch = headerLine.match(ATTACHMENT_HEADER_PATTERN)
    const details = new Map<string, string>()
    const contentLines: string[] = []
    let readingContent = false

    for (const rawLine of lines.slice(1)) {
        const trimmed = rawLine.trim()
        if (!readingContent && !trimmed) continue

        if (readingContent) {
            contentLines.push(rawLine)
            continue
        }

        if (/^content:\s*$/i.test(trimmed)) {
            readingContent = true
            continue
        }

        const separatorIndex = trimmed.indexOf(':')
        if (separatorIndex <= 0) continue
        const key = trimmed.slice(0, separatorIndex).trim().toLowerCase()
        const value = trimmed.slice(separatorIndex + 1).trim()
        if (!key || !value) continue
        if (!ATTACHMENT_DETAIL_KEYS.has(key)) continue
        details.set(key, value)
    }

    return {
        name: headerMatch?.[1]?.trim() || `Attachment ${index + 1}`,
        type: headerMatch?.[2]?.trim() || 'FILE',
        path: details.get('path') || details.get('ref') || null,
        mime: details.get('mime') || null,
        size: details.get('size') || null,
        preview: details.get('preview') || null,
        note: details.get('note') || null,
        origin: details.get('origin') || null,
        content: contentLines.length > 0 ? contentLines.join('\n').trimEnd() : null
    }
}

export function parseSerializedAssistantMessage(text: string): SerializedAssistantMessage {
    const source = String(text || '')
    const markerMatch = source.match(ATTACHMENT_BLOCK_MARKER)
    if (!markerMatch || markerMatch.index == null) {
        return { body: source, attachments: [] }
    }

    const body = source.slice(0, markerMatch.index).trimEnd()
    const attachmentBlock = source.slice(markerMatch.index + markerMatch[0].length).trim()
    if (!attachmentBlock) {
        return { body, attachments: [] }
    }

    const sections: string[] = []
    let currentSection: string[] = []

    for (const rawLine of attachmentBlock.split(/\r?\n/)) {
        const trimmed = rawLine.trim()
        if (ATTACHMENT_HEADER_PATTERN.test(trimmed)) {
            if (currentSection.length > 0) {
                sections.push(currentSection.join('\n'))
            }
            currentSection = [trimmed]
            continue
        }
        if (currentSection.length === 0) continue
        currentSection.push(rawLine)
    }

    if (currentSection.length > 0) {
        sections.push(currentSection.join('\n'))
    }

    return {
        body,
        attachments: sections.map((section, index) => parseSerializedAttachmentSection(section, index))
    }
}

export function stripSerializedAssistantAttachments(text: string): string {
    return parseSerializedAssistantMessage(text).body
}

export function isSerializedClipboardAttachment(value: SerializedAssistantAttachment | string | null | undefined): boolean {
    if (typeof value === 'string') {
        return value.trim().toLowerCase().startsWith('clipboard://')
    }
    if (!value) return false
    if (isSerializedClipboardAttachment(value.path)) return true
    return /pasted from clipboard/i.test(String(value.origin || ''))
}

export function getSerializedAttachmentDisplayName(attachment: SerializedAssistantAttachment): string {
    if (!isSerializedClipboardAttachment(attachment)) {
        return attachment.name || 'Attachment'
    }

    const normalizedType = String(attachment.type || '').trim().toUpperCase()
    const normalizedMime = String(attachment.mime || '').trim().toLowerCase()
    if (normalizedType === 'IMAGE' || normalizedMime.startsWith('image/')) return 'Pasted image'
    if (
        normalizedType === 'TEXT'
        || normalizedType === 'CODE'
        || normalizedMime.startsWith('text/')
        || normalizedMime.includes('json')
        || normalizedMime.includes('xml')
        || normalizedMime.includes('yaml')
    ) {
        return 'Pasted text'
    }
    return 'Pasted file'
}

export function deriveAttachmentOnlySessionTitle(attachments: SerializedAssistantAttachment[]): string {
    if (attachments.length === 0) return 'New Session'
    if (attachments.length === 1) return getSerializedAttachmentDisplayName(attachments[0]).slice(0, 60)

    const clipboardOnly = attachments.every((attachment) => isSerializedClipboardAttachment(attachment))
    if (clipboardOnly) return `Pasted attachments (${attachments.length})`.slice(0, 60)
    return `Attached files (${attachments.length})`.slice(0, 60)
}
