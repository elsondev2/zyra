import type { ComposerContextFile } from './assistant-composer-types'

export const SLASH_COMMANDS = [
    { command: '/yolo', description: 'Switch this thread to full access locally.' },
    { command: '/safe', description: 'Switch this thread back to approval-required mode.' },
    { command: '/include', description: 'Add a file path to the composer context shelf.' }
]

export const DRAFT_STORAGE_KEY = 'devscope:assistant:draft:v2'
export const MAX_COMPOSER_HEIGHT = 180
const LARGE_PASTE_MIN_LINES = 40
const LARGE_PASTE_MIN_CHARS = 1200
export const MAX_ATTACHMENT_CONTENT_CHARS = 12_000
const MAX_PREVIEW_TEXT_CHARS = 220
export const MAX_IMAGE_DATA_URL_CHARS = 180_000
export const ATTACHMENT_REMOVE_MS = 190

const IMAGE_EXTENSION_BY_MIME: Record<string, string> = {
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/pjpeg': 'jpg',
    'image/pjp': 'jpg',
    'image/gif': 'gif',
    'image/webp': 'webp',
    'image/avif': 'avif',
    'image/apng': 'apng',
    'image/svg+xml': 'svg',
    'image/bmp': 'bmp',
    'image/x-ms-bmp': 'bmp',
    'image/vnd.microsoft.icon': 'ico',
    'image/x-icon': 'ico',
    'image/tiff': 'tif',
    'image/heic': 'heic',
    'image/heif': 'heif',
    'image/jfif': 'jfif',
    'image/jxl': 'jxl'
}

export function createAttachmentId(): string {
    return `ctx_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

export function summarizeTextPreview(raw: string): string {
    const normalized = String(raw || '')
        .replace(/\r/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim()
    if (!normalized) return ''
    const preview = normalized.slice(0, MAX_PREVIEW_TEXT_CHARS)
    return preview.length < normalized.length ? `${preview}...` : preview
}

export function isLargeTextPaste(raw: string): boolean {
    const text = String(raw || '')
    if (!text.trim()) return false
    const lines = text.split(/\r?\n/).length
    return lines >= LARGE_PASTE_MIN_LINES || text.length >= LARGE_PASTE_MIN_CHARS
}

export function toKbLabel(bytes?: number): string {
    if (!Number.isFinite(bytes)) return ''
    const value = Number(bytes)
    if (value < 1024) return `${value} B`
    return `${(value / 1024).toFixed(value >= 10 * 1024 ? 0 : 1)} KB`
}

export function getContextFileMeta(file: Partial<ComposerContextFile>): {
    name: string
    ext: string
    category: 'image' | 'code' | 'doc'
} {
    const rawPath = String(file.path || '').trim()
    const rawName = String(file.name || '').trim()
    const normalized = rawName || rawPath
    const name = normalized.split(/[/\\]/).pop() || normalized || 'attachment'
    const dotIndex = name.lastIndexOf('.')
    const ext = dotIndex > 0 ? name.slice(dotIndex + 1).toLowerCase() : ''
    const mimeType = String(file.mimeType || '').toLowerCase()

    const imageExts = new Set([
        'png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'ico', 'tif', 'tiff',
        'avif', 'apng', 'heic', 'heif', 'jfif', 'jxl'
    ])
    const codeExts = new Set([
        'ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs', 'json', 'py', 'go', 'rs', 'java', 'kt', 'cs', 'cpp', 'c', 'h',
        'css', 'scss', 'sass', 'html', 'xml', 'yml', 'yaml', 'toml', 'sh', 'ps1', 'sql', 'md'
    ])

    if (file.kind === 'image' || mimeType.startsWith('image/') || imageExts.has(ext)) {
        return { name, ext: ext || 'img', category: 'image' }
    }
    if (file.kind === 'code' || codeExts.has(ext)) {
        return { name, ext: ext || 'code', category: 'code' }
    }
    return { name, ext: ext || 'file', category: 'doc' }
}

export function buildAttachmentPath(source: 'paste' | 'manual', name: string): string {
    if (source === 'paste') return `clipboard://${name}`
    return name
}

export function isClipboardReferencePath(value: string | null | undefined): boolean {
    return String(value || '').trim().toLowerCase().startsWith('clipboard://')
}

export function buildClipboardAttachmentReference(file: Partial<ComposerContextFile>): string {
    const rawPath = String(file.path || '').trim()
    if (isClipboardReferencePath(rawPath)) return rawPath

    const rawName = String(file.name || '').trim()
    const tail = rawPath
        ? (rawPath.split(/[/\\]/).pop() || rawName || 'attachment')
        : (rawName || 'attachment')

    return `clipboard://${tail}`
}

export function inferImageExtensionFromMimeType(mimeType?: string): string {
    const normalized = String(mimeType || '').trim().toLowerCase()
    if (!normalized) return 'png'
    if (IMAGE_EXTENSION_BY_MIME[normalized]) return IMAGE_EXTENSION_BY_MIME[normalized]
    if (!normalized.startsWith('image/')) return 'png'

    const subtype = normalized.slice('image/'.length)
        .split(';')[0]
        .split('+')[0]
        .trim()
    if (!subtype) return 'png'
    if (subtype === 'jpeg') return 'jpg'
    return subtype.replace(/[^a-z0-9]/g, '') || 'png'
}

export async function readFileAsDataUrl(file: File): Promise<string> {
    return await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onerror = () => reject(new Error('Failed to read image from clipboard.'))
        reader.onload = () => resolve(String(reader.result || ''))
        reader.readAsDataURL(file)
    })
}

export function buildTextAttachmentFromPaste(text: string): ComposerContextFile {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    const name = 'Pasted text'
    const referenceName = `pasted-text-${timestamp}.txt`
    const trimmed = text.length > MAX_ATTACHMENT_CONTENT_CHARS
        ? `${text.slice(0, MAX_ATTACHMENT_CONTENT_CHARS)}\n\n[truncated]`
        : text

    return {
        id: createAttachmentId(),
        path: buildAttachmentPath('paste', referenceName),
        name,
        kind: 'doc',
        mimeType: 'text/plain',
        sizeBytes: text.length,
        content: trimmed,
        previewText: summarizeTextPreview(text),
        source: 'paste',
        animateIn: true
    }
}

export function isPastedTextAttachment(file: ComposerContextFile): boolean {
    const mime = String(file.mimeType || '').toLowerCase()
    const hasTextLikeMime = mime.startsWith('text/') || mime.includes('json') || mime.includes('xml')
    const isTextKind = file.kind === 'doc' || file.kind === 'code'
    return file.source === 'paste' && Boolean(file.content) && (hasTextLikeMime || isTextKind)
}

export function getContentTypeTag(file: ComposerContextFile): string {
    const meta = getContextFileMeta(file)
    if (meta.category === 'image') return 'IMAGE'
    if (meta.category === 'code') return 'CODE'
    if (isPastedTextAttachment(file)) return 'TEXT'
    return 'FILE'
}

function isClipboardOriginAttachment(file: ComposerContextFile): boolean {
    if (file.source === 'paste') return true
    const normalizedPath = String(file.path || '').trim().toLowerCase()
    if (!normalizedPath) return false
    if (isClipboardReferencePath(normalizedPath)) return true
    return /[\\/](assistant|codex)[\\/].*?[\\/]attachments[\\/]clipboard[\\/]/i.test(normalizedPath)
}

function getClipboardAttachmentDisplayName(file: ComposerContextFile, category: ReturnType<typeof getContextFileMeta>['category']): string {
    const mime = String(file.mimeType || '').toLowerCase()
    if (category === 'image') return 'Pasted image'
    if (
        category === 'code'
        || isPastedTextAttachment(file)
        || mime.startsWith('text/')
        || mime.includes('json')
        || mime.includes('xml')
        || mime.includes('yaml')
    ) {
        return 'Pasted text'
    }
    return 'Pasted file'
}

export function buildPromptWithContextFiles(prompt: string, contextFiles: ComposerContextFile[]): string {
    const normalizedPrompt = String(prompt || '').trim()
    if (!contextFiles.length) return normalizedPrompt

    const attachmentSections = contextFiles.map((file, index) => {
        const meta = getContextFileMeta(file)
        const isClipboardAttachment = isClipboardOriginAttachment(file)
        const inlineContent = meta.category === 'image' ? '' : String(file.content || '')
        const headerLabel = isClipboardAttachment
            ? getClipboardAttachmentDisplayName(file, meta.category)
            : meta.name
        const header = `${index + 1}. ${headerLabel} [${getContentTypeTag(file)}]`
        const details = meta.category === 'image'
            ? [
                isClipboardAttachment
                    ? `ref: ${buildClipboardAttachmentReference(file)}`
                    : (file.path ? `path: ${file.path}` : ''),
                isClipboardAttachment
                    ? 'origin: pasted from clipboard; treat this as inline context only, not as a workspace file path or current working directory.'
                    : '',
                file.mimeType ? `mime: ${file.mimeType}` : '',
                Number.isFinite(file.sizeBytes) ? `size: ${Number(file.sizeBytes)} bytes` : ''
            ].filter(Boolean)
            : [
                isClipboardAttachment
                    ? `ref: ${buildClipboardAttachmentReference(file)}`
                    : (file.path ? `path: ${file.path}` : ''),
                isClipboardAttachment
                    ? 'origin: pasted from clipboard; treat this as inline context only, not as a workspace file path or current working directory.'
                    : '',
                file.mimeType ? `mime: ${file.mimeType}` : '',
                Number.isFinite(file.sizeBytes) ? `size: ${Number(file.sizeBytes)} bytes` : '',
                file.previewText ? `preview: ${file.previewText}` : '',
                inlineContent ? `content:\n${inlineContent}` : '',
                !inlineContent && file.previewDataUrl
                    ? 'note: image attached in composer UI; inline image payload omitted in this compatibility mode.'
                    : ''
            ].filter(Boolean)

        return `${header}\n${details.join('\n')}`.trim()
    })

    const intro = normalizedPrompt || 'Please use the attached context files.'
    return `${intro}\n\nAttached files (${contextFiles.length}):\n${attachmentSections.join('\n\n')}`
}
