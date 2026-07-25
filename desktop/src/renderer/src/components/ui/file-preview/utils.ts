import {
    AUDIO_EXTENSIONS,
    CODE_LANGUAGE_BY_EXTENSION,
    CODE_LANGUAGE_BY_FILENAME,
    COLOR_SCAN_CHAR_LIMIT,
    CSV_EXTENSIONS,
    HTML_EXTENSIONS,
    IMAGE_EXTENSIONS,
    JSON_EXTENSIONS,
    MARKDOWN_EXTENSIONS,
    TEXT_EXTENSIONS,
    VIDEO_EXTENSIONS
} from './constants'
import type { PreviewFile, PreviewFileType, PreviewMediaItem, PreviewMediaSource, PreviewMediaType } from './types'

const HEX_COLOR_REGEX = /#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b/g
const FUNCTION_COLOR_REGEX = /\b(?:rgb|rgba|hsl|hsla|hwb|lab|lch|oklab|oklch|color)\(\s*[^()]{1,160}\)/gi
const COVER_ART_NAMES = ['cover', 'folder', 'front', 'album', 'artwork', 'art', 'thumb', 'thumbnail']

let colorValidationStyle: CSSStyleDeclaration | null = null

export function detectCodeLanguage(extLower: string, fileName: string): string | null {
    const fileNameLower = fileName.toLowerCase()
    return CODE_LANGUAGE_BY_FILENAME[fileNameLower] || CODE_LANGUAGE_BY_EXTENSION[extLower] || null
}

export function detectCsvDelimiter(content: string): string {
    const sample = content.split(/\r?\n/).find(line => line.trim().length > 0) || ''
    const counts = [
        { delimiter: ',', count: (sample.match(/,/g) || []).length },
        { delimiter: ';', count: (sample.match(/;/g) || []).length },
        { delimiter: '\t', count: (sample.match(/\t/g) || []).length }
    ]
    counts.sort((a, b) => b.count - a.count)
    return counts[0].count > 0 ? counts[0].delimiter : ','
}

export function parseDelimitedContent(content: string, delimiter: string): string[][] {
    const rows: string[][] = []
    let row: string[] = []
    let cell = ''
    let inQuotes = false

    for (let i = 0; i < content.length; i++) {
        const char = content[i]
        const nextChar = content[i + 1]

        if (char === '"') {
            if (inQuotes && nextChar === '"') {
                cell += '"'
                i += 1
            } else {
                inQuotes = !inQuotes
            }
            continue
        }

        if (!inQuotes && char === delimiter) {
            row.push(cell)
            cell = ''
            continue
        }

        if (!inQuotes && (char === '\n' || char === '\r')) {
            if (char === '\r' && nextChar === '\n') {
                i += 1
            }
            row.push(cell)
            rows.push(row)
            row = []
            cell = ''
            continue
        }

        cell += char
    }

    if (cell.length > 0 || row.length > 0) {
        row.push(cell)
        rows.push(row)
    }

    return rows
}

function isRenderableCssColor(value: string): boolean {
    if (!value || typeof document === 'undefined') return false
    if (!colorValidationStyle) {
        colorValidationStyle = document.createElement('span').style
    }
    colorValidationStyle.color = ''
    colorValidationStyle.color = value
    return colorValidationStyle.color !== ''
}

export function extractColorValues(content: string, maxItems: number): string[] {
    const scanSource = content.slice(0, COLOR_SCAN_CHAR_LIMIT)
    const matches: Array<{ value: string; index: number }> = []

    const collectMatches = (regex: RegExp) => {
        regex.lastIndex = 0
        let match: RegExpExecArray | null
        while ((match = regex.exec(scanSource)) !== null) {
            matches.push({ value: match[0], index: match.index })
            if (matches.length > 5000) break
        }
    }

    collectMatches(HEX_COLOR_REGEX)
    collectMatches(FUNCTION_COLOR_REGEX)

    matches.sort((a, b) => a.index - b.index)

    const colors: string[] = []
    const seen = new Set<string>()
    for (const match of matches) {
        const normalized = match.value.trim()
        const key = normalized.toLowerCase()
        if (seen.has(key)) continue
        if (!isRenderableCssColor(normalized)) continue

        seen.add(key)
        colors.push(normalized)
        if (colors.length >= maxItems) break
    }

    return colors
}

export function getFileUrl(filePath: string): string {
    if (filePath.toLowerCase().startsWith('data:image/')) return filePath
    if (filePath.startsWith('zyra://')) return filePath
    if (filePath.startsWith('devscope://')) return `zyra://${filePath.slice('devscope://'.length)}`

    const normalized = filePath.replace(/\\/g, '/')
    const isUncPath = normalized.startsWith('//')
    const trimmed = isUncPath
        ? normalized.slice(2)
        : normalized.startsWith('/') ? normalized.slice(1) : normalized
    const encoded = encodeURI(trimmed).replace(/#/g, '%23').replace(/\?/g, '%3F')

    return isUncPath ? `zyra://${encoded}` : `zyra:///${encoded}`
}

export function formatPreviewBytes(bytes?: number | null): string | null {
    if (typeof bytes !== 'number' || Number.isNaN(bytes) || bytes < 0) return null
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

export function resolvePreviewType(fileName: string, ext: string): { type: PreviewFileType; language?: string; needsContent: boolean } | null {
    const extLower = ext.toLowerCase()

    if (HTML_EXTENSIONS.has(extLower)) return { type: 'html', language: 'html', needsContent: true }
    if (MARKDOWN_EXTENSIONS.has(extLower)) return { type: 'md', needsContent: true }
    if (IMAGE_EXTENSIONS.has(extLower)) return { type: 'image', needsContent: false }
    if (VIDEO_EXTENSIONS.has(extLower)) return { type: 'video', needsContent: false }
    if (AUDIO_EXTENSIONS.has(extLower)) return { type: 'audio', needsContent: false }
    if (JSON_EXTENSIONS.has(extLower)) return { type: 'json', needsContent: true }

    if (CSV_EXTENSIONS.has(extLower)) {
        return { type: 'csv', language: extLower === 'tsv' ? 'tsv' : 'csv', needsContent: true }
    }

    const codeLanguage = detectCodeLanguage(extLower, fileName)
    if (codeLanguage) return { type: 'code', language: codeLanguage, needsContent: true }
    if (TEXT_EXTENSIONS.has(extLower)) return { type: 'text', needsContent: true }

    return null
}

export function isMediaPreviewType(type: PreviewFileType): type is PreviewMediaType {
    return type === 'image' || type === 'video' || type === 'audio'
}

function getPathDirectory(path: string): string {
    const normalizedPath = String(path || '').replace(/\\/g, '/')
    const lastSlashIndex = normalizedPath.lastIndexOf('/')
    return lastSlashIndex >= 0 ? normalizedPath.slice(0, lastSlashIndex) : ''
}

function getFileStem(name: string): string {
    const rawName = String(name || '')
    const dotIndex = rawName.lastIndexOf('.')
    return dotIndex > 0 ? rawName.slice(0, dotIndex) : rawName
}

function normalizeMediaStem(value: string): string {
    return String(value || '')
        .toLowerCase()
        .replace(/^[\s._-]*\d+[\s._-]*/, '')
        .replace(/[\s._-]*\([^)]*\)/g, '')
        .replace(/[\s._-]*\[[^\]]*\]/g, '')
        .replace(/[^a-z0-9]+/g, ' ')
        .trim()
}

function scoreCoverArtCandidate(target: PreviewMediaSource, candidate: PreviewMediaSource): number {
    const candidateStem = getFileStem(candidate.name)
    const targetStem = getFileStem(target.name)
    const normalizedCandidateStem = normalizeMediaStem(candidateStem)
    const normalizedTargetStem = normalizeMediaStem(targetStem)

    if (candidate.path === target.path) return -1
    if (candidateStem.toLowerCase() === targetStem.toLowerCase()) return 100
    if (normalizedCandidateStem && normalizedCandidateStem === normalizedTargetStem) return 90

    const coverNameIndex = COVER_ART_NAMES.indexOf(normalizedCandidateStem)
    if (coverNameIndex >= 0) {
        return 80 - coverNameIndex
    }

    if (normalizedTargetStem && normalizedCandidateStem && normalizedTargetStem.includes(normalizedCandidateStem)) {
        return 50
    }

    return 10
}

export function buildMediaPreviewSources(items: PreviewMediaSource[]): PreviewMediaItem[] {
    const deduped = new Map<string, PreviewMediaItem>()
    for (const item of items) {
        const name = String(item?.name || '').trim()
        const path = String(item?.path || '').trim()
        const extension = String(item?.extension || '').trim().toLowerCase()
        if (!name || !path) continue
        const previewTarget = resolvePreviewType(name, extension)
        if (!previewTarget || !isMediaPreviewType(previewTarget.type)) continue
        const dedupeKey = path.toLowerCase()
        if (deduped.has(dedupeKey)) continue
        deduped.set(dedupeKey, {
            name,
            path,
            extension,
            thumbnailPath: item.thumbnailPath ?? null,
            type: previewTarget.type
        })
    }

    const normalizedItems = Array.from(deduped.values())
    const imageGroups = new Map<string, PreviewMediaItem[]>()

    for (const item of normalizedItems) {
        const previewTarget = resolvePreviewType(item.name, item.extension)
        if (previewTarget?.type !== 'image') continue
        const directory = getPathDirectory(item.path).toLowerCase()
        const group = imageGroups.get(directory) || []
        group.push(item)
        imageGroups.set(directory, group)
    }

    return normalizedItems.map((item) => {
        const previewTarget = resolvePreviewType(item.name, item.extension)
        if (!previewTarget) return item

        if (previewTarget.type === 'image') {
            return { ...item, thumbnailPath: item.path }
        }

        if (previewTarget.type !== 'audio' && previewTarget.type !== 'video') {
            return item
        }

        const candidates = imageGroups.get(getPathDirectory(item.path).toLowerCase()) || []
        let bestCandidate: PreviewMediaSource | null = null
        let bestScore = -1
        for (const candidate of candidates) {
            const score = scoreCoverArtCandidate(item, candidate)
            if (score > bestScore) {
                bestScore = score
                bestCandidate = candidate
            }
        }

        return {
            ...item,
            thumbnailPath: bestCandidate?.path || item.thumbnailPath || null
        }
    })
}

export function isTextLikeFileType(type: PreviewFile['type']): boolean {
    return type === 'md' || type === 'json' || type === 'csv' || type === 'code' || type === 'text'
}
