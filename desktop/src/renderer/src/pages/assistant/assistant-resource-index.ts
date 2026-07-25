import { IMAGE_EXTENSIONS } from '@/components/ui/file-preview/constants'
import { resolveMarkdownPackageReference, looksLikeMarkdownFileReference } from '@/components/ui/markdown/fileReferences'
import { resolveMarkdownLinkTarget } from '@/components/ui/markdown/linkNavigation'
import type { ParsedUserAttachment } from './assistant-timeline-helpers'
import type { AssistantDiffTarget, AssistantDiffTurn } from './assistant-diff-types'
import { getAssistantLinkBaseFilePath, getAssistantRelativeFilePath } from './assistant-file-navigation'

export type AssistantResourceKind = 'image' | 'link'
export type AssistantResourceSource = 'changed' | 'generated' | 'attached' | 'mentioned'
export type AssistantResourceOriginKind = 'change' | 'prompt' | 'response' | 'attachment'

export type AssistantResourceOrigin = {
    key: string
    turnId: string
    turnNumber: number
    createdAt: string
    kind: AssistantResourceOriginKind
}

export type AssistantResource = {
    id: string
    kind: AssistantResourceKind
    title: string
    subtitle: string
    path: string | null
    url: string | null
    attachment: ParsedUserAttachment | null
    sources: AssistantResourceSource[]
    origins: AssistantResourceOrigin[]
    occurrenceCount: number
    latestAt: string
    latestTurnId: string
    latestTurnNumber: number
    latestDiffTarget: AssistantDiffTarget | null
    searchText: string
}

export type AssistantResourceIndex = {
    resources: AssistantResource[]
    totalOccurrences: number
    truncated: boolean
}

export const ASSISTANT_RESOURCE_INDEX_LIMIT = 500
export const ASSISTANT_RESOURCE_TURN_LIMIT = 2_000
export const ASSISTANT_RESOURCE_TEXT_BUDGET = 2_000_000
const ASSISTANT_RESOURCE_ORIGIN_LIMIT = 24
const ASSISTANT_RESOURCE_TEXT_LIMIT = 50_000
const ASSISTANT_RESOURCE_REFERENCES_PER_TEXT_LIMIT = 80
const MARKDOWN_LINK_PATTERN = /(!?)\[([^\]]*)\]\(\s*(<[^>]+>|[^\s)]+)(?:\s+['"][^'"]*['"])?\s*\)/g
const MARKDOWN_AUTOLINK_PATTERN = /<((?:https?:\/\/|\/\/)[^>\s]+)>/gi
const PLAIN_URL_PATTERN = /(?:https?:\/\/|\/\/)[^\s<>{}\[\]"']+/gi
const INLINE_CODE_PATTERN = /`([^`\r\n]{1,500})`/g

type MutableAssistantResource = Omit<AssistantResource, 'sources' | 'origins' | 'searchText'> & {
    sources: Set<AssistantResourceSource>
    origins: Map<string, AssistantResourceOrigin>
}

type ExtractedTextReference =
    | { kind: 'file'; target: string }
    | { kind: 'link'; url: string; title?: string; image?: boolean }

function normalizePathKey(value: string): string {
    const normalized = value.trim().replace(/\\/g, '/').replace(/\/+$/, '')
    return /^[A-Za-z]:\//.test(normalized) || normalized.startsWith('//')
        ? normalized.toLowerCase()
        : normalized
}

function basename(value: string): string {
    const normalized = value.replace(/\\/g, '/').replace(/\/+$/, '')
    return normalized.split('/').pop() || normalized
}

function imageExtension(value: string): string {
    const withoutLocation = value.split('#', 1)[0]?.split('?', 1)[0]?.replace(/:\d+(?::\d+)?$/, '') || ''
    const fileName = basename(withoutLocation)
    const extensionIndex = fileName.lastIndexOf('.')
    return extensionIndex >= 0 ? fileName.slice(extensionIndex + 1).toLowerCase() : ''
}

function looksLikeImageTarget(value: string): boolean {
    return IMAGE_EXTENSIONS.has(imageExtension(value))
}

function isImageAttachment(attachment: ParsedUserAttachment): boolean {
    return String(attachment.type || '').toUpperCase() === 'IMAGE'
        || String(attachment.mime || '').toLowerCase().startsWith('image/')
        || String(attachment.content || attachment.preview || '').toLowerCase().startsWith('data:image/')
        || looksLikeImageTarget(String(attachment.path || attachment.displayName || ''))
}

function normalizeWebUrl(rawValue: string): string | null {
    let value = String(rawValue || '').trim()
    if (!value) return null
    value = value.replace(/[.,;!?]+$/, '')
    if (value.startsWith('//')) value = `https:${value}`
    try {
        const url = new URL(value)
        if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
        return url.toString().slice(0, 2048)
    } catch {
        return null
    }
}

function resolveResourceFilePath(target: string, projectPath?: string | null): string | null {
    const normalizedTarget = String(target || '').trim()
    if (!normalizedTarget) return null
    const baseFilePath = getAssistantLinkBaseFilePath(projectPath)
    const resolved = resolveMarkdownLinkTarget(normalizedTarget, baseFilePath)
    if (resolved?.path) return resolved.path
    if (/^[A-Za-z]:[\\/]/.test(normalizedTarget) || normalizedTarget.startsWith('\\\\') || normalizedTarget.startsWith('/')) {
        return normalizedTarget.replace(/:\d+(?::\d+)?$/, '')
    }
    return null
}

function extractTextReferences(text: string, availableTextBudget = ASSISTANT_RESOURCE_TEXT_LIMIT): ExtractedTextReference[] {
    const source = String(text || '').slice(0, Math.min(ASSISTANT_RESOURCE_TEXT_LIMIT, Math.max(0, availableTextBudget)))
    if (!source) return []
    const candidates: Array<{ value: string; image: boolean; title?: string }> = []
    const addCandidate = (value: string, image = false, title?: string) => {
        const normalized = value.trim().replace(/^<|>$/g, '')
        if (!normalized) return
        const existing = candidates.find((candidate) => candidate.value === normalized)
        if (existing) {
            existing.image ||= image
            existing.title ||= title
            return
        }
        candidates.push({ value: normalized, image, title })
    }

    for (const match of source.matchAll(MARKDOWN_LINK_PATTERN)) {
        addCandidate(match[3] || '', match[1] === '!', String(match[2] || '').trim() || undefined)
    }
    for (const match of source.matchAll(MARKDOWN_AUTOLINK_PATTERN)) addCandidate(match[1] || '')
    for (const match of source.matchAll(PLAIN_URL_PATTERN)) addCandidate(match[0] || '')
    for (const match of source.matchAll(INLINE_CODE_PATTERN)) addCandidate(match[1] || '')

    return candidates.slice(0, ASSISTANT_RESOURCE_REFERENCES_PER_TEXT_LIMIT).flatMap((candidate): ExtractedTextReference[] => {
        const packageReference = resolveMarkdownPackageReference(candidate.value)
        if (packageReference) {
            return [{ kind: 'link', url: packageReference.href, title: packageReference.specifier }]
        }
        const url = normalizeWebUrl(candidate.value)
        if (url) return [{ kind: 'link', url, title: candidate.title, image: candidate.image || looksLikeImageTarget(url) }]
        return looksLikeMarkdownFileReference(candidate.value) ? [{ kind: 'file', target: candidate.value }] : []
    })
}

function originForTurn(turn: AssistantDiffTurn, kind: AssistantResourceOriginKind, suffix: string): AssistantResourceOrigin {
    return {
        key: `${turn.id}:${kind}:${suffix}`,
        turnId: turn.id,
        turnNumber: turn.number,
        createdAt: turn.updatedAt || turn.createdAt,
        kind
    }
}

function sourceLabel(sources: Iterable<AssistantResourceSource>): string {
    const labels: Record<AssistantResourceSource, string> = {
        changed: 'Changed image',
        generated: 'Generated image',
        attached: 'Attachment',
        mentioned: 'Mentioned in chat'
    }
    return [...sources].map((source) => labels[source]).join(' · ')
}

function attachmentIdentity(attachment: ParsedUserAttachment): string {
    const content = String(attachment.content || attachment.preview || '').trim()
    let hash = 2166136261
    for (let index = 0; index < content.length; index += 1) {
        hash ^= content.charCodeAt(index)
        hash = Math.imul(hash, 16777619)
    }
    return `${attachment.type}:${attachment.mime || ''}:${attachment.displayName}:${(hash >>> 0).toString(16)}`.toLowerCase()
}

export function buildAssistantResourceIndex(input: {
    turns: AssistantDiffTurn[]
    projectPath?: string | null
}): AssistantResourceIndex {
    const resources = new Map<string, MutableAssistantResource>()
    let totalOccurrences = 0
    let truncated = input.turns.length > ASSISTANT_RESOURCE_TURN_LIMIT
    let remainingTextBudget = ASSISTANT_RESOURCE_TEXT_BUDGET

    const upsert = (inputResource: {
        key: string
        kind: AssistantResourceKind
        title: string
        subtitle: string
        path?: string | null
        url?: string | null
        attachment?: ParsedUserAttachment | null
        source: AssistantResourceSource
        origin: AssistantResourceOrigin
        diffTarget?: AssistantDiffTarget | null
    }) => {
        totalOccurrences += 1
        const existing = resources.get(inputResource.key)
        if (!existing && resources.size >= ASSISTANT_RESOURCE_INDEX_LIMIT) {
            truncated = true
            return
        }
        if (existing) {
            existing.occurrenceCount += 1
            if (inputResource.kind === 'image') {
                existing.kind = 'image'
                existing.title = inputResource.title || existing.title
            }
            existing.sources.add(inputResource.source)
            if (existing.origins.size < ASSISTANT_RESOURCE_ORIGIN_LIMIT) {
                existing.origins.set(inputResource.origin.key, inputResource.origin)
            }
            if (inputResource.origin.createdAt >= existing.latestAt) {
                existing.latestAt = inputResource.origin.createdAt
                existing.latestTurnId = inputResource.origin.turnId
                existing.latestTurnNumber = inputResource.origin.turnNumber
                existing.subtitle = inputResource.subtitle || existing.subtitle
                existing.attachment = inputResource.attachment || existing.attachment
                existing.latestDiffTarget = inputResource.diffTarget || existing.latestDiffTarget
            }
            return
        }
        resources.set(inputResource.key, {
            id: inputResource.key,
            kind: inputResource.kind,
            title: inputResource.title,
            subtitle: inputResource.subtitle,
            path: inputResource.path || null,
            url: inputResource.url || null,
            attachment: inputResource.attachment || null,
            sources: new Set([inputResource.source]),
            origins: new Map([[inputResource.origin.key, inputResource.origin]]),
            occurrenceCount: 1,
            latestAt: inputResource.origin.createdAt,
            latestTurnId: inputResource.origin.turnId,
            latestTurnNumber: inputResource.origin.turnNumber,
            latestDiffTarget: inputResource.diffTarget || null
        })
    }

    const addImage = (turn: AssistantDiffTurn, rawTarget: string, source: AssistantResourceSource, originKind: AssistantResourceOriginKind, diffTarget?: AssistantDiffTarget | null, attachment?: ParsedUserAttachment | null) => {
        if (!looksLikeImageTarget(rawTarget) && (!attachment || !isImageAttachment(attachment))) return
        const path = resolveResourceFilePath(rawTarget, input.projectPath)
        if (!path) return
        const key = `image:${normalizePathKey(path)}`
        const displayPath = getAssistantRelativeFilePath(path, input.projectPath) || path
        upsert({
            key,
            kind: 'image',
            title: basename(path),
            subtitle: displayPath,
            path,
            attachment,
            source,
            origin: originForTurn(turn, originKind, normalizePathKey(rawTarget)),
            diffTarget
        })
    }

    const addLink = (turn: AssistantDiffTurn, rawUrl: string, originKind: AssistantResourceOriginKind, title?: string, image = false) => {
        const url = normalizeWebUrl(rawUrl)
        if (!url) return
        let hostname = url
        let imageTitle = ''
        try {
            const parsedUrl = new URL(url)
            hostname = parsedUrl.hostname
            imageTitle = basename(parsedUrl.pathname)
        } catch {
            // normalizeWebUrl already validated the URL.
        }
        const resourceKind: AssistantResourceKind = image || looksLikeImageTarget(url) ? 'image' : 'link'
        upsert({
            key: `url:${url}`,
            kind: resourceKind,
            title: title || (resourceKind === 'image' && imageTitle ? imageTitle : hostname),
            subtitle: url,
            url,
            source: 'mentioned',
            origin: originForTurn(turn, originKind, url)
        })
    }

    for (const turn of input.turns.slice(0, ASSISTANT_RESOURCE_TURN_LIMIT)) {
        const changes = turn.changes.length > 0 ? turn.changes : turn.files
        for (const change of changes) {
            addImage(
                turn,
                change.target.filePath,
                change.target.isNew || change.target.changeKind === 'add' ? 'generated' : 'changed',
                'change',
                change.target
            )
        }

        for (const attachment of turn.promptAttachments) {
            if (!isImageAttachment(attachment)) continue
            const path = String(attachment.path || '').trim()
            if (path && !attachment.isClipboard && !path.toLowerCase().startsWith('clipboard://')) {
                addImage(turn, path, 'attached', 'attachment', null, attachment)
                continue
            }
            const key = `image-attachment:${attachmentIdentity(attachment)}`
            upsert({
                key,
                kind: 'image',
                title: attachment.displayName || attachment.name || 'Image',
                subtitle: attachment.mime || 'Image attachment',
                attachment,
                source: 'attached',
                origin: originForTurn(turn, 'attachment', attachment.id)
            })
        }

        for (const [kind, text] of [['prompt', turn.prompt], ['response', turn.response]] as const) {
            if (resources.size >= ASSISTANT_RESOURCE_INDEX_LIMIT) {
                if (String(text || '').trim()) truncated = true
                break
            }
            const rawTextLength = String(text || '').length
            const textLength = Math.min(rawTextLength, ASSISTANT_RESOURCE_TEXT_LIMIT)
            if (rawTextLength > ASSISTANT_RESOURCE_TEXT_LIMIT) truncated = true
            if (remainingTextBudget <= 0) {
                if (String(text || '').trim()) truncated = true
                continue
            }
            const availableTextBudget = Math.min(remainingTextBudget, textLength)
            if (availableTextBudget < textLength) truncated = true
            remainingTextBudget -= availableTextBudget
            for (const reference of extractTextReferences(text, availableTextBudget)) {
                if (reference.kind === 'file') addImage(turn, reference.target, 'mentioned', kind)
                else addLink(turn, reference.url, kind, reference.title, reference.image)
            }
        }
    }

    const result = [...resources.values()].map((resource): AssistantResource => {
        const sources = [...resource.sources]
        const origins = [...resource.origins.values()].sort((left, right) => (
            right.createdAt.localeCompare(left.createdAt) || right.turnNumber - left.turnNumber
        ))
        return {
            ...resource,
            sources,
            origins,
            searchText: [
                resource.title,
                resource.subtitle,
                resource.path || '',
                resource.url || '',
                resource.latestDiffTarget?.previousPath || '',
                sourceLabel(sources),
                ...origins.flatMap((origin) => [`turn ${origin.turnNumber}`, `#${origin.turnNumber}`, origin.kind])
            ].join(' ').toLowerCase()
        }
    }).sort((left, right) => (
        right.latestAt.localeCompare(left.latestAt)
        || right.latestTurnNumber - left.latestTurnNumber
        || left.title.localeCompare(right.title)
    ))

    return { resources: result, totalOccurrences, truncated }
}
