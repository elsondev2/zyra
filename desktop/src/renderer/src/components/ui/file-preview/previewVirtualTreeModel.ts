import type { DevScopeFileTreeNode } from '@shared/contracts/devscope-project-contracts'

export type PreviewVirtualTreeRow = {
    key: string
    node: DevScopeFileTreeNode
    depth: number
    parentKey: string | null
    positionInSet: number
    setSize: number
}

export type PreviewVirtualRange = {
    start: number
    end: number
}

export type PreviewTreeScrollAlignment = 'auto' | 'top' | 'center'

export function previewTreeScrollTopForIndex({
    index,
    rowCount,
    rowHeight,
    viewportHeight,
    currentScrollTop,
    alignment
}: {
    index: number
    rowCount: number
    rowHeight: number
    viewportHeight: number
    currentScrollTop: number
    alignment: PreviewTreeScrollAlignment
}): number {
    if (rowCount <= 0 || rowHeight <= 0) return 0
    const safeViewportHeight = Math.max(rowHeight, viewportHeight)
    const safeIndex = Math.max(0, Math.min(rowCount - 1, index))
    const rowTop = safeIndex * rowHeight
    const rowBottom = rowTop + rowHeight
    const maxScrollTop = Math.max(0, rowCount * rowHeight - safeViewportHeight)
    const viewportTop = Math.max(0, Math.min(maxScrollTop, currentScrollTop))
    const viewportBottom = viewportTop + safeViewportHeight

    if (alignment === 'center') {
        return Math.max(0, Math.min(maxScrollTop, rowTop - (safeViewportHeight - rowHeight) / 2))
    }
    if (alignment === 'top') return Math.max(0, Math.min(maxScrollTop, rowTop))
    if (rowTop < viewportTop) return Math.max(0, Math.min(maxScrollTop, rowTop))
    if (rowBottom > viewportBottom) return Math.max(0, Math.min(maxScrollTop, rowBottom - safeViewportHeight))
    return viewportTop
}

export function previewDirectoryCanExpand(node: DevScopeFileTreeNode, directoryOnly = false): boolean {
    if (node.type !== 'directory') return false
    if (Array.isArray(node.children)) {
        return directoryOnly ? node.children.some((child) => child.type === 'directory') : node.children.length > 0
    }
    if (directoryOnly && typeof node.hasDirectoryChildren === 'boolean') return node.hasDirectoryChildren
    return node.childrenLoaded !== true
}

export function previewTreeAnchoredScrollTop(
    previousRows: readonly PreviewVirtualTreeRow[],
    nextRowIndexByKey: ReadonlyMap<string, number>,
    scrollTop: number,
    rowHeight: number
): number | null {
    if (previousRows.length === 0 || rowHeight <= 0) return null
    const anchorIndex = Math.min(previousRows.length - 1, Math.floor(Math.max(0, scrollTop) / rowHeight))
    const anchor = previousRows[anchorIndex]
    const nextAnchorIndex = anchor ? nextRowIndexByKey.get(anchor.key) : undefined
    if (nextAnchorIndex === undefined) return null
    return nextAnchorIndex * rowHeight + (Math.max(0, scrollTop) - anchorIndex * rowHeight)
}

export function normalizePreviewTreePath(pathValue: string): string {
    const normalized = String(pathValue || '').replace(/\\/g, '/').replace(/\/+$/, '')
    return /^[a-z]:\//i.test(normalized) || normalized.startsWith('//')
        ? normalized.toLowerCase()
        : normalized
}

export type PreviewVisibleTreeModel = {
    rows: PreviewVirtualTreeRow[]
    rowIndexByKey: Map<string, number>
    horizontalContentWidth: number
}

type PreviewTreeNodeLayoutIdentity = {
    path: string
    name: string
    key: string
    nameWidth: number
}

const previewTreeNodeLayoutIdentityCache = new WeakMap<DevScopeFileTreeNode, PreviewTreeNodeLayoutIdentity>()

function readPreviewTreeNodeLayoutIdentity(node: DevScopeFileTreeNode): PreviewTreeNodeLayoutIdentity {
    const cached = previewTreeNodeLayoutIdentityCache.get(node)
    if (cached?.path === node.path && cached.name === node.name) return cached
    const identity = {
        path: node.path,
        name: node.name,
        key: normalizePreviewTreePath(node.path),
        nameWidth: node.name.length * 7.25
    }
    previewTreeNodeLayoutIdentityCache.set(node, identity)
    return identity
}

export function buildVisiblePreviewTreeModel(
    nodes: DevScopeFileTreeNode[],
    expandedPathKeys: ReadonlySet<string>
): PreviewVisibleTreeModel {
    const rows: PreviewVirtualTreeRow[] = []
    const rowIndexByKey = new Map<string, number>()
    let horizontalContentWidth = 240

    const visit = (entries: DevScopeFileTreeNode[], depth: number, parentKey: string | null) => {
        const setSize = entries.length
        for (let index = 0; index < entries.length; index += 1) {
            const node = entries[index]
            const identity = readPreviewTreeNodeLayoutIdentity(node)
            const key = identity.key
            const row: PreviewVirtualTreeRow = {
                key,
                node,
                depth,
                parentKey,
                positionInSet: index + 1,
                setSize
            }
            rowIndexByKey.set(key, rows.length)
            rows.push(row)
            horizontalContentWidth = Math.max(
                horizontalContentWidth,
                Math.ceil(depth * 12 + identity.nameWidth + 82)
            )
            if (
                node.type === 'directory'
                && expandedPathKeys.has(key)
                && Array.isArray(node.children)
                && node.children.length > 0
            ) {
                visit(node.children, depth + 1, key)
            }
        }
    }

    visit(nodes, 0, null)
    return { rows, rowIndexByKey, horizontalContentWidth }
}

export function flattenVisiblePreviewTree(
    nodes: DevScopeFileTreeNode[],
    expandedPathKeys: ReadonlySet<string>
): PreviewVirtualTreeRow[] {
    return buildVisiblePreviewTreeModel(nodes, expandedPathKeys).rows
}

export function computePreviewVirtualRange({
    rowCount,
    rowHeight,
    scrollTop,
    viewportHeight,
    overscan
}: {
    rowCount: number
    rowHeight: number
    scrollTop: number
    viewportHeight: number
    overscan: number
}): PreviewVirtualRange {
    if (rowCount <= 0 || rowHeight <= 0) return { start: 0, end: 0 }
    const safeScrollTop = Math.max(0, scrollTop)
    const safeViewportHeight = Math.max(rowHeight, viewportHeight)
    const visibleStart = Math.min(rowCount - 1, Math.floor(safeScrollTop / rowHeight))
    const visibleEnd = Math.min(rowCount, Math.ceil((safeScrollTop + safeViewportHeight) / rowHeight))
    return {
        start: Math.max(0, visibleStart - overscan),
        end: Math.min(rowCount, visibleEnd + overscan)
    }
}

export function previewVirtualRangeCoversViewport({
    range,
    rowCount,
    rowHeight,
    scrollTop,
    viewportHeight,
    guardRows
}: {
    range: PreviewVirtualRange
    rowCount: number
    rowHeight: number
    scrollTop: number
    viewportHeight: number
    guardRows: number
}): boolean {
    if (rowCount <= 0) return range.start === 0 && range.end === 0
    const visibleStart = Math.min(rowCount - 1, Math.floor(Math.max(0, scrollTop) / rowHeight))
    const visibleEnd = Math.min(rowCount, Math.ceil((Math.max(0, scrollTop) + Math.max(rowHeight, viewportHeight)) / rowHeight))
    const guardedStart = range.start === 0 ? 0 : range.start + guardRows
    const guardedEnd = range.end === rowCount ? rowCount : range.end - guardRows
    return visibleStart >= guardedStart && visibleEnd <= guardedEnd
}
