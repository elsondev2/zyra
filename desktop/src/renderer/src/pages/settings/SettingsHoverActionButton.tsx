import type { ReactNode } from 'react'
import { SettingsButton } from './settings-layout'

export function SettingsHoverActionButton({ label, accessibleLabel = label, icon, variant, disabled, onClick }: {
    label: string
    accessibleLabel?: string
    icon: ReactNode
    variant?: 'outline' | 'ghost'
    disabled?: boolean
    onClick: () => void
}) {
    const expandedWidth = label.length <= 5
        ? 'group-hover/connection-action:max-w-12 group-focus-visible/connection-action:max-w-12'
        : label.length <= 10
            ? 'group-hover/connection-action:max-w-20 group-focus-visible/connection-action:max-w-20'
            : 'group-hover/connection-action:max-w-36 group-focus-visible/connection-action:max-w-36'

    return (
        <SettingsButton
            variant={variant}
            aria-label={accessibleLabel}
            disabled={disabled}
            onClick={onClick}
            className="group/connection-action !gap-0 !px-0 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-primary)]"
        >
            <span aria-hidden="true" className="inline-flex size-8 shrink-0 items-center justify-center">{icon}</span>
            <span aria-hidden="true" className={`max-w-0 -translate-x-1 overflow-hidden whitespace-nowrap opacity-0 transition-[max-width,opacity,transform] duration-[420ms] ease-in-out ${expandedWidth} group-hover/connection-action:translate-x-0 group-hover/connection-action:opacity-100 group-focus-visible/connection-action:translate-x-0 group-focus-visible/connection-action:opacity-100 motion-reduce:transition-none`}>
                <span className="block pr-2.5">{label}</span>
            </span>
        </SettingsButton>
    )
}
