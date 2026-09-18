import { useMemo, type ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'
import { FileActionsMenu } from '@/components/ui/FileActionsMenu'
import { buildSettingsChoiceItems } from './settings-choice-options'

export function SettingsChoiceDropdown<T extends string>({ value, options, onChange, label, disabled = false }: {
    value: T
    options: ReadonlyArray<{ value: T; label: string; icon?: ReactNode }>
    onChange: (value: T) => void
    label: string
    disabled?: boolean
}) {
    const selected = options.find(option => option.value === value)
    const items = useMemo(() => buildSettingsChoiceItems(value, options, onChange, disabled), [value, options, onChange, disabled])
    return <FileActionsMenu
        items={items}
        title={label}
        disabled={disabled}
        selectionMode="radio"
        presentation="portal"
        density="compact"
        matchTriggerWidth
        rootClassName="min-w-0 w-full sm:w-44"
        buttonClassName="!h-8 !w-full !justify-between gap-3 !border !border-[var(--settings-border)] !bg-[var(--settings-control)] !px-2.5 !text-xs !font-medium !text-[var(--settings-text)] hover:!border-[var(--settings-border-strong)] hover:!bg-[var(--settings-control-hover)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-primary)] disabled:cursor-not-allowed disabled:opacity-45"
        openButtonClassName="!border-[var(--settings-border-strong)] !bg-[var(--settings-control-hover)]"
        triggerIcon={<>
            {selected?.icon ? <span className="inline-flex size-4 shrink-0 items-center justify-center" aria-hidden="true">{selected.icon}</span> : null}
            <span className="min-w-0 flex-1 truncate text-left">{selected?.label || value || 'Choose'}</span>
            <ChevronDown size={13} aria-hidden="true" className="shrink-0 text-[var(--settings-text-muted)] transition-transform duration-150 group-data-[state=open]/file-menu:rotate-180 motion-reduce:transition-none" />
        </>}
    />
}
