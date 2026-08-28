import { useLayoutEffect, useState, type RefObject } from 'react'

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
    if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity || 1) <= 0) return false
    const explicitOccluder = element.getAttribute('aria-modal') === 'true'
        || element.getAttribute('data-zyra-native-view-occluder') === 'true'
    const zIndex = Number.parseInt(style.zIndex, 10)
    return explicitOccluder || (style.position === 'fixed' && Number.isFinite(zIndex) && zIndex >= MINIMUM_OVERLAY_Z_INDEX)
}

export function isAssistantBrowserNativeViewOccluded(slot: HTMLElement | null): boolean {
    if (!slot || !slot.isConnected || typeof document === 'undefined') return false
    const slotBounds = slot.getBoundingClientRect()
    if (slotBounds.width < 1 || slotBounds.height < 1) return false
    for (const candidate of document.querySelectorAll<HTMLElement>(OCCLUDER_SELECTOR)) {
        if (candidate === slot || candidate.contains(slot) || slot.contains(candidate)) continue
        if (!isRenderedOverlay(candidate)) continue
        const bounds = candidate.getBoundingClientRect()
        if (bounds.width >= 1 && bounds.height >= 1 && rectanglesOverlap(slotBounds, bounds)) return true
    }
    return false
}

export function useAssistantBrowserNativeViewOcclusion(
    slotRef: RefObject<HTMLElement | null>,
    active: boolean
): boolean {
    const [occluded, setOccluded] = useState(false)

    useLayoutEffect(() => {
        if (!active || typeof MutationObserver === 'undefined') {
            setOccluded(false)
            return
        }
        let frameId: number | null = null
        const measure = () => {
            frameId = null
            const next = isAssistantBrowserNativeViewOccluded(slotRef.current)
            setOccluded((current) => current === next ? current : next)
        }
        const scheduleMeasure = () => {
            if (frameId !== null) return
            frameId = window.requestAnimationFrame(measure)
        }
        measure()
        const observer = new MutationObserver(scheduleMeasure)
        observer.observe(document.body, {
            subtree: true,
            childList: true,
            attributes: true,
            attributeFilter: ['aria-hidden', 'aria-modal', 'class', 'data-zyra-native-view-occluder', 'style']
        })
        window.addEventListener('resize', scheduleMeasure)
        return () => {
            if (frameId !== null) window.cancelAnimationFrame(frameId)
            observer.disconnect()
            window.removeEventListener('resize', scheduleMeasure)
        }
    }, [active, slotRef])

    return active && occluded
}
