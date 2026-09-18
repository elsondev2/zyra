import { Check } from 'lucide-react'
import { useId } from 'react'
import { ACCENT_COLORS, type AccentColor } from '@/lib/settings'
import { cn } from '@/lib/utils'

function accentsMatch(left: AccentColor, right: AccentColor): boolean {
    return left.primary.toLowerCase() === right.primary.toLowerCase()
        && left.secondary.toLowerCase() === right.secondary.toLowerCase()
}

export function AppearanceAccentPicker({ value, onChange }: {
    value: AccentColor
    onChange: (accent: AccentColor) => void
}) {
    const selectedPreset = ACCENT_COLORS.find((accent) => accentsMatch(accent, value))
    const groupName = useId()

    return (
        <div className="mt-3 flex flex-wrap items-center gap-2" role="radiogroup" aria-label="Accent preset">
            {ACCENT_COLORS.map((accent) => {
                const selected = accentsMatch(accent, value)
                return (
                    <label
                        key={accent.name}
                        title={accent.name}
                        className={cn(
                            'relative inline-flex size-7 cursor-pointer items-center justify-center rounded-full border outline-none transition-transform hover:scale-105 focus-within:ring-2 focus-within:ring-[var(--accent-primary)] focus-within:ring-offset-2 focus-within:ring-offset-[var(--settings-section)] motion-reduce:transition-none',
                            selected ? 'border-[var(--settings-text)]' : 'border-black/15'
                        )}
                        style={{ background: `linear-gradient(135deg, ${accent.primary} 0 52%, ${accent.secondary} 52% 100%)` }}
                    >
                        <input type="radio" name={groupName} value={accent.name} checked={selected} aria-label={accent.name} onChange={() => onChange(accent)} className="sr-only" />
                        {selected ? <Check size={13} strokeWidth={2.5} aria-hidden="true" className="text-white [filter:drop-shadow(0_1px_1px_rgba(0,0,0,0.7))]" /> : null}
                    </label>
                )
            })}
            <span className="ml-1 text-[11px] text-[var(--settings-text-muted)]">{selectedPreset?.name || 'Custom'}</span>
        </div>
    )
}
