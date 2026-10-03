import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export function RailButton(props: {
    icon: ReactNode
    label: string
    shortcut?: string
    disabled?: boolean
    onClick: () => void
}) {
    const { icon, label, shortcut, disabled = false, onClick } = props

    return (
        <button
            type="button"
            onClick={onClick}
            disabled={disabled}
            className={cn(
                'group flex h-7 w-full cursor-pointer items-center gap-2 rounded-[9px] px-2.5 text-left text-[13px] leading-none transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent-primary)]/35',
                'text-sparkle-text-secondary enabled:hover:bg-[var(--surface-hover)] enabled:hover:text-sparkle-text',
                disabled && 'cursor-wait'
            )}
        >
            <span className="inline-flex h-4 w-4 shrink-0 items-center justify-center text-sparkle-text-secondary/70 transition-colors group-hover:text-sparkle-text">
                {icon}
            </span>
            <span className="min-w-0 flex-1 truncate">{label}</span>
            {shortcut ? (
                <span className="pointer-events-none hidden shrink-0 rounded-md bg-[var(--surface-hover)] px-1.5 py-0.5 text-[10px] leading-none text-sparkle-text-secondary/80 group-hover:inline-flex">
                    {shortcut}
                </span>
            ) : null}
        </button>
    )
}
