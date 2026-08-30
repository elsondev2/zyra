import { scanMarkdownHeadingTargets } from '../markdown/markdownHeadingIds'

export type MarkdownHeadingViewportPosition = {
    id: string
    top: number
}

export type MarkdownLineAnchor = {
    sourceLine: number
    startHeadingId: string | null
    endHeadingId: string | null
    progress: number
}

type MarkdownHeadingLine = {
    id: string
    line: number
}

function clamp(value: number, minimum: number, maximum: number): number {
    return Math.min(maximum, Math.max(minimum, value))
}

function markdownLineCount(content: string): number {
    let lines = 1
    for (let index = 0; index < content.length; index += 1) {
        if (content.charCodeAt(index) === 10) lines += 1
    }
    return lines
}

function markdownHeadingLines(content: string): MarkdownHeadingLine[] {
    const headings = scanMarkdownHeadingTargets(content)
    const lines: MarkdownHeadingLine[] = []
    let cursor = 0
    let line = 1
    for (const heading of headings) {
        while (cursor < heading.offset && cursor < content.length) {
            if (content.charCodeAt(cursor) === 10) line += 1
            cursor += 1
        }
        lines.push({ id: heading.id, line })
    }
    return lines
}

export function resolveMarkdownLineAnchor(content: string, requestedLine: number): MarkdownLineAnchor {
    const totalLines = markdownLineCount(content)
    const sourceLine = clamp(Math.round(requestedLine) || 1, 1, totalLines)
    const headings = markdownHeadingLines(content)
    let start: MarkdownHeadingLine | null = null
    let end: MarkdownHeadingLine | null = null

    for (const heading of headings) {
        if (heading.line <= sourceLine) start = heading
        else {
            end = heading
            break
        }
    }

    const startLine = start?.line || 1
    const endLine = end?.line || totalLines
    const distance = Math.max(1, endLine - startLine)
    return {
        sourceLine,
        startHeadingId: start?.id || null,
        endHeadingId: end?.id || null,
        progress: clamp((sourceLine - startLine) / distance, 0, 1)
    }
}

export function resolveMarkdownSourceLineAtViewport({
    content,
    viewportTop,
    documentTop,
    documentBottom,
    headingPositions
}: {
    content: string
    viewportTop: number
    documentTop: number
    documentBottom: number
    headingPositions: readonly MarkdownHeadingViewportPosition[]
}): number {
    const totalLines = markdownLineCount(content)
    const lineByHeadingId = new Map(markdownHeadingLines(content).map((heading) => [heading.id, heading.line]))
    const positions = headingPositions
        .map((position) => ({
            id: position.id.replace(/^(?:user-content-)+/, ''),
            line: lineByHeadingId.get(position.id.replace(/^(?:user-content-)+/, '')),
            top: position.top
        }))
        .filter((position): position is { id: string; line: number; top: number } => typeof position.line === 'number')
        .sort((left, right) => left.top - right.top)

    let startTop = documentTop
    let startLine = 1
    let endTop = documentBottom
    let endLine = totalLines
    for (const position of positions) {
        if (position.top <= viewportTop) {
            startTop = position.top
            startLine = position.line
            continue
        }
        endTop = position.top
        endLine = position.line
        break
    }

    const progress = clamp((viewportTop - startTop) / Math.max(1, endTop - startTop), 0, 1)
    return clamp(Math.round(startLine + (endLine - startLine) * progress), 1, totalLines)
}
