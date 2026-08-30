import { useLayoutEffect, useRef, useState, type RefObject } from 'react'

const OCCLUDER_SELECTOR = [
    '[aria-modal="true"]',
    '[data-zyra-native-view-occluder="true"]',
    '.fixed'
].join(',')
const MINIMUM_OVERLAY_Z_INDEX = 40

function rectanglesOverlap(left: DOMRect, right: DOMRect): boolean {
    return left.right > right.left
        && left.left < right.right
        && left.bottom > right.top
        && left.top < right.bottom
}

function isRenderedOverlay(element: HTMLElement): boolean {
    if (!element.isConnected || element.getAttribute('aria-hidden') === 'true') return false
    const style = window.getComputedStyle(element)
    if (style.display === 'none' || style.visibility === 'hidden') return false
    const explicitOccluder = element.getAttribute('aria-modal') === 'true'
        || element.getAttribute('data-zyra-native-view-occluder') === 'true'
    if (explicitOccluder) return true
    if (Number(style.opacity || 1) <= 0) return false
    const zIndex = Number.parseInt(style.zIndex, 10)
    return style.position === 'fixed' && Number.isFinite(zIndex) && zIndex >= MINIMUM_OVERLAY_Z_INDEX
}

function findAssistantBrowserNativeViewOccluder(slot: HTMLElement | null): HTMLElement | null {
    if (!slot || !slot.isConnected || typeof document === 'undefined') return null
    const slotBounds = slot.getBoundingClientRect()
    if (slotBounds.width < 1 || slotBounds.height < 1) return null
    for (const candidate of document.querySelectorAll<HTMLElement>(OCCLUDER_SELECTOR)) {
        if (candidate === slot || candidate.contains(slot) || slot.contains(candidate)) continue
        if (!isRenderedOverlay(candidate)) continue
        const bounds = candidate.getBoundingClientRect()
        if (bounds.width >= 1 && bounds.height >= 1 && rectanglesOverlap(slotBounds, bounds)) return candidate
    }
    return null
}

export function isAssistantBrowserNativeViewOccluded(slot: HTMLElement | null): boolean {
    return findAssistantBrowserNativeViewOccluder(slot) !== null
}

export function useAssistantBrowserNativeViewOcclusion(
    slotRef: RefObject<HTMLElement | null>,
    active: boolean,
    onOcclusionChange?: (occluded: boolean) => void
): boolean {
    const [occluded, setOccluded] = useState(false)
    const occludedRef = useRef(false)
    const occluderRef = useRef<HTMLElement | null>(null)
    const onOcclusionChangeRef = useRef(onOcclusionChange)
    onOcclusionChangeRef.current = onOcclusionChange

    useLayoutEffect(() => {
        if (!active || typeof MutationObserver === 'undefined') {
            const changed = occludedRef.current || occluderRef.current !== null
            occludedRef.current = false
            occluderRef.current = null
            if (changed) onOcclusionChangeRef.current?.(false)
            setOccluded(false)
            return
        }
        const measure = () => {
            const nextOccluder = findAssistantBrowserNativeViewOccluder(slotRef.current)
            const next = nextOccluder !== null
            const occluderChanged = nextOccluder !== occluderRef.current
            occluderRef.current = nextOccluder
            if (occluderChanged) onOcclusionChangeRef.current?.(next)
            if (next === occludedRef.current) return
            occludedRef.current = next
            setOccluded(next)
        }
        measure()
        const observer = new MutationObserver(measure)
        observer.observe(document.body, {
            subtree: true,
            childList: true,
            attributes: true,
            attributeFilter: ['aria-hidden', 'aria-modal', 'class', 'data-zyra-native-view-occluder', 'style']
        })
        window.addEventListener('resize', measure)
        return () => {
            observer.disconnect()
            window.removeEventListener('resize', measure)
        }
    }, [active, slotRef])

    return active && occluded
}
