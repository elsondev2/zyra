import { createContext, useContext, useLayoutEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import type { NativeOverlayBounds } from '@shared/contracts/native-overlay'
import { getNativeOverlayHost, supportsNativeOverlay, type NativeOverlayLease } from './native-overlay-host'
export { addOverlayEventListener, addOverlayWindowBlurListener, getOverlayActiveElement, getOverlayEventDocuments, isOverlayEventInside, isOverlayWindowFocused, registerOverlayAnchor } from './native-overlay-events'

function waitForOverlayPaint(ownerWindow: Window | null): Promise<void> {
    if (!ownerWindow) return Promise.resolve()
    return new Promise(resolve => {
        let completed = false
        let timeout = 0
        const finish = () => {
            if (completed) return
            completed = true
            ownerWindow.clearTimeout(timeout)
            resolve()
        }
        timeout = ownerWindow.setTimeout(finish, 60)
        try {
            ownerWindow.requestAnimationFrame(() => ownerWindow.setTimeout(finish, 0))
        } catch {
            finish()
        }
    })
}

interface NativeOverlayPortalProps {
    children: ReactNode
    container?: Element | DocumentFragment
    passive?: boolean
    bounds?: NativeOverlayBounds | null
    autoFocus?: boolean
    focusOnPresent?: boolean
    onReady?: (container: HTMLElement) => void
}

const NativeOverlayVisibility = createContext(true)

/** Portals in another document must follow their owning workspace's visibility. */
export function NativeOverlayVisibilityScope({ visible, children }: { visible: boolean; children: ReactNode }) {
    const parentVisible = useContext(NativeOverlayVisibility)
    return <NativeOverlayVisibility.Provider value={parentVisible && visible}>{children}</NativeOverlayVisibility.Provider>
}

export function NativeOverlayPortal({ children, container = document.body, passive = false, autoFocus = true, focusOnPresent = false, onReady, bounds = null }: NativeOverlayPortalProps) {
    const visible = useContext(NativeOverlayVisibility)
    return visible ? <PresentedNativeOverlayPortal {...{ children, container, passive, autoFocus, focusOnPresent, onReady, bounds }} /> : null
}

function PresentedNativeOverlayPortal({ children, container = document.body, passive = false, autoFocus = true, focusOnPresent = false, onReady, bounds = null }: NativeOverlayPortalProps) {
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
        const acquired = host.acquire(currentBounds.current, focusOnPresent)
        lease.current = acquired
        void acquired.ready.then(destination => { if (current) setTarget(destination) }).catch(error => { if (current) setFailure(error) })
        return () => {
            current = false
            acquired.release()
            if (lease.current === acquired) lease.current = null
        }
    }, [container, native, host, generation, focusOnPresent])
    useLayoutEffect(() => {
        lease.current?.setBounds(bounds)
    }, [bounds?.x, bounds?.y, bounds?.width, bounds?.height])
    useLayoutEffect(() => {
        if (!target) return
        let current = true
        const presented = target !== container
            ? waitForOverlayPaint(content.current?.ownerDocument.defaultView ?? null).then(() => current ? lease.current?.present() ?? false : false)
            : Promise.resolve(true)
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
