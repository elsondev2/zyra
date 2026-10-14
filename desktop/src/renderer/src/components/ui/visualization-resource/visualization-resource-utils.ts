import type { VisualizationResource } from '@shared/visualization-resources'

export function visualizationKindLabel(kind: VisualizationResource['kind']): string {
    return kind === 'scene3d' ? '3D scene' : kind === 'mermaid' ? 'Diagram' : 'HTML visual'
}

export function visualizationEmbed(id: string, version: number): string {
    const escaped = id.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    return `<visualization-ref id="${escaped}" version="${version}" />`
}
export function visualizationExport(resource: VisualizationResource, version: number) {
    const revision = resource.versions.find((item) => item.version === version)
    const extension = resource.kind === 'html' ? 'html' : resource.kind === 'mermaid' ? 'mmd' : 'json'
    return { source: revision?.source || '', filename: `${resource.title.replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-|-$/g, '') || 'visualization'}-v${version}.${extension}`, mime: resource.kind === 'html' ? 'text/html' : resource.kind === 'scene3d' ? 'application/json' : 'text/plain' }
}
/** Explicit pins and a selected older revision stay stable when the head advances. */
export function nextVisualizationVersion(current: number, previousLatest: number, latest: number, pinned?: number): number {
    return pinned === undefined && current === previousLatest ? latest : current
}
export function visualizationDate(value: string): string {
    const date = new Date(value)
    return Number.isNaN(date.getTime()) ? value : date.toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
}

export type RevisionDiffLine = { kind: 'same' | 'removed' | 'added'; text: string; oldLine?: number; newLine?: number }
/** Linear, bounded line comparison: preserve common prefix/suffix and show the changed region. */
export function revisionLineDiff(before: string, after: string): RevisionDiffLine[] {
    const oldLines = before.split('\n'), newLines = after.split('\n')
    let start = 0
    while (start < oldLines.length && start < newLines.length && oldLines[start] === newLines[start]) start++
    let end = 0
    while (end < oldLines.length - start && end < newLines.length - start && oldLines[oldLines.length - 1 - end] === newLines[newLines.length - 1 - end]) end++
    return [
        ...oldLines.slice(0, start).map((text, i): RevisionDiffLine => ({ kind: 'same', text, oldLine: i + 1, newLine: i + 1 })),
        ...oldLines.slice(start, oldLines.length - end).map((text, i): RevisionDiffLine => ({ kind: 'removed', text, oldLine: start + i + 1 })),
        ...newLines.slice(start, newLines.length - end).map((text, i): RevisionDiffLine => ({ kind: 'added', text, newLine: start + i + 1 })),
        ...oldLines.slice(oldLines.length - end).map((text, i): RevisionDiffLine => ({ kind: 'same', text, oldLine: oldLines.length - end + i + 1, newLine: newLines.length - end + i + 1 }))
    ]
}
