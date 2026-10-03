import { getThemePresetAccent, THEMES } from '@/lib/settings'
import { AppearanceThemeController } from './AppearanceThemeController'
import type { AppearanceSettingsController } from './useAppearanceSettingsController'

export function AppearanceColorsPage({ controller }: { controller: AppearanceSettingsController }) {
    const { settings } = controller
    const baseTheme = THEMES.find((theme) => theme.id === settings.theme) || controller.selectedTheme

    return (
        <AppearanceThemeController
            mode={settings.appearanceThemeMode}
            theme={controller.selectedTheme}
            accent={settings.accentColor}
            baseTokens={baseTheme.tokens}
            baseAccent={getThemePresetAccent(baseTheme.id)}
            customActive={controller.customThemeActive}
            customAvailable={settings.appearanceCustomTheme !== null}
            uiFont={settings.appearanceUiFont}
            codeFont={settings.appearanceCodeFont}
            onUseCustom={controller.useSavedCustomTheme}
            onTokensChange={controller.saveTokens}
            onAccentChange={controller.selectAccent}
        />
    )
}
