import {
    DEFAULT_APPEARANCE_ANIMATION_SPEED,
    DEFAULT_APPEARANCE_ANIMATION_SCALE,
    DEFAULT_APPEARANCE_CODE_FONT,
    DEFAULT_APPEARANCE_CODE_SCALE,
    DEFAULT_APPEARANCE_CONTRAST_SCALE,
    DEFAULT_APPEARANCE_INTERFACE_SCALE
} from '@/lib/settings'
import type {
    AppearanceCodeFont,
    AppearanceCustomTheme,
    AppearanceThemeMode,
    AppearanceUiFont,
    DarkTheme,
    LightTheme,
    Settings,
    Theme
} from '@/lib/settings'
import type { ThemeTokens } from '@/lib/settings-theme-catalog'
import type { AccentColor } from '@shared/preferences/accent-presets'

export type AppearancePreferences = Pick<Settings,
    | 'theme'
    | 'appearanceThemeMode'
    | 'appearanceLightTheme'
    | 'appearanceDarkTheme'
    | 'appearanceCustomTheme'
    | 'appearanceCustomThemeActive'
    | 'appearanceUiFont'
    | 'appearanceCodeFont'
    | 'appearanceInterfaceScale'
    | 'appearanceCodeScale'
    | 'appearanceContrastScale'
    | 'appearanceAnimationSpeed'
    | 'appearanceAnimationScale'
    | 'accentColor'
>

export type AppearanceSettingsPatch = Partial<AppearancePreferences>

export type AppearanceModelDependencies = {
    resolveTheme: (mode: AppearanceThemeMode, lightTheme: LightTheme, darkTheme: DarkTheme) => Theme
    getThemeAppearance: (theme: Theme) => 'light' | 'dark'
    getPresetAccent: (theme: Theme) => AccentColor
}

export function createThemeModePatch(
    settings: AppearancePreferences,
    appearanceThemeMode: AppearanceThemeMode,
    dependencies: AppearanceModelDependencies
): AppearanceSettingsPatch {
    const theme = dependencies.resolveTheme(
        appearanceThemeMode,
        settings.appearanceLightTheme,
        settings.appearanceDarkTheme
    )
    return {
        appearanceThemeMode,
        theme,
        appearanceCustomThemeActive: false,
        accentColor: dependencies.getPresetAccent(theme)
    }
}

export function createThemePresetPatch(
    resolvedAppearance: 'light' | 'dark',
    appearance: 'light',
    theme: LightTheme,
    dependencies: AppearanceModelDependencies
): AppearanceSettingsPatch
export function createThemePresetPatch(
    resolvedAppearance: 'light' | 'dark',
    appearance: 'dark',
    theme: DarkTheme,
    dependencies: AppearanceModelDependencies
): AppearanceSettingsPatch
export function createThemePresetPatch(
    resolvedAppearance: 'light' | 'dark',
    appearance: 'light' | 'dark',
    theme: LightTheme | DarkTheme,
    dependencies: AppearanceModelDependencies
): AppearanceSettingsPatch {
    const active = resolvedAppearance === appearance
    return {
        ...(appearance === 'light'
            ? { appearanceLightTheme: theme as LightTheme }
            : { appearanceDarkTheme: theme as DarkTheme }),
        ...(active ? {
            theme,
            appearanceCustomThemeActive: false,
            accentColor: dependencies.getPresetAccent(theme)
        } : {})
    }
}

/** Selecting a preset card is an intent to use that appearance now, not only save it for later. */
export function createActiveThemePresetPatch(
    settings: AppearancePreferences,
    appearance: 'light' | 'dark',
    theme: Theme,
    dependencies: AppearanceModelDependencies
): AppearanceSettingsPatch {
    return {
        appearanceThemeMode: appearance,
        ...(appearance === 'light'
            ? { appearanceLightTheme: theme as LightTheme }
            : { appearanceDarkTheme: theme as DarkTheme }),
        theme,
        appearanceCustomThemeActive: false,
        accentColor: dependencies.getPresetAccent(theme)
    }
}

export function createUseSavedCustomThemePatch(
    customTheme: AppearanceCustomTheme,
    dependencies: AppearanceModelDependencies
): AppearanceSettingsPatch {
    const appearance = dependencies.getThemeAppearance(customTheme.baseTheme)
    return {
        appearanceThemeMode: appearance,
        ...(appearance === 'light'
            ? { appearanceLightTheme: customTheme.baseTheme as LightTheme }
            : { appearanceDarkTheme: customTheme.baseTheme as DarkTheme }),
        appearanceCustomThemeActive: true,
        appearanceUiFont: customTheme.uiFont,
        appearanceCodeFont: customTheme.codeFont,
        theme: customTheme.baseTheme,
        accentColor: customTheme.accentColor
    }
}

export function createSaveCustomThemePatch(
    settings: AppearancePreferences,
    tokens: ThemeTokens,
    dependencies: AppearanceModelDependencies,
    accentColor: AccentColor = settings.accentColor,
    uiFont: AppearanceUiFont = settings.appearanceUiFont,
    codeFont: AppearanceCodeFont = settings.appearanceCodeFont
): AppearanceSettingsPatch {
    const baseTheme = settings.theme
    const appearance = dependencies.getThemeAppearance(baseTheme)
    return {
        appearanceThemeMode: appearance,
        ...(appearance === 'light'
            ? { appearanceLightTheme: baseTheme as LightTheme }
            : { appearanceDarkTheme: baseTheme as DarkTheme }),
        appearanceCustomTheme: { baseTheme, tokens, accentColor, uiFont, codeFont },
        appearanceCustomThemeActive: true,
        appearanceUiFont: uiFont,
        appearanceCodeFont: codeFont,
        accentColor
    }
}

export function createResetAppearancePatch(
    defaultLightTheme: LightTheme,
    defaultDarkTheme: DarkTheme,
    defaultUiFont: AppearanceUiFont,
    dependencies: AppearanceModelDependencies
): AppearanceSettingsPatch {
    const theme = dependencies.resolveTheme('system', defaultLightTheme, defaultDarkTheme)
    return {
        appearanceThemeMode: 'system',
        appearanceLightTheme: defaultLightTheme,
        appearanceDarkTheme: defaultDarkTheme,
        appearanceCustomThemeActive: false,
        appearanceUiFont: defaultUiFont,
        appearanceCodeFont: DEFAULT_APPEARANCE_CODE_FONT,
        appearanceInterfaceScale: DEFAULT_APPEARANCE_INTERFACE_SCALE,
        appearanceCodeScale: DEFAULT_APPEARANCE_CODE_SCALE,
        appearanceContrastScale: DEFAULT_APPEARANCE_CONTRAST_SCALE,
        appearanceAnimationSpeed: DEFAULT_APPEARANCE_ANIMATION_SPEED,
        appearanceAnimationScale: DEFAULT_APPEARANCE_ANIMATION_SCALE,
        theme,
        accentColor: dependencies.getPresetAccent(theme)
    }
}

export function hasAppearanceChanges(
    settings: AppearancePreferences,
    defaultLightTheme: LightTheme,
    defaultDarkTheme: DarkTheme,
    defaultUiFont: AppearanceUiFont
): boolean {
    return settings.appearanceThemeMode !== 'system'
        || settings.appearanceLightTheme !== defaultLightTheme
        || settings.appearanceDarkTheme !== defaultDarkTheme
        || settings.appearanceCustomThemeActive
        || settings.appearanceUiFont !== defaultUiFont
        || settings.appearanceCodeFont !== DEFAULT_APPEARANCE_CODE_FONT
        || settings.appearanceInterfaceScale !== DEFAULT_APPEARANCE_INTERFACE_SCALE
        || settings.appearanceCodeScale !== DEFAULT_APPEARANCE_CODE_SCALE
        || settings.appearanceContrastScale !== DEFAULT_APPEARANCE_CONTRAST_SCALE
        || settings.appearanceAnimationSpeed !== DEFAULT_APPEARANCE_ANIMATION_SPEED
        || settings.appearanceAnimationScale !== DEFAULT_APPEARANCE_ANIMATION_SCALE
}
