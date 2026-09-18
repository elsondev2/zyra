import type { ReactNode } from 'react'
import type { FileActionsMenuItem } from '@/components/ui/FileActionsMenu'

export function buildSettingsChoiceItems<T extends string>(
    value: T,
    options: ReadonlyArray<{ value: T; label: string; icon?: ReactNode }>,
    onChange: (value: T) => void,
    disabled = false
): FileActionsMenuItem[] {
    return options.map(option => ({
        id: option.value,
        label: option.label,
        icon: option.icon,
        checked: option.value === value,
        disabled,
        onSelect: () => { if (!disabled) onChange(option.value) }
    }))
}
