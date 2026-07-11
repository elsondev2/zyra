import { measureTextLayout } from './pretext'

export type MarkdownEstimateProfile = 'assistant' | 'preview'
export type MarkdownBlockKind = 'heading' | 'paragraph' | 'list' | 'blockquote' | 'code' | 'table' | 'html' | 'hr'

export type MarkdownBlock = {
    id: string
    kind: MarkdownBlockKind
    raw: string
    text: string
    headingLevel?: number
    lineCount: number
}

type BlockEstimateProfile = {
    paragraphFont: string
    paragraphLineHeight: number
    paragraphSpacing: number
    listIndent: number
    listSpacing: number
    blockquoteIndent: number
    blockquoteSpacing: number
    codeFont: string
    codeLineHeight: number
    codePaddingY: number
    codeSpacing: number
    tableRowHeight: number
    tableSpacing: number
    hrHeight: number
    hrSpacing: number
    heading: Record<number, { font: string; lineHeight: number; spacing: number }>
}

const PROFILE_MAP: Record<MarkdownEstimateProfile, BlockEstimateProfile> = {
    assistant: {
        paragraphFont: '400 13px Inter',
        paragraphLineHeight: 24,
        paragraphSpacing: 12,
        listIndent: 24,
        listSpacing: 12,
        blockquoteIndent: 18,
        blockquoteSpacing: 16,
        codeFont: '400 13px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
        codeLineHeight: 24,
        codePaddingY: 32,
        codeSpacing: 16,
        tableRowHeight: 34,
        tableSpacing: 16,
        hrHeight: 1,
        hrSpacing: 24,
        heading: {
            1: { font: '700 24px Inter', lineHeight: 36, spacing: 18 },
            2: { font: '600 20px Inter', lineHeight: 32, spacing: 16 },
            3: { font: '600 18px Inter', lineHeight: 30, spacing: 14 },
            4: { font: '600 16px Inter', lineHeight: 28, spacing: 12 },
            5: { font: '600 14px Inter', lineHeight: 24, spacing: 10 },
            6: { font: '600 13px Inter', lineHeight: 24, spacing: 10 }
        }
    },
    preview: {
        paragraphFont: '400 14px Inter',
        paragraphLineHeight: 24,
        paragraphSpacing: 16,
        listIndent: 24,
        listSpacing: 14,
        blockquoteIndent: 18,
        blockquoteSpacing: 18,
        codeFont: '400 13px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
        codeLineHeight: 24,
        codePaddingY: 32,
        codeSpacing: 18,
        tableRowHeight: 36,
        tableSpacing: 18,
        hrHeight: 1,
        hrSpacing: 28,
        heading: {
            1: { font: '700 24px Inter', lineHeight: 36, spacing: 20 },
            2: { font: '600 20px Inter', lineHeight: 32, spacing: 18 },
            3: { font: '600 18px Inter', lineHeight: 30, spacing: 16 },
            4: { font: '600 16px Inter', lineHeight: 28, spacing: 12 },
            5: { font: '600 14px Inter', lineHeight: 24, spacing: 10 },
            6: { font: '600 13px Inter', lineHeight: 24, spacing: 10 }
        }
    }
}

const MARKDOWN_BLOCK_CACHE_LIMIT = 120
const markdownBlockCache = new Map<string, MarkdownBlock[]>()
const markdownEstimateCache = new Map<string, number>()

function touchCacheValue<T>(cache: Map<string, T>, key: string, value: T, limit: number): T {
    if (cache.has(key)) cache.delete(key)
    cache.set(key, value)
    while (cache.size > limit) {
        const oldestKey = cache.keys().next().value
        if (!oldestKey) break
        cache.delete(oldestKey)
    }
    return value
}

function countLines(text: string): number {
    return text.length === 0 ? 1 : text.split(/\r?\n/).length
}

function stripMarkdownDecorators(text: string): string {
    return text
        .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
        .replace(/`([^`]+)`/g, '$1')
        .replace(/\*\*([^*]+)\*\*/g, '$1')
        .replace(/\*([^*]+)\*/g, '$1')
        .replace(/~~([^~]+)~~/g, '$1')
        .replace(/^>\s?/gm, '')
        .replace(/^\s*([-*+]|\d+\.)\s+/gm, '')
        .replace(/^\s{0,3}#{1,6}\s+/gm, '')
        .replace(/\|/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
}

function flushBlock(blocks: MarkdownBlock[], kind: MarkdownBlockKind, lines: string[], index: number, headingLevel?: number) {
    if (lines.length === 0) return
    const raw = lines.join('\n').trimEnd()
    if (!raw.trim()) return

    const blockText = kind === 'code'
        ? lines.slice(1, lines.at(-1)?.startsWith('```') || lines.at(-1)?.startsWith('~~~') ? -1 : undefined).join('\n')
        : stripMarkdownDecorators(raw)

    blocks.push({
        id: `${kind}-${index}-${blocks.length}`,
        kind,
        raw,
        text: blockText,
        headingLevel,
        lineCount: countLines(raw)
    })
}

function isFence(line: string): boolean {
    return /^\s*(```|~~~)/.test(line)
}

function isHeading(line: string): boolean {
    return /^\s{0,3}#{1,6}\s+/.test(line)
}

function isHr(line: string): boolean {
    return /^\s{0,3}((\*\s*){3,}|(-\s*){3,}|(_\s*){3,})\s*$/.test(line)
}

function isBlockquote(line: string): boolean {
    return /^\s*>/.test(line)
}

function isList(line: string): boolean {
    return /^\s*(?:[-*+]|\d+\.)\s+/.test(line)
}

function isTable(line: string, nextLine?: string): boolean {
    if (!line.includes('|')) return false
    return typeof nextLine === 'string' && /^\s*\|?(?:\s*:?-{3,}:?\s*\|)+\s*:?-{3,}:?\s*\|?\s*$/.test(nextLine)
}

function isHtmlBlock(line: string): boolean {
    return /^\s*</.test(line)
}

export function parseMarkdownBlocks(content: string): MarkdownBlock[] {
    const cacheKey = content
    const cached = markdownBlockCache.get(cacheKey)
    if (cached) return touchCacheValue(markdownBlockCache, cacheKey, cached, MARKDOWN_BLOCK_CACHE_LIMIT)

    const lines = content.replace(/\r\n?/g, '\n').split('\n')
    const blocks: MarkdownBlock[] = []
    let index = 0

    while (index < lines.length) {
        const line = lines[index]
        const trimmed = line.trim()

        if (!trimmed) {
            index += 1
            continue
        }

        if (isFence(line)) {
            const fenceLines = [line]
            index += 1
            while (index < lines.length) {
                fenceLines.push(lines[index])
                if (isFence(lines[index])) {
                    index += 1
                    break
                }
                index += 1
            }
            flushBlock(blocks, 'code', fenceLines, index)
            continue
        }

        if (isHeading(line)) {
            const level = Math.min(6, Math.max(1, (line.match(/^(\s{0,3}#{1,6})/)?.[1].trim().length || 1)))
            flushBlock(blocks, 'heading', [line], index, level)
            index += 1
            continue
        }

        if (isHr(line)) {
            flushBlock(blocks, 'hr', [line], index)
            index += 1
            continue
        }

        if (isTable(line, lines[index + 1])) {
            const tableLines = [line, lines[index + 1]]
            index += 2
            while (index < lines.length && lines[index].includes('|') && lines[index].trim()) {
                tableLines.push(lines[index])
                index += 1
            }
            flushBlock(blocks, 'table', tableLines, index)
            continue
        }

        if (isBlockquote(line)) {
            const quoteLines: string[] = []
            while (index < lines.length && lines[index].trim() && isBlockquote(lines[index])) {
                quoteLines.push(lines[index])
                index += 1
            }
            flushBlock(blocks, 'blockquote', quoteLines, index)
            continue
        }

        if (isList(line)) {
            const listLines: string[] = []
            while (index < lines.length) {
                const candidate = lines[index]
                if (!candidate.trim()) {
                    listLines.push(candidate)
                    index += 1
                    continue
                }
                if (!isList(candidate) && !/^\s{2,}\S+/.test(candidate)) break
                listLines.push(candidate)
                index += 1
            }
            flushBlock(blocks, 'list', listLines, index)
            continue
        }

        if (isHtmlBlock(line)) {
            const htmlLines: string[] = []
            while (index < lines.length && lines[index].trim()) {
                htmlLines.push(lines[index])
                index += 1
            }
            flushBlock(blocks, 'html', htmlLines, index)
            continue
        }

        const paragraphLines: string[] = []
        while (index < lines.length) {
            const candidate = lines[index]
            if (!candidate.trim()) break
            if (isFence(candidate) || isHeading(candidate) || isHr(candidate) || isBlockquote(candidate) || isList(candidate) || isHtmlBlock(candidate) || isTable(candidate, lines[index + 1])) {
                break
            }
            paragraphLines.push(candidate)
            index += 1
        }
        flushBlock(blocks, 'paragraph', paragraphLines, index)
    }

    return touchCacheValue(markdownBlockCache, cacheKey, blocks, MARKDOWN_BLOCK_CACHE_LIMIT)
}

function estimateTextBlockHeight(
    text: string,
    width: number,
    font: string,
    lineHeight: number,
    extraSpacing: number
): number {
    const metrics = measureTextLayout({
        text,
        font,
        lineHeight,
        maxWidth: width,
        whiteSpace: 'normal',
        clampToAtLeastOneLine: true
    })
    return metrics.height + extraSpacing
}

export function estimateMarkdownBlockHeight(
    block: MarkdownBlock,
    width: number,
    profile: MarkdownEstimateProfile
): number {
    const safeWidth = Math.max(120, Math.floor(width))
    const config = PROFILE_MAP[profile]

    switch (block.kind) {
        case 'heading': {
            const headingLevel = block.headingLevel || 1
            const headingConfig = config.heading[headingLevel] || config.heading[6]
            return estimateTextBlockHeight(block.text, safeWidth, headingConfig.font, headingConfig.lineHeight, headingConfig.spacing)
        }
        case 'list':
            return estimateTextBlockHeight(
                block.text,
                Math.max(80, safeWidth - config.listIndent),
                config.paragraphFont,
                config.paragraphLineHeight,
                config.listSpacing
            )
        case 'blockquote':
            return estimateTextBlockHeight(
                block.text,
                Math.max(80, safeWidth - config.blockquoteIndent),
                config.paragraphFont,
                config.paragraphLineHeight,
                config.blockquoteSpacing
            )
        case 'code': {
            const contentLineCount = Math.max(1, block.text.split(/\r?\n/).length)
            return contentLineCount * config.codeLineHeight + config.codePaddingY + config.codeSpacing
        }
        case 'table': {
            const rowCount = Math.max(2, block.raw.split(/\r?\n/).filter(Boolean).length - 1)
            return rowCount * config.tableRowHeight + config.tableSpacing
        }
        case 'hr':
            return config.hrHeight + config.hrSpacing
        case 'html':
        case 'paragraph':
        default:
            return estimateTextBlockHeight(block.text || block.raw, safeWidth, config.paragraphFont, config.paragraphLineHeight, config.paragraphSpacing)
    }
}

export function estimateMarkdownContentHeight(
    content: string,
    width: number,
    profile: MarkdownEstimateProfile
): number {
    const safeWidth = Math.max(120, Math.floor(width))
    const cacheKey = `${profile}::${safeWidth}::${content}`
    const cached = markdownEstimateCache.get(cacheKey)
    if (cached != null) return touchCacheValue(markdownEstimateCache, cacheKey, cached, MARKDOWN_BLOCK_CACHE_LIMIT)

    const blocks = parseMarkdownBlocks(content)
    const estimatedHeight = blocks.reduce((sum, block) => sum + estimateMarkdownBlockHeight(block, safeWidth, profile), 0)
    return touchCacheValue(markdownEstimateCache, cacheKey, Math.max(1, Math.ceil(estimatedHeight)), MARKDOWN_BLOCK_CACHE_LIMIT)
}
