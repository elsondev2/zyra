import { Monitor, Moon, RotateCcw, Sun } from 'lucide-react'
import { AppearanceAccentPicker } from './AppearanceAccentPicker'
import { AppearanceThemeSelector } from './AppearanceThemeSelect'
import type { AppearanceSettingsController } from './useAppearanceSettingsController'
import { SettingsPageLink } from '../SettingsPageTabs'
import { SettingsButton, SettingsRow, SettingsSection, SettingsSegmented } from '../settings-layout'
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
                    <SettingsSegmented
                        value={settings.appearanceThemeMode}
                        options={[
                            { value: 'system', label: 'System', icon: <Monitor size={14} /> },
                            { value: 'light', label: 'Light', icon: <Sun size={14} /> },
                            { value: 'dark', label: 'Dark', icon: <Moon size={14} /> }
                        ]}
                        onChange={controller.selectThemeMode}
                        label="Appearance mode"
                    />
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
                    onLightThemeChange={controller.selectLightTheme}
                    onDarkThemeChange={controller.selectDarkTheme}
                    className="mt-3"
                />
            </SettingsRow>

            <SettingsRow
                title="Accent preset"
                description="Use one accent across actions, focus states and selections."
                searchTargetId={createSettingsRowTargetId('Theme', 'Accent preset')}
            >
                <AppearanceAccentPicker value={settings.accentColor} onChange={controller.selectAccent} />
            </SettingsRow>

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
