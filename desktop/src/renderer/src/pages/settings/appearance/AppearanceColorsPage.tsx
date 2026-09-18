import { AppearanceThemeController } from './AppearanceThemeController'
import type { AppearanceSettingsController } from './useAppearanceSettingsController'

export function AppearanceColorsPage({ controller }: { controller: AppearanceSettingsController }) {
    const { settings } = controller

    return (
        <AppearanceThemeController
            mode={settings.appearanceThemeMode}
            theme={controller.selectedTheme}
            accent={settings.accentColor}
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
