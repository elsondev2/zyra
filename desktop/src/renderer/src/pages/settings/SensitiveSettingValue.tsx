import { useEffect, useReducer } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { maskSensitiveSettingValue, reduceSensitiveSettingValue } from './sensitive-setting-value'

export function SensitiveSettingValue({ value, label, visiblePrefix = 3 }: {
    value: string
    label: string
    visiblePrefix?: number
}) {
    const [state, dispatch] = useReducer(reduceSensitiveSettingValue, { value, revealed: false })
    const revealed = state.value === value && state.revealed

    useEffect(() => {
        dispatch({ type: 'reset', value })
    }, [value])

    return (
        <button
            type="button"
            aria-label={`${revealed ? 'Hide' : 'Show'} ${label}`}
            aria-pressed={revealed}
            onClick={() => dispatch({ type: 'toggle', value })}
            className="inline-flex max-w-full items-center justify-end gap-1.5 rounded px-1 py-0.5 text-right hover:bg-[var(--settings-control-hover)] focus-visible:outline focus-visible:outline-1 focus-visible:outline-[var(--accent-primary)]"
        >
            <span className="min-w-0 break-all font-mono text-[11px]">{revealed ? value : maskSensitiveSettingValue(value, visiblePrefix)}</span>
            <span aria-hidden="true" className="inline-flex shrink-0 items-center gap-1 text-[10px] font-medium text-[var(--settings-text-muted)]">
                {revealed ? <EyeOff size={11} /> : <Eye size={11} />}
                {revealed ? 'Hide' : 'Show'}
            </span>
        </button>
    )
}
