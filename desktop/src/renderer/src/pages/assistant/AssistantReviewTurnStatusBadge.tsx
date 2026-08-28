import { cn } from '@/lib/utils'
import type { AssistantReviewTurnStatus } from './assistant-diff-types'

export function AssistantReviewTurnStatusBadge({
    status,
    compact = false,
    className
}: {
    status: AssistantReviewTurnStatus
    compact?: boolean
    className?: string
}) {
    if (!status) return null
    const running = status === 'running'
    return (
        <span
            className={cn(
                'inline-flex shrink-0 items-center rounded-full font-medium leading-none ring-1 ring-inset',
                compact ? 'h-3.5 gap-1 px-1.5 text-[7px]' : 'h-4 gap-1 px-1.5 text-[8px]',
                running
                    ? 'bg-sky-400/[0.07] text-sky-300/80 ring-sky-300/15'
                    : 'bg-[color-mix(in_srgb,var(--accent-primary)_7%,transparent)] text-[var(--accent-primary)]/70 ring-[color-mix(in_srgb,var(--accent-primary)_15%,transparent)]',
                className
            )}
        >
            {running ? <span className="size-1 rounded-full bg-sky-300/85 animate-pulse motion-reduce:animate-none" aria-hidden="true" /> : null}
            {running ? 'Running' : 'Latest'}
        </span>
    )
}
