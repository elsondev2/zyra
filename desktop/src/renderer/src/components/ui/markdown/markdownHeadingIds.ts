export const MARKDOWN_PREVIEW_NAVIGATE_EVENT = 'zyra:markdown-preview-navigate'
export const MARKDOWN_PREVIEW_ACTIVE_HEADING_EVENT = 'zyra:markdown-preview-active-heading'

export type MarkdownHeadingTarget = {
    offset: number
    id: string
    text?: string
    depth?: number
}

export function createMarkdownHeadingSlug(value: string): string {
    const slug = value
        .normalize('NFKD')
        .toLowerCase()
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^\p{Letter}\p{Number}\s-]/gu, '')
        .trim()
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
    return slug || 'section'
}

function markdownHeadingText(source: string): string {
    return source
        .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
        .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
        .replace(/\[([^\]]+)\]\[[^\]]*\]/g, '$1')
        .replace(/<[^>]+>/g, '')
        .replace(/[`*_~]/g, '')
        .trim()
}

export function scanMarkdownHeadingTargets(content: string): MarkdownHeadingTarget[] {
    const targets: MarkdownHeadingTarget[] = []
    const counts = new Map<string, number>()
    let lineStart = 0
    let previousTextStart = -1
    let previousTextEnd = -1
    let fenceMarkerCode = 0
    let fenceMarkerLength = 0
    const pushHeading = (offset: number, text: string, depth: number) => {
        const plainText = markdownHeadingText(text)
        const base = createMarkdownHeadingSlug(plainText)
        const count = (counts.get(base) || 0) + 1
        counts.set(base, count)
        targets.push({ offset, id: count === 1 ? base : `${base}-${count}`, text: plainText, depth })
    }

    while (lineStart < content.length) {
        const newline = content.indexOf('\n', lineStart)
        const lineEnd = newline < 0 ? content.length : newline
        const nextLineStart = newline < 0 ? content.length : newline + 1
        let contentEnd = lineEnd
        if (contentEnd > lineStart && content.charCodeAt(contentEnd - 1) === 13) contentEnd -= 1
        let first = lineStart
        while (first < contentEnd && content.charCodeAt(first) === 32 && first - lineStart < 4) first += 1
        const text = content.slice(first, contentEnd)
        const firstCode = content.charCodeAt(first)
        if (fenceMarkerCode) {
            let markerEnd = first
            while (markerEnd < contentEnd && content.charCodeAt(markerEnd) === fenceMarkerCode) markerEnd += 1
            if (markerEnd - first >= fenceMarkerLength && content.slice(markerEnd, contentEnd).trim() === '') {
                fenceMarkerCode = 0
                fenceMarkerLength = 0
            }
            previousTextStart = previousTextEnd = -1
            lineStart = nextLineStart
            continue
        }
        if (first - lineStart <= 3 && (firstCode === 96 || firstCode === 126)) {
            let markerEnd = first
            while (markerEnd < contentEnd && content.charCodeAt(markerEnd) === firstCode) markerEnd += 1
            if (markerEnd - first >= 3) {
                fenceMarkerCode = firstCode
                fenceMarkerLength = markerEnd - first
                previousTextStart = previousTextEnd = -1
                lineStart = nextLineStart
                continue
            }
        }
        const atx = /^(#{1,6})(?:[ \t]+|$)(.*?)(?:[ \t]+#+[ \t]*)?$/.exec(text)
        if (atx) {
            pushHeading(lineStart, atx[2], atx[1].length)
            previousTextStart = previousTextEnd = -1
        } else if (previousTextStart >= 0 && /^(?:=+|-+)[ \t]*$/.test(text)) {
            pushHeading(previousTextStart, content.slice(previousTextStart, previousTextEnd), text.trimStart().startsWith('=') ? 1 : 2)
            previousTextStart = previousTextEnd = -1
        } else if (text.trim()) {
            previousTextStart = first
            previousTextEnd = contentEnd
        } else {
            previousTextStart = previousTextEnd = -1
        }
        lineStart = nextLineStart
    }
    return targets
}
