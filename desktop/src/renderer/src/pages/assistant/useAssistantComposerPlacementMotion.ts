import { useLayoutEffect, useRef, type RefObject } from 'react'

const COMPOSER_PLACEMENT_MOTION_MS = 460
const COMPOSER_PLACEMENT_MOTION_EASING = 'cubic-bezier(0.22, 1, 0.36, 1)'

type ComposerPlacement = 'bottom' | 'center'

function prefersReducedMotion(): boolean {
    return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
}

export function useAssistantComposerPlacementMotion(
    paneRef: RefObject<HTMLDivElement | null> | undefined,
    placement: ComposerPlacement
): void {
    const previousPlacementRef = useRef<ComposerPlacement>(placement)
    const previousRectRef = useRef<DOMRect | null>(null)
    const animationRef = useRef<Animation | null>(null)

    useLayoutEffect(() => {
        const element = paneRef?.current
        if (!element) return
        const nextRect = element.getBoundingClientRect()
        const previousRect = previousRectRef.current
        const placementChanged = previousPlacementRef.current !== placement
        previousPlacementRef.current = placement

        if (!placementChanged) {
            if (!animationRef.current) previousRectRef.current = nextRect
            return
        }
        previousRectRef.current = nextRect
        animationRef.current?.cancel()
        animationRef.current = null
        if (!previousRect || prefersReducedMotion()) return

        const deltaX = previousRect.left - nextRect.left
        const deltaY = previousRect.top - nextRect.top
        const scaleX = nextRect.width > 0 ? previousRect.width / nextRect.width : 1
        if (Math.abs(deltaX) < 0.5 && Math.abs(deltaY) < 0.5 && Math.abs(scaleX - 1) < 0.002) return

        const animation = element.animate([
            {
                translate: `${deltaX}px ${deltaY}px`,
                scale: `${scaleX} 1`,
                transformOrigin: 'center center'
            },
            {
                translate: '0 0',
                scale: '1 1',
                transformOrigin: 'center center'
            }
        ], {
            duration: COMPOSER_PLACEMENT_MOTION_MS,
            easing: COMPOSER_PLACEMENT_MOTION_EASING
        })
        animationRef.current = animation
        const clear = () => {
            if (animationRef.current === animation) animationRef.current = null
        }
        animation.addEventListener('finish', clear, { once: true })
        animation.addEventListener('cancel', clear, { once: true })
    })

    useLayoutEffect(() => () => animationRef.current?.cancel(), [])
}
