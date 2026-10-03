import { Monitor, Moon, Repeat2, RotateCcw, Sun } from 'lucide-react'
import { DEFAULT_APPEARANCE_CONTRAST_SCALE, type AppearanceThemeMode } from '@/lib/settings'
import { AppearanceAccentPicker } from './AppearanceAccentPicker'
import { AppearanceThemeSelector } from './AppearanceThemeSelect'
import type { AppearanceSettingsController } from './useAppearanceSettingsController'
import { SettingsPageLink } from '../SettingsPageTabs'
import { SettingResetButton, SettingsButton, SettingsRow, SettingsSection, SettingsSlider } from '../settings-layout'
import { createSettingsRowTargetId } from '../settings-search'

export function AppearanceThemePage({ controller }: { controller: AppearanceSettingsController }) {
    const { settings } = controller

    return (
        <SettingsSection
            title="Theme"
            headerAction={controller.resetAvailable ? (
                <SettingsButton variant="ghost" onClick={controller.resetAppearance}>
                    <RotateCcw size={12} />
                    Reset theme & fonts
                </SettingsButton>
            ) : null}
        >
            <SettingsRow
                title="Appearance mode"
                description="Follow the system or keep Zyra in one appearance."
                control={(
                    <AppearanceModeCycle value={settings.appearanceThemeMode} onChange={controller.selectThemeMode} />
                )}
                searchTargetId={createSettingsRowTargetId('Theme', 'Appearance mode')}
            />

            <SettingsRow
                title="Light and dark themes"
                description="Choose the preset Zyra keeps for each appearance."
                searchTargetId={createSettingsRowTargetId('Theme', 'Light and dark themes')}
            >
                <AppearanceThemeSelector
                    appearance={settings.appearanceResolvedMode}
                    lightTheme={settings.appearanceLightTheme}
                    darkTheme={settings.appearanceDarkTheme}
                    onThemeChange={controller.selectThemePreset}
                    className="mt-3"
                />
            </SettingsRow>

            <SettingsRow
                title={(
                    <span className="inline-flex items-center gap-2">
                        Accent preset
                        <span
                            className="inline-flex h-5 items-center rounded-full border border-black/15 px-2 text-[10px] font-semibold text-white [text-shadow:0_1px_1px_rgba(0,0,0,0.6)]"
                            style={{ background: `linear-gradient(135deg, ${settings.accentColor.primary} 0 52%, ${settings.accentColor.secondary} 52% 100%)` }}
                        >
                            {settings.accentColor.name}
                        </span>
                    </span>
                )}
                description="Use one accent across actions, focus states and selections."
                control={<AppearanceAccentPicker value={settings.accentColor} background={controller.selectedTheme.tokens.bg} onChange={controller.selectAccent} />}
                searchTargetId={createSettingsRowTargetId('Theme', 'Accent preset')}
            />

            <SettingsRow
                title="Contrast"
                description="Strengthen or soften text, borders and accents, from 70 to 150 percent."
                resetAction={settings.appearanceContrastScale !== DEFAULT_APPEARANCE_CONTRAST_SCALE ? (
                    <SettingResetButton label="Contrast" onClick={() => controller.setContrastScale(DEFAULT_APPEARANCE_CONTRAST_SCALE)} />
                ) : null}
                control={(
                    <SettingsSlider
                        value={settings.appearanceContrastScale}
                        min={70}
                        max={150}
                        step={5}
                        unit="%"
                        label="Contrast"
                        onChange={controller.setContrastScale}
                    />
                )}
                searchTargetId={createSettingsRowTargetId('Theme', 'Contrast')}
            />

            <div data-settings-search-target={createSettingsRowTargetId('Theme', 'Custom theme')} tabIndex={-1}>
                <SettingsPageLink
                    to="/settings/app/appearance/colors"
                    title="Customize colors"
                    description="Edit exact accent and theme values or restore your saved custom theme."
                />
            </div>
        </SettingsSection>
    )
}

function AppearanceModeCycle({ value, onChange }: { value: AppearanceThemeMode; onChange: (mode: AppearanceThemeMode) => void }) {
    const options = [
        { value: 'system' as const, label: 'System', icon: <Monitor size={14} /> },
        { value: 'light' as const, label: 'Light', icon: <Sun size={14} /> },
        { value: 'dark' as const, label: 'Dark', icon: <Moon size={14} /> }
    ]
    const currentIndex = options.findIndex((option) => option.value === value)
    const current = options[currentIndex] || options[0]
    const next = options[(currentIndex + 1) % options.length]!
    return <button type="button" aria-label={`Appearance mode: ${current.label}. Switch to ${next.label}.`} title={`Switch to ${next.label}`} onClick={() => onChange(next.value)} className="flex h-8 w-full min-w-40 items-center gap-2 rounded-md border border-[var(--settings-border)] bg-[var(--settings-control)] px-2.5 text-xs font-medium text-[var(--settings-text)] transition-colors hover:border-[var(--settings-border-strong)] hover:bg-[var(--settings-control-hover)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-primary)] sm:w-44">
        <span className="inline-flex size-4 shrink-0 items-center justify-center" aria-hidden="true">{current.icon}</span>
        <span className="min-w-0 flex-1 truncate text-left">{current.label}</span>
        <Repeat2 size={13} aria-hidden="true" className="shrink-0 text-[var(--settings-text-muted)]" />
    </button>
}
