import { useLayoutEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import type { NativeOverlayBounds } from '@shared/contracts/native-overlay'
import { getNativeOverlayHost, supportsNativeOverlay, type NativeOverlayLease } from './native-overlay-host'
export { addOverlayEventListener, addOverlayWindowBlurListener, getOverlayActiveElement, getOverlayEventDocuments, isOverlayEventInside, isOverlayWindowFocused, registerOverlayAnchor } from './native-overlay-events'

interface NativeOverlayPortalProps {
    children: ReactNode
    container?: Element | DocumentFragment
    passive?: boolean
    bounds?: NativeOverlayBounds | null
    autoFocus?: boolean
    onReady?: (container: HTMLElement) => void
}

export function NativeOverlayPortal({ children, container = document.body, passive = false, autoFocus = true, onReady, bounds = null }: NativeOverlayPortalProps) {
    const native = container === document.body && supportsNativeOverlay()
    const host = getNativeOverlayHost(passive)
    const generation = useSyncExternalStore(host.subscribe, host.snapshot, host.snapshot)
    const [target, setTarget] = useState<Element | DocumentFragment | null>(() => native ? null : container)
    const lease = useRef<NativeOverlayLease | null>(null)
    const currentBounds = useRef(bounds)
    currentBounds.current = bounds
    const content = useRef<HTMLDivElement | null>(null)
    const readyCallback = useRef(onReady)
    const [failure, setFailure] = useState<unknown>(null)
    readyCallback.current = onReady
    useLayoutEffect(() => {
        if (!native) { setTarget(container); return }
        setTarget(null)
        let current = true
        const acquired = host.acquire(currentBounds.current)
        lease.current = acquired
        void acquired.ready.then(destination => { if (current) setTarget(destination) }).catch(error => { if (current) setFailure(error) })
        return () => {
            current = false
            acquired.release()
            if (lease.current === acquired) lease.current = null
        }
    }, [container, native, host, generation])
    useLayoutEffect(() => {
        lease.current?.setBounds(bounds)
    }, [bounds?.x, bounds?.y, bounds?.width, bounds?.height])
    useLayoutEffect(() => {
        if (!target) return
        let current = true
        const presented = target !== container ? lease.current?.present() : Promise.resolve(true)
        void presented?.then(shown => {
            const root = content.current
            if (!shown || !current || !root) return
            if (!passive && autoFocus) {
                const intended = root.querySelector<HTMLElement>('[data-native-overlay-autofocus], [autofocus]')
                const dialog = root.querySelector<HTMLElement>('[role="dialog"], [aria-modal="true"]')
                const focusable = intended ?? dialog?.querySelector<HTMLElement>('input:not(:disabled),textarea:not(:disabled),select:not(:disabled),button:not(:disabled),[tabindex="0"]') ?? (dialog?.tabIndex === -1 ? dialog : null)
                if (focusable && (!root.ownerDocument.hasFocus() || !root.contains(root.ownerDocument.activeElement))) focusable.focus({ preventScroll: true })
            }
            readyCallback.current?.(root)
        }).catch(error => { if (current) setFailure(error) })
        return () => { current = false }
    }, [target, container, passive, autoFocus])
    if (failure) throw failure
    return target ? createPortal(<div ref={content} data-native-overlay-content style={{ display: 'contents' }}>{children}</div>, target) : null
}

/** Body overlays share native surfaces; explicit in-document hosts keep their existing behavior. */
export function createOverlayPortal(children: ReactNode, container: Element | DocumentFragment, key?: string | null) {
    return <NativeOverlayPortal key={key} container={container}>{children}</NativeOverlayPortal>
}

export function createPassivePortal(children: ReactNode, container: Element | DocumentFragment, key?: string | null) {
    return <NativeOverlayPortal key={key} container={container} passive>{children}</NativeOverlayPortal>
}
