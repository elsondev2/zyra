import { useCallback, useRef, type RefObject } from 'react'

export function useNonPassiveWheel<T extends HTMLElement>(
    handler: ((event: WheelEvent) => void) | undefined,
    forwardedRef?: RefObject<T | null>
) {
    const handlerRef = useRef(handler)
    handlerRef.current = handler
    const elementRef = useRef<T | null>(null)
    const listener = useCallback((event: WheelEvent) => handlerRef.current?.(event), [])
    return useCallback((element: T | null) => {
        elementRef.current?.removeEventListener('wheel', listener)
        elementRef.current = element
        if (forwardedRef) forwardedRef.current = element
        element?.addEventListener('wheel', listener, { passive: false })
    }, [forwardedRef, listener])
}
