import { app } from 'electron'
import { access, mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

type PersistedAttachmentSource = 'paste' | 'manual'

function sanitizeFileName(value: string, source: PersistedAttachmentSource): string {
    const trimmed = String(value || '').trim()
    const fallback = `${source === 'paste' ? 'clipboard' : 'attached'}-image-${Date.now()}.png`
    if (!trimmed) return fallback
    const normalized = trimmed.replace(/[<>:"/\\|?*\x00-\x1f]/g, '-')
    return normalized || fallback
}

function decodeDataUrl(dataUrl: string): Buffer {
    const match = String(dataUrl || '').match(/^data:([^;,]+)?;base64,(.+)$/i)
    if (!match) {
        throw new Error('Invalid clipboard image payload.')
    }
    return Buffer.from(match[2], 'base64')
}

export async function persistAssistantClipboardImage(input: {
    dataUrl: string
    fileName?: string
    source?: PersistedAttachmentSource
}): Promise<string> {
    const source = input.source === 'manual' ? 'manual' : 'paste'
    const assistantDir = getAssistantAttachmentsDir(source)
    await mkdir(assistantDir, { recursive: true })

    const fileName = sanitizeFileName(input.fileName || '', source)
    const storagePath = join(assistantDir, `${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${fileName}`)
    const bytes = decodeDataUrl(input.dataUrl)
    await writeFile(storagePath, bytes)
    return storagePath
}

function getAssistantClipboardAttachmentsDir(): string {
    return getAssistantAttachmentsDir('paste')
}

function getAssistantAttachmentsDir(source: PersistedAttachmentSource): string {
    return join(app.getPath('userData'), 'assistant', 'attachments', source === 'paste' ? 'clipboard' : 'files')
}

function parseClipboardAttachmentReference(reference: string): string | null {
    const normalized = String(reference || '').trim()
    if (!normalized.toLowerCase().startsWith('clipboard://')) return null
    const tail = normalized.slice('clipboard://'.length).trim().replace(/^[/\\]+/, '')
    if (!tail || /[/\\]/.test(tail)) return null
    return tail
}

export async function resolveAssistantClipboardAttachment(reference: string): Promise<string | null> {
    const fileName = parseClipboardAttachmentReference(reference)
    if (!fileName) return null

    const resolvedPath = join(getAssistantClipboardAttachmentsDir(), fileName)
    try {
        await access(resolvedPath)
        return resolvedPath
    } catch {
        return null
    }
}
