import { useEffect, useRef, useState } from 'react'
import { addOverlayEventListener, addOverlayWindowBlurListener, NativeOverlayPortal } from './native-overlay-portal'

function formatLinkTarget(anchor: HTMLAnchorElement): string | null {
    const rawHref = anchor.getAttribute('href')?.trim()
    if (!rawHref) return null
    if (rawHref.toLowerCase().startsWith('javascript:')) return null

    const markdownLinkState = anchor.dataset.markdownLinkState
    const markdownLinkPath = anchor.dataset.markdownLinkPath || rawHref
    if (markdownLinkState === 'missing') return `Missing file · ${markdownLinkPath}`
    if (markdownLinkState === 'failed') return `Could not open · ${markdownLinkPath}`
    if (markdownLinkState === 'checking') return `Checking link · ${markdownLinkPath}`
    if (markdownLinkState === 'unknown') return `Unverified link · ${markdownLinkPath}`

    try {
        const resolved = new URL(rawHref, window.location.href)
        if (resolved.origin === window.location.origin) {
            if (rawHref.startsWith('#')) {
                return rawHref
            }
            return `${resolved.pathname}${resolved.search}${resolved.hash}`
        }
        return resolved.href
    } catch {
        return rawHref
    }
}

export default function LinkHoverStatus() {
    const [target, setTarget] = useState<string | null>(null)
    const activeAnchorRef = useRef<HTMLAnchorElement | null>(null)
    const targetRef = useRef<string | null>(null)
    const pendingTargetRef = useRef<string | null>(null)
    const rafRef = useRef<number | null>(null)

    useEffect(() => {
        const getAnchor = (node: EventTarget | null): HTMLAnchorElement | null => {
            const element = node as Element | null
            if (element?.nodeType !== 1) return null
            return element.closest('a[href]') as HTMLAnchorElement | null
        }

        const commitTarget = (nextTarget: string | null) => {
            if (targetRef.current === nextTarget) return
            targetRef.current = nextTarget
            setTarget(nextTarget)
        }

        const scheduleTarget = (nextTarget: string | null) => {
            pendingTargetRef.current = nextTarget
            if (rafRef.current !== null) return
            rafRef.current = window.requestAnimationFrame(() => {
                rafRef.current = null
                commitTarget(pendingTargetRef.current)
            })
        }

        const showForAnchor = (anchor: HTMLAnchorElement | null) => {
            if (activeAnchorRef.current === anchor) return
            activeAnchorRef.current = anchor

            if (!anchor) {
                scheduleTarget(null)
                return
            }
            scheduleTarget(formatLinkTarget(anchor))
        }

        const handlePointerOver = (event: PointerEvent) => {
            if (event.pointerType && event.pointerType !== 'mouse') return
            showForAnchor(getAnchor(event.target))
        }

        const handlePointerOut = (event: PointerEvent) => {
            if (event.pointerType && event.pointerType !== 'mouse') return
            const fromAnchor = getAnchor(event.target)
            if (!fromAnchor) return

            const toAnchor = getAnchor(event.relatedTarget)
            if (toAnchor === fromAnchor) return

            if (toAnchor) {
                showForAnchor(toAnchor)
                return
            }
            showForAnchor(null)
        }

        const handleFocusIn = (event: FocusEvent) => {
            showForAnchor(getAnchor(event.target))
        }

        const handleFocusOut = (event: FocusEvent) => {
            const nextAnchor = getAnchor(event.relatedTarget)
            if (nextAnchor) {
                showForAnchor(nextAnchor)
                return
            }
            showForAnchor(null)
        }

        const clearTarget = () => showForAnchor(null)

        const removeListeners = [
            addOverlayEventListener('pointerover', handlePointerOver, true),
            addOverlayEventListener('pointerout', handlePointerOut, true),
            addOverlayEventListener('focusin', handleFocusIn, true),
            addOverlayEventListener('focusout', handleFocusOut, true),
            addOverlayWindowBlurListener(clearTarget)
        ]

        return () => {
            if (rafRef.current !== null) {
                window.cancelAnimationFrame(rafRef.current)
                rafRef.current = null
            }
            removeListeners.forEach(remove => remove())
        }
    }, [])

    if (!target) return null

    return <NativeOverlayPortal passive>
        <div
            className="fixed left-3 bottom-2 z-[9999] max-w-[65vw] truncate rounded-md border border-white/10 bg-sparkle-card/95 px-2 py-1 text-[11px] text-sparkle-text-secondary shadow-lg backdrop-blur-sm pointer-events-none"
        >
            {target}
        </div>
    </NativeOverlayPortal>
}
