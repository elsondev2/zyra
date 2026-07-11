import type { DevScopePreviewTerminalSessionSummary } from '@shared/contracts/devscope-api'
import type { GitLineMarker } from './gitDiff'
import type { PreviewFile } from './types'

export type PendingIntent = 'close' | 'preview' | 'external'
export type OutlineItemKind = 'function' | 'class' | 'heading'
export type OutlineItem = {
    id: string
    label: string
    line: number
    kind: OutlineItemKind
    level: number
    children: OutlineItem[]
}
export type LocalDiffPreview = {
    additions: number
    deletions: number
    markers: GitLineMarker[]
}
export type PythonOutputSource = 'stdout' | 'stderr' | 'system'
export type PythonOutputEntry = {
    id: number
    source: PythonOutputSource
    text: string
    at: number
}
export type PreviewTerminalSessionItem = DevScopePreviewTerminalSessionSummary & {
    hasUnreadOutput?: boolean
}
export type PreviewTerminalState = 'idle' | 'connecting' | 'active' | 'exited' | 'error'
export type TerminalPanelPhase = 'hidden' | 'entering' | 'visible' | 'exiting'

export const LEFT_PANEL_MIN_WIDTH = 256
export const LEFT_PANEL_MAX_WIDTH = 460
export const RIGHT_PANEL_MIN_WIDTH = 240
export const RIGHT_PANEL_MAX_WIDTH = 520
export const PYTHON_OUTPUT_MAX_CHARS = 200_000
export const PYTHON_OUTPUT_MIN_HEIGHT = 96
export const PREVIEW_TERMINAL_MIN_HEIGHT = 140
export const TERMINAL_PANEL_ANIMATION_MS = 220

export function countLines(value: string): number {
    if (!value) return 0

    let count = 1
    for (let index = 0; index < value.length; index += 1) {
        if (value.charCodeAt(index) === 10) count += 1
    }
    return count
}

export function createPythonPreviewSessionId(): string {
    return `py-prev-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

export function createPreviewTerminalSessionId(): string {
    return `preview-term-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

export function readCssVariable(name: string, fallback: string): string {
    if (typeof window === 'undefined') return fallback
    const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
    return value || fallback
}

export function formatRelativeActivity(timestamp: number): string {
    const deltaMs = Math.max(0, Date.now() - timestamp)
    const seconds = Math.floor(deltaMs / 1000)
    if (seconds < 60) return `${seconds}s`
    const minutes = Math.floor(seconds / 60)
    if (minutes < 60) return `${minutes}m`
    const hours = Math.floor(minutes / 60)
    return `${hours}h`
}

export function mapTerminalStatusToState(status?: string | null): PreviewTerminalState {
    if (status === 'running') return 'active'
    if (status === 'error') return 'error'
    if (status === 'exited') return 'exited'
    return 'idle'
}

export function isEditableFileType(fileType: PreviewFile['type']): boolean {
    return fileType === 'md'
        || fileType === 'json'
        || fileType === 'csv'
        || fileType === 'code'
        || fileType === 'text'
        || fileType === 'html'
}

function countLineLeadingIndent(line: string): number {
    let count = 0
    for (const char of line) {
        if (char === ' ') {
            count += 1
            continue
        }
        if (char === '\t') {
            count += 4
            continue
        }
        break
    }
    return count
}

function countBraceDelta(line: string): { open: number; close: number } {
    const open = (line.match(/\{/g) || []).length
    const close = (line.match(/\}/g) || []).length
    return { open, close }
}

function stripHtmlTags(value: string): string {
    return value.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/\s+/g, ' ').trim()
}

function createOutlineNode(kind: OutlineItemKind, label: string, line: number, level: number, index: number): OutlineItem {
    return {
        id: `${kind}:${line}:${index}:${label}`,
        label,
        line,
        kind,
        level,
        children: []
    }
}

function extractHeadingOutline(lines: string[], fileType: PreviewFile['type']): OutlineItem[] {
    const roots: OutlineItem[] = []
    const stack: Array<{ level: number; node: OutlineItem }> = []
    let itemIndex = 0

    const pushNode = (node: OutlineItem) => {
        while (stack.length > 0 && stack[stack.length - 1].level >= node.level) {
            stack.pop()
        }

        const parent = stack[stack.length - 1]?.node
        if (parent) parent.children.push(node)
        else roots.push(node)

        stack.push({ level: node.level, node })
    }

    for (let index = 0; index < lines.length; index += 1) {
        const line = lines[index] || ''
        const trimmed = line.trim()
        if (!trimmed) continue

        const markdownHeadingMatch = /^(#{1,6})\s+(.+)$/.exec(trimmed)
        if (markdownHeadingMatch && (fileType === 'md' || fileType === 'text')) {
            pushNode(createOutlineNode('heading', markdownHeadingMatch[2].trim(), index + 1, markdownHeadingMatch[1].length, itemIndex))
            itemIndex += 1
            continue
        }

        if (fileType === 'html') {
            const htmlHeadingMatch = /<h([1-6])[^>]*>(.*?)<\/h\1>/i.exec(trimmed)
            if (htmlHeadingMatch) {
                const label = stripHtmlTags(htmlHeadingMatch[2])
                if (!label) continue
                pushNode(createOutlineNode('heading', label, index + 1, Number(htmlHeadingMatch[1]), itemIndex))
                itemIndex += 1
            }
        }
    }

    return roots
}

export function extractOutlineItems(content: string, fileType: PreviewFile['type']): OutlineItem[] {
    const lines = content.split(/\r?\n/)
    const headingTree = extractHeadingOutline(lines, fileType)
    if (headingTree.length > 0) {
        return headingTree.slice(0, 120)
    }

    const items: OutlineItem[] = []
    const classStack: Array<{ node: OutlineItem; scopeDepth: number }> = []
    let braceDepth = 0
    let itemIndex = 0

    const pushTopLevelItem = (item: OutlineItem) => {
        if (items.length >= 120) return false
        items.push(item)
        return true
    }

    for (let index = 0; index < lines.length; index += 1) {
        const line = lines[index] || ''
        const trimmed = line.trim()
        if (!trimmed) continue

        while (classStack.length > 0 && braceDepth < classStack[classStack.length - 1].scopeDepth) {
            classStack.pop()
        }

        const indent = countLineLeadingIndent(line)
        const { open, close } = countBraceDelta(line)
        const classMatch = /^(?:export\s+)?(?:default\s+)?class\s+([A-Za-z0-9_$]+)/.exec(trimmed)

        if (classMatch) {
            const level = classStack.length + 1
            const item = createOutlineNode('class', classMatch[1], index + 1, level, itemIndex)
            itemIndex += 1

            const parentClass = classStack[classStack.length - 1]?.node
            if (parentClass) parentClass.children.push(item)
            else if (!pushTopLevelItem(item)) break

            classStack.push({
                node: item,
                scopeDepth: Math.max(braceDepth + 1, braceDepth + open - close)
            })
        } else {
            const fnMatch = /^(?:export\s+)?(?:async\s+)?function\s+([A-Za-z0-9_$]+)/.exec(trimmed)
                || /^(?:export\s+)?(?:const|let|var)\s+([A-Za-z0-9_$]+)\s*=\s*(?:async\s*)?(?:\([^)]*\)|[A-Za-z0-9_$]+)\s*=>/.exec(trimmed)
                || /^(?:public\s+|private\s+|protected\s+|static\s+|async\s+)*([A-Za-z0-9_$]+)\s*\([^)]*\)\s*\{?$/.exec(trimmed)

            if (fnMatch) {
                const parentClass = classStack[classStack.length - 1]?.node
                const level = parentClass ? 2 : 1
                const item = createOutlineNode('function', fnMatch[1], index + 1, level + Math.floor(indent / 12), itemIndex)
                itemIndex += 1

                if (parentClass) parentClass.children.push(item)
                else if (!pushTopLevelItem(item)) break
            }
        }

        braceDepth = Math.max(0, braceDepth + open - close)
    }

    return items
}

export function buildLocalDiffPreview(previousContent: string, nextContent: string): LocalDiffPreview {
    const previousLines = previousContent.split(/\r?\n/)
    const nextLines = nextContent.split(/\r?\n/)

    let prefix = 0
    const minLength = Math.min(previousLines.length, nextLines.length)
    while (prefix < minLength && previousLines[prefix] === nextLines[prefix]) {
        prefix += 1
    }

    let suffix = 0
    while (
        suffix < (previousLines.length - prefix)
        && suffix < (nextLines.length - prefix)
        && previousLines[previousLines.length - 1 - suffix] === nextLines[nextLines.length - 1 - suffix]
    ) {
        suffix += 1
    }

    const removedCount = Math.max(0, previousLines.length - prefix - suffix)
    const addedCount = Math.max(0, nextLines.length - prefix - suffix)
    const markers: GitLineMarker[] = []

    if (addedCount > 0 && removedCount > 0) {
        for (let index = 0; index < addedCount; index += 1) {
            markers.push({ line: prefix + index + 1, type: 'modified' })
        }
    } else if (addedCount > 0) {
        for (let index = 0; index < addedCount; index += 1) {
            markers.push({ line: prefix + index + 1, type: 'added' })
        }
    } else if (removedCount > 0) {
        markers.push({ line: Math.max(1, prefix + 1), type: 'deleted' })
    }

    return {
        additions: addedCount,
        deletions: removedCount,
        markers
    }
}
