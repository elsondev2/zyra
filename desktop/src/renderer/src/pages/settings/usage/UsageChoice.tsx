import { SettingsChoiceDropdown } from '../SettingsChoiceDropdown'

export function UsageChoice<T extends string>({ value, options, onChange, label, className = '' }: {
    value: T
    options: ReadonlyArray<{ value: T; label: string }>
    onChange: (value: T) => void
    label: string
    className?: string
}) {
    return <div className={`usage-choice ${className}`}>
        <SettingsChoiceDropdown value={value} options={options} onChange={onChange} label={label} />
    </div>
}
