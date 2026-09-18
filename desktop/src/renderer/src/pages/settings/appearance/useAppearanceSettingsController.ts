import { useEffect, useState } from 'react'
import type { DevScopeManagedFont } from '@shared/contracts/font-contracts'
import { listAppearanceManagedFonts } from '@/lib/appearance-font-runtime'
import { registerSettingsCacheClearer } from '@/lib/settings-cache-registry'
import {
    APPEARANCE_CODE_FONTS,
    APPEARANCE_UI_FONTS,
    DEFAULT_APPEARANCE_DARK_THEME,
    DEFAULT_APPEARANCE_LIGHT_THEME,
    DEFAULT_APPEARANCE_UI_FONT,
    THEMES,
    getAppearanceLocalFontFamily,
    getAppearanceManagedFontId,
    getSystemAppearanceTheme,
    getThemeAppearance,
    getThemePresetAccent,
    resolveAppearanceTheme,
    useSettings,
    type AppearanceCodeFont,
    type AppearanceThemeMode,
    type AppearanceUiFont,
    type DarkTheme,
    type LightTheme
} from '@/lib/settings'
import type { AccentColor } from '@shared/preferences/accent-presets'
import type { ThemeTokens } from '@/lib/settings-theme-catalog'
import {
    createResetAppearancePatch,
    createSaveCustomThemePatch,
    createThemeModePatch,
    createThemePresetPatch,
    createUseSavedCustomThemePatch,
    hasAppearanceChanges,
    type AppearanceModelDependencies
} from './appearance-settings-model'

let cachedManagedFonts: DevScopeManagedFont[] | null = null
let cachedManagedFontsAt = 0
let pendingManagedFonts: Promise<DevScopeManagedFont[]> | null = null
let managedFontGeneration = 0

function loadManagedFonts(): Promise<DevScopeManagedFont[]> {
    if (cachedManagedFonts && Date.now() - cachedManagedFontsAt < 5 * 60_000) return Promise.resolve(cachedManagedFonts)
    if (pendingManagedFonts) return pendingManagedFonts
    const generation = managedFontGeneration
    const request = listAppearanceManagedFonts().then((fonts) => {
        if (generation === managedFontGeneration) {
            cachedManagedFonts = fonts
            cachedManagedFontsAt = Date.now()
        }
        return fonts
    })
    pendingManagedFonts = request
    void request.finally(() => {
        if (pendingManagedFonts === request) pendingManagedFonts = null
    }).catch(() => undefined)
    return request
}

registerSettingsCacheClearer('settings-managed-fonts', () => {
    managedFontGeneration += 1
    cachedManagedFonts = null
    cachedManagedFontsAt = 0
    pendingManagedFonts = null
})

const appearanceModelDependencies: AppearanceModelDependencies = {
    resolveTheme: resolveAppearanceTheme,
    getThemeAppearance,
    getPresetAccent: getThemePresetAccent
}

export function useAppearanceSettingsController(loadFonts = true) {
    const { settings, updateSettings } = useSettings()
    const [fontManagerTarget, setFontManagerTarget] = useState<'ui' | 'code' | null>(null)
    const [managedFonts, setManagedFonts] = useState<DevScopeManagedFont[]>(() => cachedManagedFonts || [])
    const [managedFontsError, setManagedFontsError] = useState<string | null>(null)

    useEffect(() => {
        if (!loadFonts) return
        let active = true
        void loadManagedFonts().then((fonts) => {
            if (!active) return
            setManagedFonts(fonts)
            setManagedFontsError(null)
        }).catch((error) => {
            if (active) setManagedFontsError(error instanceof Error ? error.message : 'Could not load downloaded fonts.')
        })
        return () => { active = false }
    }, [loadFonts])

    const baseSelectedTheme = THEMES.find((theme) => theme.id === settings.theme) || THEMES[0]
    const customThemeActive = settings.appearanceCustomThemeActive
        && settings.appearanceCustomTheme?.baseTheme === settings.theme
    const selectedTheme = customThemeActive && settings.appearanceCustomTheme
        ? { ...baseSelectedTheme, tokens: settings.appearanceCustomTheme.tokens }
        : baseSelectedTheme
    const resetAvailable = hasAppearanceChanges(
        settings,
        DEFAULT_APPEARANCE_LIGHT_THEME,
        DEFAULT_APPEARANCE_DARK_THEME,
        DEFAULT_APPEARANCE_UI_FONT
    )

    const resolveFontLabel = (font: AppearanceUiFont | AppearanceCodeFont) => {
        const builtIn = [...APPEARANCE_UI_FONTS, ...APPEARANCE_CODE_FONTS].find((entry) => entry.id === font)
        if (builtIn) return builtIn.label
        const managedFontId = getAppearanceManagedFontId(font)
        if (managedFontId) return managedFonts.find((entry) => entry.id === managedFontId)?.family || 'Managed font'
        return getAppearanceLocalFontFamily(font) || 'Local font'
    }

    const saveCustomTheme = (
        tokens: ThemeTokens,
        accentColor: AccentColor = settings.accentColor,
        uiFont: AppearanceUiFont = settings.appearanceUiFont,
        codeFont: AppearanceCodeFont = settings.appearanceCodeFont
    ) => {
        void updateSettings(createSaveCustomThemePatch(
            settings,
            tokens,
            appearanceModelDependencies,
            accentColor,
            uiFont,
            codeFont
        ))
    }

    const selectThemeMode = (appearanceThemeMode: AppearanceThemeMode) => {
        void updateSettings(createThemeModePatch(settings, appearanceThemeMode, appearanceModelDependencies))
    }

    const resolvedAppearance = settings.appearanceThemeMode === 'system'
        ? getSystemAppearanceTheme()
        : settings.appearanceThemeMode

    const selectLightTheme = (appearanceLightTheme: LightTheme) => {
        void updateSettings(createThemePresetPatch(
            resolvedAppearance,
            'light',
            appearanceLightTheme,
            appearanceModelDependencies
        ))
    }

    const selectDarkTheme = (appearanceDarkTheme: DarkTheme) => {
        void updateSettings(createThemePresetPatch(
            resolvedAppearance,
            'dark',
            appearanceDarkTheme,
            appearanceModelDependencies
        ))
    }

    const useSavedCustomTheme = () => {
        if (!settings.appearanceCustomTheme) return
        void updateSettings(createUseSavedCustomThemePatch(settings.appearanceCustomTheme, appearanceModelDependencies))
    }

    const resetAppearance = () => {
        void updateSettings(createResetAppearancePatch(
            DEFAULT_APPEARANCE_LIGHT_THEME,
            DEFAULT_APPEARANCE_DARK_THEME,
            DEFAULT_APPEARANCE_UI_FONT,
            appearanceModelDependencies
        ))
    }

    const updateManagedFonts = (fonts: DevScopeManagedFont[]) => {
        cachedManagedFonts = fonts
        cachedManagedFontsAt = Date.now()
        setManagedFonts(fonts)
        setManagedFontsError(null)
    }

    return {
        settings,
        selectedTheme,
        customThemeActive,
        resetAvailable,
        managedFonts,
        managedFontsError,
        fontManagerTarget,
        setFontManagerTarget,
        updateManagedFonts,
        resolveFontLabel,
        selectThemeMode,
        selectLightTheme,
        selectDarkTheme,
        useSavedCustomTheme,
        resetAppearance,
        saveTokens: (tokens: ThemeTokens) => saveCustomTheme(tokens),
        selectAccent: (accentColor: AccentColor) => saveCustomTheme(selectedTheme.tokens, accentColor),
        selectUiFont: (uiFont: AppearanceUiFont) => saveCustomTheme(selectedTheme.tokens, settings.accentColor, uiFont),
        selectCodeFont: (codeFont: AppearanceCodeFont) => saveCustomTheme(selectedTheme.tokens, settings.accentColor, settings.appearanceUiFont, codeFont),
        setCompactMode: (compactMode: boolean) => { void updateSettings({ compactMode }) },
        setReduceMotion: (accessibilityReduceMotion: boolean) => { void updateSettings({ accessibilityReduceMotion }) },
        setSidebarCollapsed: (sidebarCollapsed: boolean) => { void updateSettings({ sidebarCollapsed }) },
        setSidebarHoverPreviewEnabled: (sidebarHoverPreviewEnabled: boolean) => { void updateSettings({ sidebarHoverPreviewEnabled }) },
        setAgentInboxSidebarEnabled: (assistantAgentInboxSidebarEnabled: boolean) => { void updateSettings({ assistantAgentInboxSidebarEnabled }) }
    }
}

export type AppearanceSettingsController = ReturnType<typeof useAppearanceSettingsController>
