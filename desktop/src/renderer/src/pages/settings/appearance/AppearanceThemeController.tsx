import { Check, Copy } from 'lucide-react'
import { useEffect, useState, type KeyboardEvent } from 'react'
import type {
    AccentColor,
    AppearanceCodeFont,
    AppearanceThemeMode,
    AppearanceUiFont
} from '@/lib/settings'
import type { ThemeDefinition, ThemeTokens } from '@/lib/settings-theme-catalog'
import { SettingsButton, SettingsNotice, SettingsRow, SettingsSection } from '../settings-layout'
import { createSettingsRowTargetId } from '../settings-search'

const TOKEN_LABELS: ReadonlyArray<{ key: keyof ThemeTokens; label: string }> = [
    { key: 'bg', label: 'Background' },
    { key: 'text', label: 'Foreground' },
    { key: 'textDark', label: 'Strong text' },
    { key: 'textDarker', label: 'Subtle text' },
    { key: 'textSecondary', label: 'Secondary text' },
    { key: 'textMuted', label: 'Muted text' },
    { key: 'card', label: 'Card' },
    { key: 'border', label: 'Border' },
    { key: 'borderSecondary', label: 'Strong border' },
    { key: 'primary', label: 'Theme primary' },
    { key: 'secondary', label: 'Theme secondary' },
    { key: 'accent', label: 'Surface accent' }
]

function EditableHexValue({
    label,
    value,
    onCommit
}: {
    label: string
    value: string
    onCommit: (value: string) => void
}) {
    const [draft, setDraft] = useState(value)

    useEffect(() => setDraft(value), [value])

    const commit = () => {
        const normalized = draft.trim().toLowerCase()
        if (/^#[0-9a-f]{6}$/.test(normalized)) {
            setDraft(normalized)
            if (normalized !== value.toLowerCase()) onCommit(normalized)
            return
        }
        setDraft(value)
    }

    const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
        if (event.key === 'Enter') event.currentTarget.blur()
        if (event.key === 'Escape') {
            event.preventDefault()
            setDraft(value)
            event.currentTarget.select()
        }
    }

    return (
        <div className="zyra-theme-color-control ml-auto flex h-8 w-[160px] min-w-0 overflow-hidden rounded-md border border-[var(--settings-border)] bg-[var(--settings-control)]">
            <input
                type="color"
                value={value}
                onChange={(event) => onCommit(event.target.value.toLowerCase())}
                aria-label={`${label} color picker`}
                className="zyra-native-color-input h-full w-11 shrink-0"
            />
            <input
                type="text"
                value={draft}
                onChange={(event) => {
                    const nextValue = event.target.value
                    setDraft(nextValue)
                    if (/^#[0-9a-fA-F]{6}$/.test(nextValue)) onCommit(nextValue.toLowerCase())
                }}
                onBlur={commit}
                onKeyDown={handleKeyDown}
                spellCheck={false}
                aria-label={`${label} hex value`}
                className="zyra-theme-color-hex h-full min-w-0 flex-1 border-0 bg-[var(--settings-control)] px-2.5 text-right font-mono text-[11px] uppercase text-[var(--settings-text-secondary)] outline-none focus:text-[var(--settings-text)]"
            />
        </div>
    )
}

export function AppearanceThemeController({
    mode,
    theme,
    accent,
    uiFont,
    codeFont,
    customActive,
    customAvailable,
    onUseCustom,
    onTokensChange,
    onAccentChange
}: {
    mode: AppearanceThemeMode
    theme: ThemeDefinition
    accent: AccentColor
    uiFont: AppearanceUiFont
    codeFont: AppearanceCodeFont
    customActive: boolean
    customAvailable: boolean
    onUseCustom: () => void
    onTokensChange: (tokens: ThemeTokens) => void
    onAccentChange: (accent: AccentColor) => void
}) {
    const [copied, setCopied] = useState(false)
    const [copyError, setCopyError] = useState<string | null>(null)
    const modeTitle = customActive
        ? `Custom ${theme.name}`
        : mode === 'system' ? 'System default' : theme.name
    const modeDescription = customActive
        ? `These saved values are based on ${theme.name}.`
        : mode === 'system'
            ? `Zyra is following the system appearance with ${theme.name}.`
            : `${theme.description}.`

    const copyTheme = async () => {
        setCopyError(null)
        try {
            await navigator.clipboard.writeText(JSON.stringify({
                mode: customActive ? 'custom' : mode,
                baseTheme: theme.id,
                accent,
                uiFont,
                codeFont,
                tokens: theme.tokens
            }, null, 2))
            setCopied(true)
            window.setTimeout(() => setCopied(false), 1600)
        } catch {
            setCopied(false)
            setCopyError('Could not copy theme values to the clipboard.')
        }
    }

    return (
        <>
            <div data-settings-search-target={createSettingsRowTargetId('Theme', 'Custom theme')} tabIndex={-1}>
                <SettingsSection
                    title="Custom theme"
                    searchSection="Theme"
                    headerAction={(
                        <div className="flex items-center gap-1.5">
                            {customAvailable && !customActive ? (
                                <SettingsButton variant="ghost" onClick={onUseCustom}>Use saved custom</SettingsButton>
                            ) : null}
                            <SettingsButton variant="ghost" onClick={() => void copyTheme()}>
                                {copied ? <Check size={12} /> : <Copy size={12} />}
                                {copied ? 'Copied' : 'Copy values'}
                            </SettingsButton>
                        </div>
                    )}
                >
                    <div className="px-4 py-3.5">
                        <div className="text-[13px] font-medium text-[var(--settings-text)]">{modeTitle}</div>
                        <p className="mt-1 text-[12px] leading-5 text-[var(--settings-text-secondary)]">{modeDescription}</p>
                    </div>
                    {copyError ? <SettingsNotice tone="error">{copyError}</SettingsNotice> : null}
                </SettingsSection>
            </div>

            <SettingsSection title="Accent values" searchSection="Theme">
                <SettingsRow
                    title="Accent primary"
                    description="Set the main action and focus color."
                    control={<EditableHexValue label="Accent primary" value={accent.primary} onCommit={(primary) => onAccentChange({ name: 'Custom', primary, secondary: accent.secondary })} />}
                    searchTargetId={createSettingsRowTargetId('Theme', 'Accent primary')}
                />
                <SettingsRow
                    title="Accent secondary"
                    description="Set the companion color used in supporting states."
                    control={<EditableHexValue label="Accent secondary" value={accent.secondary} onCommit={(secondary) => onAccentChange({ name: 'Custom', primary: accent.primary, secondary })} />}
                    searchTargetId={createSettingsRowTargetId('Theme', 'Accent secondary')}
                />
            </SettingsSection>

            <div data-settings-search-target={createSettingsRowTargetId('Theme', 'Theme colors')} tabIndex={-1}>
                <SettingsSection title="Theme colors" searchSection="Theme">
                    {TOKEN_LABELS.map(({ key, label }) => (
                        <SettingsRow
                            key={key}
                            title={label}
                            description={`Set the ${label.toLowerCase()} color.`}
                            control={(
                                <EditableHexValue
                                    label={label}
                                    value={theme.tokens[key]}
                                    onCommit={(value) => onTokensChange({ ...theme.tokens, [key]: value })}
                                />
                            )}
                            searchTargetId={createSettingsRowTargetId('Theme', label)}
                        />
                    ))}
                </SettingsSection>
            </div>
        </>
    )
}
