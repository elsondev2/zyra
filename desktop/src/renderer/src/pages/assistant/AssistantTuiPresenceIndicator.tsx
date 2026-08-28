import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { SquareTerminal } from 'lucide-react'

const TOOLTIP_FADE_MS = 140

type TooltipPosition = {
    left: number
    top: number
}

export function AssistantTuiPresenceIndicator({
    focusable = true,
    compact = false
}: {
    focusable?: boolean
    compact?: boolean
}) {
    const anchorRef = useRef<HTMLSpanElement | null>(null)
    const hideTimerRef = useRef<number | null>(null)
    const tooltipId = useId()
    const [rendered, setRendered] = useState(false)
    const [visible, setVisible] = useState(false)
    const [position, setPosition] = useState<TooltipPosition>({ left: 0, top: 0 })

    const updatePosition = () => {
        const bounds = anchorRef.current?.getBoundingClientRect()
        if (!bounds) return
        setPosition({
            left: bounds.left + bounds.width / 2,
            top: bounds.bottom + 7
        })
    }

    const showTooltip = () => {
        if (hideTimerRef.current !== null) {
            window.clearTimeout(hideTimerRef.current)
            hideTimerRef.current = null
        }
        updatePosition()
        setRendered(true)
        window.requestAnimationFrame(() => setVisible(true))
    }

    const hideTooltip = () => {
        setVisible(false)
        if (hideTimerRef.current !== null) window.clearTimeout(hideTimerRef.current)
        hideTimerRef.current = window.setTimeout(() => {
            hideTimerRef.current = null
            setRendered(false)
        }, TOOLTIP_FADE_MS)
    }

    useEffect(() => {
        if (!rendered) return
        const reposition = () => updatePosition()
        window.addEventListener('resize', reposition)
        window.addEventListener('scroll', reposition, true)
        return () => {
            window.removeEventListener('resize', reposition)
            window.removeEventListener('scroll', reposition, true)
        }
    }, [rendered])

    useEffect(() => () => {
        if (hideTimerRef.current !== null) window.clearTimeout(hideTimerRef.current)
    }, [])

    const tooltip = rendered && typeof document !== 'undefined'
        ? createPortal(
            <span
                id={tooltipId}
                role="tooltip"
                className={`pointer-events-none fixed z-[3000] -translate-x-1/2 whitespace-nowrap rounded-md border border-[var(--surface-panel-divider)] bg-[color-mix(in_srgb,var(--color-card)_96%,var(--color-bg))] px-2.5 py-1.5 text-[10px] font-medium leading-none text-sparkle-text-secondary shadow-[0_10px_28px_rgba(0,0,0,0.24)] transition-[opacity,transform] duration-[140ms] ease-out motion-reduce:transition-none ${visible ? 'translate-y-0 opacity-100' : 'translate-y-1 opacity-0'}`}
                style={{ left: position.left, top: position.top }}
            >
                This session is open in the TUI
            </span>,
            document.body
        )
        : null

    return (
        <>
            <span
                ref={anchorRef}
                role="status"
                tabIndex={focusable ? 0 : undefined}
                aria-label="This session is open in the TUI"
                aria-describedby={rendered ? tooltipId : undefined}
                data-tui-presence="open"
                className="no-drag inline-flex size-5 shrink-0 items-center justify-center text-[var(--status-success)] outline-none transition-colors duration-150 hover:text-emerald-300 focus-visible:text-emerald-300 motion-reduce:transition-none"
                onMouseEnter={showTooltip}
                onMouseLeave={hideTooltip}
                onFocus={focusable ? showTooltip : undefined}
                onBlur={focusable ? hideTooltip : undefined}
            >
                <SquareTerminal size={compact ? 12 : 15} strokeWidth={1.9} aria-hidden="true" />
            </span>
            {tooltip}
        </>
    )
}
