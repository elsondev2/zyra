import { useEffect, useRef } from 'react'
import { cn } from '@/lib/utils'

function RollingDiffNumber({ value, animated }: { value: number; animated: boolean }) {
    const incomingRef = useRef<HTMLSpanElement>(null)
    const outgoingRef = useRef<HTMLSpanElement>(null)
    const previousRef = useRef(value)
    useEffect(() => {
        const previous = previousRef.current
        previousRef.current = value
        if (previous === value || !animated) return
        const incoming = incomingRef.current
        const outgoing = outgoingRef.current
        const motion = window.matchMedia?.('(prefers-reduced-motion: reduce)')
        if (!incoming?.animate || !outgoing?.animate || motion?.matches || document.body.classList.contains('zyra-reduce-motion')) return
        outgoing.textContent = String(previous)
        const direction = value >= previous ? 1 : -1
        const options = { duration: 220, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' }
        const animations = [
            outgoing.animate([{ transform: 'translateY(0)', opacity: 1 }, { transform: `translateY(${-direction * 65}%)`, opacity: 0 }], options),
            incoming.animate([{ transform: `translateY(${direction * 65}%)`, opacity: 0 }, { transform: 'translateY(0)', opacity: 1 }], options)
        ]
        animations[0]!.onfinish = () => { outgoing.textContent = '' }
        const cancel = () => {
            animations.forEach(animation => animation.cancel())
            outgoing.textContent = ''
        }
        const onMotionChange = () => { if (motion?.matches) cancel() }
        motion?.addEventListener('change', onMotionChange)
        return () => {
            cancel()
            motion?.removeEventListener('change', onMotionChange)
        }
    }, [animated, value])
    return (
        <span className="relative inline-grid min-w-[2ch] overflow-hidden text-right leading-[1.2]" data-rolling-diff-number={value} aria-hidden="true">
            <span ref={outgoingRef} className="pointer-events-none opacity-0 [grid-area:1/1]" />
            <span ref={incomingRef} className="block [grid-area:1/1]">{value}</span>
        </span>
    )
}

export function InlineDiffStats({ additions, deletions, animated = false, className }: { additions: number; deletions: number; animated?: boolean; className?: string }) {
    return (
        <span
            role="group"
            data-assistant-action-diff-stats="true"
            data-diff-additions={additions}
            data-diff-deletions={deletions}
            aria-label={`${additions} lines added, ${deletions} lines removed`}
            className={cn('inline-flex items-center gap-1.5 font-mono text-[10px] leading-none tabular-nums', className)}
        >
            <span className="inline-flex items-center text-[color-mix(in_srgb,var(--status-success)_72%,var(--color-text))]">
                <span aria-hidden="true">+</span><RollingDiffNumber value={additions} animated={animated} />
            </span>
            <span className="inline-flex items-center text-[color-mix(in_srgb,var(--status-danger)_72%,var(--color-text))]">
                <span aria-hidden="true">-</span><RollingDiffNumber value={deletions} animated={animated} />
            </span>
        </span>
    )
}
