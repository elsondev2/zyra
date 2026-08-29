import type { MarkdownVirtualRange } from './markdownPreviewVirtualModel'

const MIN_MARKDOWN_SECTION_HEIGHT = 1
export const MAX_MARKDOWN_DOM_HEIGHT = 7_000_000

export function markdownDomHeight(totalHeight: number): number {
    if (!Number.isFinite(totalHeight) || totalHeight <= 0) return 0
    return Math.min(MAX_MARKDOWN_DOM_HEIGHT, totalHeight)
}

export function markdownScrollScale(totalHeight: number, domHeight: number, viewportHeight: number): number {
    const logicalExtent = Math.max(0, totalHeight - Math.max(0, viewportHeight))
    const physicalExtent = Math.max(0, domHeight - Math.max(0, viewportHeight))
    if (logicalExtent <= 0 || physicalExtent <= 0) return 1
    return Math.min(1, physicalExtent / logicalExtent)
}

export function markdownLogicalViewportStart(
    physicalViewportStart: number,
    totalHeight: number,
    domHeight: number,
    viewportHeight: number
): number {
    const scale = markdownScrollScale(totalHeight, domHeight, viewportHeight)
    const logicalExtent = Math.max(0, totalHeight - Math.max(0, viewportHeight))
    return Math.min(logicalExtent, Math.max(0, physicalViewportStart) / Math.max(Number.EPSILON, scale))
}

export function markdownPhysicalViewportStart(
    logicalViewportStart: number,
    totalHeight: number,
    domHeight: number,
    viewportHeight: number
): number {
    const scale = markdownScrollScale(totalHeight, domHeight, viewportHeight)
    const physicalExtent = Math.max(0, domHeight - Math.max(0, viewportHeight))
    return Math.min(physicalExtent, Math.max(0, logicalViewportStart) * scale)
}

export function markdownWheelScrollTop(
    scrollTop: number,
    scrollHeight: number,
    viewportHeight: number,
    physicalDelta: number
): number {
    const maximum = Math.max(0, scrollHeight - Math.max(0, viewportHeight))
    return Math.min(maximum, Math.max(0, scrollTop + physicalDelta))
}

export function markdownEasedScrollTop(
    current: number,
    target: number,
    elapsedMs: number,
    timeConstantMs = 72
): number {
    const distance = target - current
    if (Math.abs(distance) < 0.5) return target
    const factor = 1 - Math.exp(-Math.max(0, elapsedMs) / Math.max(1, timeConstantMs))
    const next = current + distance * factor
    return distance > 0 ? Math.min(target, next) : Math.max(target, next)
}

export function markdownShouldAdjustScrollPosition(
    scrollTop: number,
    scrollHeight: number,
    viewportHeight: number,
    scrollBusy: boolean
): boolean {
    if (scrollBusy) return false
    const safeViewportHeight = Math.max(0, viewportHeight)
    const distanceFromBottom = Math.max(0, scrollHeight) - safeViewportHeight - Math.max(0, scrollTop)
    const protectedEndZone = Math.max(32, safeViewportHeight * 0.75)
    return distanceFromBottom > protectedEndZone
}

/**
 * Mutable prefix-height index for a virtual Markdown document.
 *
 * Section measurements arrive continuously as fonts, code highlighting, images,
 * and container width settle. A Fenwick tree keeps each update and viewport
 * lookup logarithmic instead of rebuilding an offsets array for the full file.
 */
export class MarkdownPreviewHeightIndex {
    private readonly heights: Float64Array
    private readonly tree: Float64Array

    constructor(initialHeights: readonly number[]) {
        this.heights = new Float64Array(initialHeights.length)
        this.tree = new Float64Array(initialHeights.length + 1)
        for (let index = 0; index < initialHeights.length; index += 1) {
            const height = normalizeHeight(initialHeights[index])
            this.heights[index] = height
            this.add(index, height)
        }
    }

    get size(): number {
        return this.heights.length
    }

    heightAt(index: number): number {
        return index >= 0 && index < this.heights.length ? this.heights[index] : 0
    }

    offsetAt(index: number): number {
        return this.prefixSum(clampInteger(index, 0, this.heights.length))
    }

    totalHeight(): number {
        return this.prefixSum(this.heights.length)
    }

    update(index: number, nextHeight: number): number {
        if (index < 0 || index >= this.heights.length) return 0
        const normalizedHeight = normalizeHeight(nextHeight)
        const delta = normalizedHeight - this.heights[index]
        if (Math.abs(delta) < 0.5) return 0
        this.heights[index] = normalizedHeight
        this.add(index, delta)
        return delta
    }

    rangeForViewport(
        viewportStart: number,
        viewportEnd: number,
        overscan: number
    ): MarkdownVirtualRange {
        if (this.heights.length === 0) return { start: 0, end: 0 }
        const lower = Math.max(0, viewportStart - Math.max(0, overscan))
        const upper = Math.max(lower, viewportEnd + Math.max(0, overscan))
        const start = Math.min(this.heights.length - 1, this.countSectionsEndingAtOrBefore(lower))
        const end = Math.max(
            start + 1,
            Math.min(this.heights.length, this.countSectionsStartingBefore(upper))
        )
        return { start, end }
    }

    private add(index: number, delta: number): void {
        for (let treeIndex = index + 1; treeIndex < this.tree.length; treeIndex += treeIndex & -treeIndex) {
            this.tree[treeIndex] += delta
        }
    }

    private prefixSum(endExclusive: number): number {
        let total = 0
        for (let treeIndex = endExclusive; treeIndex > 0; treeIndex -= treeIndex & -treeIndex) {
            total += this.tree[treeIndex]
        }
        return total
    }

    /** Number of complete sections whose cumulative end is <= offset. */
    private countSectionsEndingAtOrBefore(offset: number): number {
        return this.findLargestPrefixAtMost(offset)
    }

    /** Number of sections whose starting offset is < offset. */
    private countSectionsStartingBefore(offset: number): number {
        if (offset <= 0) return 0
        const completeSections = this.findLargestPrefixAtMost(offset)
        if (completeSections >= this.heights.length) return this.heights.length
        return this.prefixSum(completeSections) < offset ? completeSections + 1 : completeSections
    }

    /** Returns the largest section count whose prefix sum is <= target. */
    private findLargestPrefixAtMost(target: number): number {
        if (target < 0 || this.tree.length <= 1) return 0
        let index = 0
        let accumulated = 0
        let bit = 1
        while ((bit << 1) < this.tree.length) bit <<= 1
        for (; bit !== 0; bit >>= 1) {
            const next = index + bit
            if (next < this.tree.length && accumulated + this.tree[next] <= target) {
                index = next
                accumulated += this.tree[next]
            }
        }
        return Math.min(this.heights.length, index)
    }
}

function normalizeHeight(value: number): number {
    return Number.isFinite(value) ? Math.max(MIN_MARKDOWN_SECTION_HEIGHT, value) : MIN_MARKDOWN_SECTION_HEIGHT
}

function clampInteger(value: number, minimum: number, maximum: number): number {
    return Math.min(maximum, Math.max(minimum, Math.trunc(value)))
}
