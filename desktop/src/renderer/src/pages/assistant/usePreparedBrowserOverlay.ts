import { useCallback, useLayoutEffect, useRef, useState } from 'react'

/** Keep an asynchronous page preparation attached to the menu intent that requested it. */
export function usePreparedBrowserOverlay(options: {
    scopeKey: string
    active?: boolean
    open: boolean
    prepare?: () => Promise<unknown>
    onOpen: () => void
    onClose: () => void
}) {
    const current = useRef(options)
    current.current = options
    const mounted = useRef(false)
    const generation = useRef(0)
    const preparing = useRef(false)
    const [pending, setPending] = useState(false)
    const close = useCallback(() => {
        generation.current++
        preparing.current = false
        setPending(false)
        current.current.onClose()
    }, [])

    useLayoutEffect(() => {
        mounted.current = true
        return () => {
            mounted.current = false
            generation.current++
            preparing.current = false
        }
    }, [])
    useLayoutEffect(close, [close, options.scopeKey, options.active])

    const request = useCallback(async (): Promise<boolean> => {
        const context = current.current
        if (!mounted.current || context.active === false || context.open || preparing.current) return false
        const requestGeneration = ++generation.current
        preparing.current = true
        setPending(true)
        try { await context.prepare?.() } catch {
            // A capture failure must not make the menu inaccessible.
        }
        if (!mounted.current || requestGeneration !== generation.current
            || current.current.active === false || current.current.scopeKey !== context.scopeKey) return false
        preparing.current = false
        setPending(false)
        current.current.onOpen()
        return true
    }, [])

    const toggle = useCallback(() => {
        if (preparing.current || current.current.open) close()
        else void request()
    }, [close, request])
    return { pending, request, close, toggle }
}
