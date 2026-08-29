export type IconSelectionMode = 'replace' | 'toggle' | 'range' | 'range-add'

export function applyIconGridSelection(
    orderedPaths: string[],
    current: ReadonlySet<string>,
    index: number,
    anchorIndex: number | null,
    mode: IconSelectionMode
): { selected: Set<string>; anchorIndex: number } {
    const path = orderedPaths[index]
    if (!path) return { selected: new Set(current), anchorIndex: anchorIndex ?? 0 }
    if (mode === 'toggle') {
        const selected = new Set(current)
        if (selected.has(path)) selected.delete(path)
        else selected.add(path)
        return { selected, anchorIndex: index }
    }
    if (mode === 'range' || mode === 'range-add') {
        const start = Math.min(anchorIndex ?? index, index)
        const end = Math.max(anchorIndex ?? index, index)
        const selected = mode === 'range-add' ? new Set(current) : new Set<string>()
        for (let cursor = start; cursor <= end; cursor += 1) {
            if (orderedPaths[cursor]) selected.add(orderedPaths[cursor])
        }
        return { selected, anchorIndex: anchorIndex ?? index }
    }
    return { selected: new Set([path]), anchorIndex: index }
}

export function mergeIconGridMarqueeSelection(base: ReadonlySet<string>, intersectingPaths: Iterable<string>): Set<string> {
    return new Set([...base, ...intersectingPaths])
}

export function iconGridSelectionsEqual(left: ReadonlySet<string>, right: ReadonlySet<string>): boolean {
    if (left.size !== right.size) return false
    for (const path of left) if (!right.has(path)) return false
    return true
}

export function rectanglesIntersect(
    left: { left: number; top: number; right: number; bottom: number },
    right: { left: number; top: number; right: number; bottom: number }
): boolean {
    return left.left <= right.right && left.right >= right.left && left.top <= right.bottom && left.bottom >= right.top
}
