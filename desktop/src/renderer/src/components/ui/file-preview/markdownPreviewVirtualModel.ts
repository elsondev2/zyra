import { createMarkdownHeadingSlug, type MarkdownHeadingTarget } from '../markdown/markdownHeadingIds'

export const MARKDOWN_VIRTUAL_OVERSCAN_PX = 1_000
const MARKDOWN_CHUNK_TARGET_CHARS = 5_000
const MARKDOWN_CHUNK_TARGET_HEIGHT = 1_400
const MARKDOWN_CHUNK_HARD_MAX_CHARS = 16_000
const MARKDOWN_CONTAINER_FRAGMENT_CHARS = 256_000
const MARKDOWN_FOOTNOTE_ATOMIC_MAX_CHARS = 256_000
const ESTIMATED_LINE_WIDTH = 88

type MarkdownBlockKind = 'blank' | 'frontmatter' | 'fence' | 'html' | 'list' | 'blockquote' | 'table' | 'block'

type MutableSection = {
    id: string
    start: number
    end: number
    kind: MarkdownBlockKind
    renderPrefix?: string
    renderSuffix?: string
    headingIds?: string[]
    renderAsSource?: boolean
    estimatedHeight: number
}

export type MarkdownPreviewSection = MutableSection

export type MarkdownVirtualRange = {
    start: number
    end: number
}

function lineFence(content: string, first: number, contentEnd: number, indent: number): { markerCode: number; marker: string } | null {
    if (indent > 3 || first + 2 >= contentEnd) return null
    const markerCode = content.charCodeAt(first)
    if (markerCode !== 96 && markerCode !== 126) return null
    let markerEnd = first
    while (markerEnd < contentEnd && content.charCodeAt(markerEnd) === markerCode) markerEnd += 1
    if (markerEnd - first < 3) return null
    return { markerCode, marker: content.slice(first, markerEnd) }
}

function closesFence(content: string, first: number, contentEnd: number, indent: number, markerCode: number, markerLength: number): boolean {
    if (indent > 3 || content.charCodeAt(first) !== markerCode) return false
    let markerEnd = first
    while (markerEnd < contentEnd && content.charCodeAt(markerEnd) === markerCode) markerEnd += 1
    if (markerEnd - first < markerLength) return false
    while (markerEnd < contentEnd) {
        const code = content.charCodeAt(markerEnd)
        if (code !== 32 && code !== 9 && code !== 13) return false
        markerEnd += 1
    }
    return true
}

function isListLine(content: string, first: number, contentEnd: number, indent: number): boolean {
    if (indent > 3 || first >= contentEnd) return false
    const firstCode = content.charCodeAt(first)
    if (firstCode === 45 || firstCode === 43 || firstCode === 42) {
        if (first + 1 >= contentEnd) return true
        const next = content.charCodeAt(first + 1)
        return next === 32 || next === 9
    }
    if (firstCode < 48 || firstCode > 57) return false
    let cursor = first
    while (cursor < contentEnd && cursor - first < 9) {
        const code = content.charCodeAt(cursor)
        if (code < 48 || code > 57) break
        cursor += 1
    }
    const marker = content.charCodeAt(cursor)
    if (marker !== 46 && marker !== 41) return false
    if (cursor + 1 >= contentEnd) return true
    const next = content.charCodeAt(cursor + 1)
    return next === 32 || next === 9
}

function listLineCanInterruptParagraph(content: string, first: number): boolean {
    const firstCode = content.charCodeAt(first)
    if (firstCode === 45 || firstCode === 43 || firstCode === 42) return true
    let cursor = first
    let value = 0
    while (cursor < content.length) {
        const code = content.charCodeAt(cursor)
        if (code < 48 || code > 57) break
        value = value * 10 + code - 48
        cursor += 1
    }
    return value === 1
}

function isSetextUnderline(content: string, start: number, end: number, markerCode: number): boolean {
    let markerCount = 0
    for (let index = start; index < end; index += 1) {
        const code = content.charCodeAt(index)
        if (code === markerCode) markerCount += 1
        else if (code !== 32 && code !== 9) return false
    }
    return markerCount > 0
}

function lineContains(content: string, start: number, end: number, code: number): boolean {
    for (let index = start; index < end; index += 1) {
        if (content.charCodeAt(index) === code) return true
    }
    return false
}

function isTableDelimiter(value: string): boolean {
    const text = value.trim()
    return text.includes('|') && text.includes('-') && /^\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?$/.test(text)
}

function htmlTerminator(value: string, indent: number): string | null {
    if (indent > 3 || value.charCodeAt(0) !== 60) return null
    if (/^<!--/.test(value)) return '-->'
    if (/^<\?/.test(value)) return '?>'
    if (/^<!\[CDATA\[/i.test(value)) return ']]>'
    if (/^<![A-Z]/.test(value)) return '>'
    const container = /^<(script|pre|style|textarea)(?:\s|>|$)/i.exec(value)
    return container ? `</${container[1].toLowerCase()}>` : null
}

function estimateLineHeight(content: string, first: number, contentEnd: number, blank: boolean, inFence: boolean): number {
    if (blank) return 8
    const length = contentEnd - first
    if (inFence) return 21
    const firstCode = content.charCodeAt(first)
    if (firstCode === 35) return 42
    if (firstCode === 124) return 31
    if (firstCode === 62) return Math.max(26, Math.ceil(length / ESTIMATED_LINE_WIDTH) * 23)
    if (firstCode === 45 || firstCode === 42 || firstCode === 43 || (firstCode >= 48 && firstCode <= 57)) return 27
    if (firstCode === 33 && content.charCodeAt(first + 1) === 91) return 180
    return Math.max(24, Math.ceil(length / ESTIMATED_LINE_WIDTH) * 23)
}

function definitionPrefixForSource(source: string, definitions: ReadonlyMap<string, string>): string {
    if (definitions.size === 0 || !source.includes('[')) return ''
    const labels = new Set<string>()
    for (const match of source.matchAll(/\[([^\]\n]+)\]\[([^\]\n]*)\]/g)) {
        const label = (match[2] || match[1]).trim().toLowerCase().replace(/\s+/g, ' ')
        if (label && !label.startsWith('^')) labels.add(label)
    }
    for (const match of source.matchAll(/(^|[^!])\[([^\]\n]+)\](?![\[(])/gm)) {
        const label = match[2].trim().toLowerCase().replace(/\s+/g, ' ')
        if (!label.startsWith('^') && definitions.has(label)) labels.add(label)
    }
    const resolved = [...labels].map((label) => definitions.get(label)).filter((value): value is string => Boolean(value))
    return resolved.length > 0 ? `${resolved.join('\n')}\n\n` : ''
}

function headingSourceText(source: string): string {
    return source
        .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
        .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
        .replace(/\[([^\]]+)\]\[[^\]]*\]/g, '$1')
        .replace(/<[^>]+>/g, '')
        .replace(/[`*_~]/g, '')
        .trim()
}

function assignHeadingTargets(headings: readonly MarkdownHeadingTarget[], sections: MutableSection[]): void {
    let sectionIndex = 0
    for (const heading of headings) {
        while (sectionIndex + 1 < sections.length && heading.offset >= sections[sectionIndex].end) sectionIndex += 1
        const section = sections[sectionIndex]
        if (heading.offset < section.start || heading.offset >= section.end) continue
        if (section.headingIds) section.headingIds.push(heading.id)
        else section.headingIds = [heading.id]
    }
}

function addDefinitionContext(content: string, definitions: ReadonlyMap<string, string>, sections: MutableSection[]): void {
    if (definitions.size === 0) return
    for (const section of sections) {
        const context = definitionPrefixForSource(content.slice(section.start, section.end), definitions)
        if (context) section.renderPrefix = `${context}${section.renderPrefix || ''}`
    }
}

function scanMarkdownPreviewSections(content: string, targetChars: number): MarkdownPreviewSection[] {
    if (!content) return []
    const sections: MutableSection[] = []
    const definitions = new Map<string, string>()
    const hardMax = Math.max(MARKDOWN_CHUNK_HARD_MAX_CHARS, targetChars * 2)
    let sectionStart = 0
    let sectionHeight = 20
    let sectionKind: MarkdownBlockKind = 'block'
    let sectionPrefix = ''
    let lineStart = 0
    let fenceMarkerCode = 0
    let fenceMarker = ''
    let fenceOpening = ''
    let blockKind: MarkdownBlockKind = 'block'
    let tableHeader = ''
    let previousNonBlankStart = -1
    let pendingBlankEnd = -1
    let frontmatter = false
    let htmlEndMarker = ''
    const frontmatterProbe = content.slice(0, MARKDOWN_CONTAINER_FRAGMENT_CHARS)
    const hasClosedFrontmatter = /^---\r?\n[\s\S]*?\r?\n(?:---|\.\.\.)[ \t]*(?:\r?\n|$)/.test(frontmatterProbe)
    const headingTargets: MarkdownHeadingTarget[] = []
    const headingCounts = new Map<string, number>()

    const recordHeading = (offset: number, source: string) => {
        const base = createMarkdownHeadingSlug(headingSourceText(source))
        const count = (headingCounts.get(base) || 0) + 1
        headingCounts.set(base, count)
        headingTargets.push({ offset, id: count === 1 ? base : `${base}-${count}` })
    }

    const pushSection = (end: number, suffix = '', nextPrefix = '', nextKind: MarkdownBlockKind = 'block') => {
        if (end <= sectionStart) return
        sections.push({
            id: `${sectionKind}:${sectionStart}:${end}`,
            start: sectionStart,
            end,
            kind: sectionKind,
            renderPrefix: sectionPrefix || undefined,
            renderSuffix: suffix || undefined,
            estimatedHeight: Math.max(72, Math.round(sectionHeight))
        })
        sectionStart = end
        sectionHeight = 20
        sectionPrefix = nextPrefix
        sectionKind = nextKind
    }

    while (lineStart < content.length) {
        const newline = content.indexOf('\n', lineStart)
        const lineEnd = newline < 0 ? content.length : newline
        const nextLineStart = newline < 0 ? content.length : newline + 1
        let contentEnd = lineEnd
        if (contentEnd > lineStart && content.charCodeAt(contentEnd - 1) === 13) contentEnd -= 1
        let first = lineStart
        let indent = 0
        while (first < contentEnd) {
            const code = content.charCodeAt(first)
            if (code === 32) {
                indent += 1
                first += 1
            } else if (code === 9) {
                indent += 4
                first += 1
            } else {
                break
            }
        }
        const blank = first >= contentEnd
        const firstCode = blank ? 0 : content.charCodeAt(first)
        const listLine = !blank && isListLine(content, first, contentEnd, indent)
        const blockquoteLine = !blank && indent <= 3 && firstCode === 62
        const headingLine = !blank && indent <= 3 && firstCode === 35
        let tableDelimiterLine = false
        let setextHeadingLine = false
        const wasInFence = fenceMarkerCode !== 0

        if (pendingBlankEnd >= 0 && !blank && !wasInFence) {
            const continuesContainer = (blockKind === 'list' && (indent > 0 || listLine))
                || (blockKind === 'blockquote' && blockquoteLine)
            if (!continuesContainer) {
                const reachedTarget = pendingBlankEnd - sectionStart >= targetChars || sectionHeight >= MARKDOWN_CHUNK_TARGET_HEIGHT
                if (reachedTarget) pushSection(pendingBlankEnd)
                blockKind = 'block'
                tableHeader = ''
            }
            pendingBlankEnd = -1
        }

        const listBoundaryLine: boolean = listLine && (blockKind === 'list' || listLineCanInterruptParagraph(content, first))
        const startsSafeBlock = listBoundaryLine || blockquoteLine || headingLine
        const continuesContainer = (listLine && blockKind === 'list') || (blockquoteLine && blockKind === 'blockquote')
        const reachedBeforeLine = lineStart - sectionStart >= targetChars || sectionHeight >= MARKDOWN_CHUNK_TARGET_HEIGHT
        const reachedContainerLimit = lineStart - sectionStart >= MARKDOWN_CONTAINER_FRAGMENT_CHARS
        if (
            !blank
            && !wasInFence
            && !frontmatter
            && !htmlEndMarker
            && startsSafeBlock
            && (continuesContainer ? reachedContainerLimit : reachedBeforeLine)
            && lineStart > sectionStart
        ) {
            const nextKind: MarkdownBlockKind = listBoundaryLine ? 'list' : blockquoteLine ? 'blockquote' : 'block'
            pushSection(lineStart, '', '', nextKind)
            blockKind = nextKind
            tableHeader = ''
        }

        const compactLine = contentEnd - first <= 8 ? content.slice(first, contentEnd).trim() : ''
        if (lineStart === 0 && compactLine === '---' && hasClosedFrontmatter) {
            frontmatter = true
            blockKind = 'frontmatter'
            sectionKind = 'frontmatter'
        }

        const descriptor = !wasInFence && !frontmatter && !htmlEndMarker
            ? lineFence(content, first, contentEnd, indent)
            : null
        const closingFence = wasInFence && closesFence(content, first, contentEnd, indent, fenceMarkerCode, fenceMarker.length)
        if (!wasInFence && !descriptor && !frontmatter && !htmlEndMarker) {
            if (headingLine) {
                const heading = /^(#{1,6})(?:[ \t]+|$)(.*?)(?:[ \t]+#+[ \t]*)?$/.exec(content.slice(first, contentEnd))
                if (heading) recordHeading(lineStart, heading[2])
            } else if (
                previousNonBlankStart >= sectionStart
                && (firstCode === 45 || firstCode === 61)
                && isSetextUnderline(content, first, contentEnd, firstCode)
                && !/^\s*(?:[-+*]|\d{1,9}[.)])(?:[ \t]+|$)/.test(content.slice(previousNonBlankStart, lineStart).trimEnd())
            ) {
                setextHeadingLine = true
                recordHeading(previousNonBlankStart, content.slice(previousNonBlankStart, lineStart).trimEnd())
            }
        }
        if (!wasInFence && !descriptor && indent <= 3 && firstCode === 91) {
            const definitionLine = content.slice(first, contentEnd)
            const definition = /^\[([^\]\n]+)\]:[ \t]*/.exec(definitionLine)
            if (definition) definitions.set(definition[1].trim().toLowerCase().replace(/\s+/g, ' '), definitionLine.trimEnd())
        }
        if (descriptor) {
            fenceMarkerCode = descriptor.markerCode
            fenceMarker = descriptor.marker
            fenceOpening = content.slice(lineStart, nextLineStart)
            blockKind = 'fence'
            if (sectionStart === lineStart) sectionKind = 'fence'
        }

        if (!wasInFence && !descriptor && !frontmatter && !htmlEndMarker && firstCode === 60) {
            const marker = htmlTerminator(content.slice(first, contentEnd), indent)
            if (marker) {
                htmlEndMarker = marker
                blockKind = 'html'
                if (sectionStart === lineStart) sectionKind = 'html'
            }
        }

        sectionHeight += estimateLineHeight(content, first, contentEnd, blank, wasInFence || Boolean(descriptor))

        if (frontmatter && lineStart > 0 && (compactLine === '---' || compactLine === '...')) frontmatter = false
        if (htmlEndMarker && content.slice(first, contentEnd).toLowerCase().includes(htmlEndMarker)) htmlEndMarker = ''
        if (closingFence) fenceMarkerCode = 0

        if (!blank && !wasInFence && !descriptor && !frontmatter && !htmlEndMarker) {
            const possibleTableDelimiter = firstCode === 124
                || ((firstCode === 45 || firstCode === 58) && lineContains(content, first, contentEnd, 124))
            tableDelimiterLine = possibleTableDelimiter && isTableDelimiter(content.slice(first, contentEnd))
            if (tableDelimiterLine && previousNonBlankStart >= sectionStart) {
                tableHeader = content.slice(previousNonBlankStart, nextLineStart)
                blockKind = 'table'
                if (sectionStart === previousNonBlankStart) sectionKind = 'table'
            } else if (listLine) {
                blockKind = 'list'
                if (sectionStart === lineStart) sectionKind = 'list'
            } else if (blockquoteLine) {
                blockKind = 'blockquote'
                if (sectionStart === lineStart) sectionKind = 'blockquote'
            }
        }

        const sectionLength = nextLineStart - sectionStart
        const reachedTarget = sectionLength >= targetChars || sectionHeight >= MARKDOWN_CHUNK_TARGET_HEIGHT
        const reachedHardLimit = sectionLength >= hardMax
        const insideFenceAfterLine = fenceMarkerCode !== 0

        if (insideFenceAfterLine && (reachedTarget || reachedHardLimit)) {
            const separator = content.charCodeAt(nextLineStart - 1) === 10 ? '' : '\n'
            pushSection(nextLineStart, `${separator}${fenceMarker}\n`, fenceOpening || `${fenceMarker}\n`, 'fence')
        } else if (!insideFenceAfterLine && !frontmatter && !htmlEndMarker) {
            if (blockKind === 'table' && tableHeader && sectionLength >= MARKDOWN_CONTAINER_FRAGMENT_CHARS && !tableDelimiterLine) {
                pushSection(nextLineStart, '', tableHeader, 'table')
            } else if (blockquoteLine && sectionLength >= MARKDOWN_CONTAINER_FRAGMENT_CHARS) {
                pushSection(nextLineStart, '', '', 'blockquote')
            } else if (blank) {
                pendingBlankEnd = nextLineStart
                if (blockKind !== 'list' && blockKind !== 'blockquote' && reachedTarget) {
                    pushSection(nextLineStart)
                    pendingBlankEnd = -1
                    blockKind = 'block'
                    tableHeader = ''
                }
            }
        }

        if (blank) {
            if (pendingBlankEnd >= 0) pendingBlankEnd = nextLineStart
            previousNonBlankStart = -1
        } else {
            previousNonBlankStart = headingLine || setextHeadingLine ? -1 : lineStart
        }
        lineStart = nextLineStart
    }

    if (sectionStart < content.length) pushSection(content.length)
    const hasFootnoteDefinitions = [...definitions.keys()].some((label) => label.startsWith('^'))
    if (hasFootnoteDefinitions && content.length > MARKDOWN_FOOTNOTE_ATOMIC_MAX_CHARS) {
        for (const section of sections) section.renderAsSource = true
    } else if (hasFootnoteDefinitions && sections.length > 1) {
        const estimatedHeight = Math.max(72, sections.reduce((total, section) => total + section.estimatedHeight - 20, 20))
        sections.splice(0, sections.length, {
            id: `block:0:${content.length}:footnotes`,
            start: 0,
            end: content.length,
            kind: 'block',
            estimatedHeight
        })
    } else {
        addDefinitionContext(content, definitions, sections)
    }
    assignHeadingTargets(headingTargets, sections)
    return sections
}

export function buildMarkdownPreviewSections(content: string, targetChars = MARKDOWN_CHUNK_TARGET_CHARS): MarkdownPreviewSection[] {
    return scanMarkdownPreviewSections(content, Math.max(512, targetChars))
}

export function markdownPreviewSectionSource(content: string, section: MarkdownPreviewSection): string {
    return content.slice(section.start, section.end)
}

export function markdownPreviewSectionRenderContent(content: string, section: MarkdownPreviewSection): string {
    const source = markdownPreviewSectionSource(content, section)
    return `${section.renderPrefix || ''}${source}${section.renderSuffix || ''}`
}

export function splitMarkdownPreviewSections(content: string, targetChars = MARKDOWN_CHUNK_TARGET_CHARS): string[] {
    return scanMarkdownPreviewSections(content, Math.max(512, targetChars)).map((section) => markdownPreviewSectionSource(content, section))
}

export function computeMarkdownVirtualRange(
    offsets: number[],
    viewportStart: number,
    viewportEnd: number,
    overscan = MARKDOWN_VIRTUAL_OVERSCAN_PX
): MarkdownVirtualRange {
    const rowCount = Math.max(0, offsets.length - 1)
    if (rowCount === 0) return { start: 0, end: 0 }
    const lower = Math.max(0, viewportStart - overscan)
    const upper = Math.max(lower, viewportEnd + overscan)
    let low = 0
    let high = rowCount
    while (low < high) {
        const middle = Math.floor((low + high) / 2)
        if (offsets[middle + 1] <= lower) low = middle + 1
        else high = middle
    }
    const start = Math.min(rowCount - 1, low)
    low = start
    high = rowCount
    while (low < high) {
        const middle = Math.floor((low + high) / 2)
        if (offsets[middle] < upper) low = middle + 1
        else high = middle
    }
    return { start, end: Math.max(start + 1, Math.min(rowCount, low)) }
}
