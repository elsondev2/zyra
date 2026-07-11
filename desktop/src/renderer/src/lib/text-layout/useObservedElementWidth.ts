import { useLayoutEffect, useRef, useState } from 'react'

export function useObservedElementWidth<T extends HTMLElement>() {
    const elementRef = useRef<T | null>(null)
    const [width, setWidth] = useState(0)

    useLayoutEffect(() => {
        const node = elementRef.current
        if (!node) return

        const measure = () => {
            setWidth(node.clientWidth)
        }

        measure()

        if (typeof ResizeObserver === 'undefined') return
        const observer = new ResizeObserver(() => measure())
        observer.observe(node)
        return () => observer.disconnect()
    }, [])

    return {
        elementRef,
        width
    }
}
