import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'

export function AssistantCheckbox({ checked, disabled = false, label, onChange }: { checked: boolean; disabled?: boolean; label: string; onChange: (checked: boolean) => void }) {
    return (
        <button type="button" role="checkbox" aria-checked={checked} aria-label={label} disabled={disabled} onClick={() => onChange(!checked)} className={cn('inline-flex size-5 shrink-0 items-center justify-center rounded-[5px] border transition-[background-color,border-color,color] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)]/35 disabled:opacity-35', checked ? 'border-[var(--accent-primary)] bg-[var(--accent-primary)] text-[var(--accent-contrast)]' : 'border-[color-mix(in_srgb,var(--color-text)_20%,transparent)] bg-[color-mix(in_srgb,var(--color-text)_3%,transparent)] text-transparent hover:border-[color-mix(in_srgb,var(--color-text)_32%,transparent)]')}>
            <Check size={12} strokeWidth={2.5} />
        </button>
    )
}
