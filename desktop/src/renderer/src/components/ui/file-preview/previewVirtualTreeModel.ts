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

export function normalizePreviewTreePath(pathValue: string): string {
    return String(pathValue || '').replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase()
}

export type PreviewVisibleTreeModel = {
    rows: PreviewVirtualTreeRow[]
    rowIndexByKey: Map<string, number>
    horizontalContentWidth: number
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
            const key = normalizePreviewTreePath(node.path)
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
                Math.ceil(depth * 12 + node.name.length * 7.25 + 82)
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
