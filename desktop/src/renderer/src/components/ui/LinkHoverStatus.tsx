import { useEffect, useRef, useState } from 'react'

function formatLinkTarget(anchor: HTMLAnchorElement): string | null {
    const rawHref = anchor.getAttribute('href')?.trim()
    if (!rawHref) return null
    if (rawHref.toLowerCase().startsWith('javascript:')) return null

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
            if (!(node instanceof Element)) return null
            return node.closest('a[href]') as HTMLAnchorElement | null
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

        document.addEventListener('pointerover', handlePointerOver, true)
        document.addEventListener('pointerout', handlePointerOut, true)
        document.addEventListener('focusin', handleFocusIn, true)
        document.addEventListener('focusout', handleFocusOut, true)
        window.addEventListener('blur', clearTarget)

        return () => {
            if (rafRef.current !== null) {
                window.cancelAnimationFrame(rafRef.current)
                rafRef.current = null
            }
            document.removeEventListener('pointerover', handlePointerOver, true)
            document.removeEventListener('pointerout', handlePointerOut, true)
            document.removeEventListener('focusin', handleFocusIn, true)
            document.removeEventListener('focusout', handleFocusOut, true)
            window.removeEventListener('blur', clearTarget)
        }
    }, [])

    if (!target) return null

    return (
        <div
            className="fixed left-3 bottom-2 z-[9999] max-w-[65vw] truncate rounded-md border border-white/10 bg-sparkle-card/95 px-2 py-1 text-[11px] text-sparkle-text-secondary shadow-lg backdrop-blur-sm pointer-events-none"
        >
            {target}
        </div>
    )
}
