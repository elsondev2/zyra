import { RotateCcw } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { DevScopeManagedFont } from '@shared/contracts/font-contracts'
import {
    ACCENT_COLORS,
    APPEARANCE_CODE_FONTS,
    APPEARANCE_UI_FONTS,
    THEMES,
    getAppearanceLocalFontFamily,
    getAppearanceManagedFontId,
    getSystemAppearanceTheme,
    useSettings,
    type AppearanceCodeFont,
    type AppearanceThemeMode,
    type AppearanceUiFont,
    type DarkTheme,
    type Theme
} from '@/lib/settings'
import type { ThemeTokens } from '@/lib/settings-theme-catalog'
import { listAppearanceManagedFonts } from '@/lib/appearance-font-runtime'
import {
    SettingsButton,
    SettingsPageContainer,
    SettingsRow,
    SettingsSection,
    SettingsSegmented,
    SettingsSwitch
} from './settings-layout'
import { AppearanceFontManagerDialog } from './appearance/AppearanceFontManagerDialog'
import { AppearanceThemeController } from './appearance/AppearanceThemeController'
import {
    AppearanceCodePreview,
    AppearanceSystemThemeCard,
    AppearanceThemeCard
} from './appearance/AppearancePreviews'

export default function AppearanceSettings() {
    const { settings, updateSettings } = useSettings()
    const [fontManagerTarget, setFontManagerTarget] = useState<'ui' | 'code' | null>(null)
    const [managedFonts, setManagedFonts] = useState<DevScopeManagedFont[]>([])
    const baseSelectedTheme = THEMES.find((theme) => theme.id === settings.theme) || THEMES[0]
    const lightTheme = THEMES.find((theme) => theme.id === 'light') || THEMES[0]
    const defaultDarkTheme = THEMES.find((theme) => theme.id === 'dark') || THEMES[0]
    const selectedDarkTheme = THEMES.find((theme) => theme.id === settings.appearanceDarkTheme) || defaultDarkTheme
    const customThemeActive = settings.appearanceCustomThemeActive
        && settings.appearanceCustomTheme?.baseTheme === settings.theme
    const selectedTheme = customThemeActive && settings.appearanceCustomTheme
        ? { ...baseSelectedTheme, tokens: settings.appearanceCustomTheme.tokens }
        : baseSelectedTheme
    useEffect(() => {
        let active = true
        void listAppearanceManagedFonts().then((fonts) => {
            if (active) setManagedFonts(fonts)
        }).catch(() => undefined)
        return () => { active = false }
    }, [])

    const resolveFontLabel = (font: AppearanceUiFont | AppearanceCodeFont) => {
        const builtIn = [...APPEARANCE_UI_FONTS, ...APPEARANCE_CODE_FONTS].find((entry) => entry.id === font)
        if (builtIn) return builtIn.label
        const managedFontId = getAppearanceManagedFontId(font)
        if (managedFontId) return managedFonts.find((entry) => entry.id === managedFontId)?.family || 'Managed font'
        return getAppearanceLocalFontFamily(font) || 'Local font'
    }

    const paletteChanged = settings.appearanceThemeMode !== 'system'
        || settings.appearanceDarkTheme !== 'dark'
        || settings.appearanceCustomThemeActive
        || settings.appearanceUiFont !== 'hanken'
        || settings.appearanceCodeFont !== 'system-mono'
        || settings.accentColor.name !== 'Blue'

    const getPresetAccent = (theme: Theme) => {
        const definition = THEMES.find((entry) => entry.id === theme)
        return ACCENT_COLORS.find((accent) => accent.name === definition?.accentColor) || ACCENT_COLORS[0]
    }

    const selectThemeMode = (appearanceThemeMode: AppearanceThemeMode) => {
        const theme: Theme = appearanceThemeMode === 'system'
            ? getSystemAppearanceTheme()
            : appearanceThemeMode === 'light'
                ? 'light'
                : settings.appearanceDarkTheme
        updateSettings({
            appearanceThemeMode,
            theme,
            appearanceCustomThemeActive: false,
            appearanceUiFont: 'hanken',
            appearanceCodeFont: 'system-mono',
            accentColor: getPresetAccent(theme)
        })
    }

    const selectThemePreset = (theme: Theme | 'custom') => {
        if (theme === 'custom') {
            const customTheme = settings.appearanceCustomTheme
            if (!customTheme) return
            const isLight = customTheme.baseTheme === 'light'
            updateSettings({
                appearanceThemeMode: isLight ? 'light' : 'dark',
                appearanceDarkTheme: isLight ? settings.appearanceDarkTheme : customTheme.baseTheme as DarkTheme,
                appearanceCustomThemeActive: true,
                appearanceUiFont: customTheme.uiFont,
                appearanceCodeFont: customTheme.codeFont,
                theme: customTheme.baseTheme,
                accentColor: customTheme.accentColor
            })
            return
        }
        if (theme === 'light') {
            updateSettings({
                appearanceThemeMode: 'light',
                appearanceCustomThemeActive: false,
                appearanceUiFont: 'hanken',
                appearanceCodeFont: 'system-mono',
                theme,
                accentColor: getPresetAccent(theme)
            })
            return
        }
        updateSettings({
            appearanceThemeMode: 'dark',
            appearanceDarkTheme: theme as DarkTheme,
            appearanceCustomThemeActive: false,
            appearanceUiFont: 'hanken',
            appearanceCodeFont: 'system-mono',
            theme,
            accentColor: getPresetAccent(theme)
        })
    }

    const saveCustomTheme = (
        tokens: ThemeTokens,
        accentColor = settings.accentColor,
        uiFont: AppearanceUiFont = settings.appearanceUiFont,
        codeFont: AppearanceCodeFont = settings.appearanceCodeFont
    ) => {
        const baseTheme = settings.theme
        const isLight = baseTheme === 'light'
        updateSettings({
            appearanceThemeMode: isLight ? 'light' : 'dark',
            appearanceDarkTheme: isLight ? settings.appearanceDarkTheme : baseTheme as DarkTheme,
            appearanceCustomTheme: { baseTheme, tokens, accentColor, uiFont, codeFont },
            appearanceCustomThemeActive: true,
            appearanceUiFont: uiFont,
            appearanceCodeFont: codeFont,
            accentColor
        })
    }

    const resetTheme = () => {
        updateSettings({
            appearanceThemeMode: 'system',
            appearanceDarkTheme: 'dark',
            appearanceCustomThemeActive: false,
            appearanceUiFont: 'hanken',
            appearanceCodeFont: 'system-mono',
            theme: getSystemAppearanceTheme(),
            accentColor: ACCENT_COLORS[0]
        })
    }

    return (
        <SettingsPageContainer className="!max-w-[780px] !gap-8">
            <header className="px-0.5">
                <h1 className="text-[24px] font-medium tracking-[-0.025em] text-[var(--settings-text)]">Appearance</h1>
            </header>

            <section className="space-y-4" aria-labelledby="appearance-theme-title">
                <div className="flex min-h-7 items-center justify-between gap-4 px-0.5">
                    <h2 id="appearance-theme-title" className="text-[14px] font-semibold tracking-[-0.01em] text-[var(--settings-text)]">Theme</h2>
                    {paletteChanged ? (
                        <SettingsButton variant="ghost" onClick={resetTheme}>
                            <RotateCcw size={12} />
                            Reset
                        </SettingsButton>
                    ) : null}
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3" role="radiogroup" aria-label="Appearance mode">
                    <AppearanceSystemThemeCard
                        darkTheme={defaultDarkTheme}
                        lightTheme={lightTheme}
                        selected={settings.appearanceThemeMode === 'system'}
                        onSelect={() => selectThemeMode('system')}
                    />
                    <AppearanceThemeCard
                        theme={customThemeActive && settings.theme === 'light' ? selectedTheme : lightTheme}
                        label="Light"
                        selected={settings.appearanceThemeMode === 'light'}
                        onSelect={() => selectThemeMode('light')}
                    />
                    <AppearanceThemeCard
                        theme={customThemeActive && settings.theme !== 'light' ? selectedTheme : selectedDarkTheme}
                        label="Dark"
                        selected={settings.appearanceThemeMode === 'dark'}
                        onSelect={() => selectThemeMode('dark')}
                    />
                </div>

                <AppearanceCodePreview theme={selectedTheme} accent={settings.accentColor} compact={settings.compactMode} />

                <AppearanceThemeController
                    mode={settings.appearanceThemeMode}
                    theme={selectedTheme}
                    accent={settings.accentColor}
                    customActive={customThemeActive}
                    customAvailable={settings.appearanceCustomTheme !== null}
                    uiFont={settings.appearanceUiFont}
                    codeFont={settings.appearanceCodeFont}
                    uiFontLabel={resolveFontLabel(settings.appearanceUiFont)}
                    codeFontLabel={resolveFontLabel(settings.appearanceCodeFont)}
                    onPresetChange={selectThemePreset}
                    onTokensChange={(tokens) => saveCustomTheme(tokens)}
                    onAccentChange={(accentColor) => saveCustomTheme(selectedTheme.tokens, accentColor)}
                    onUiFontChange={(uiFont) => saveCustomTheme(selectedTheme.tokens, settings.accentColor, uiFont)}
                    onCodeFontChange={(codeFont) => saveCustomTheme(selectedTheme.tokens, settings.accentColor, settings.appearanceUiFont, codeFont)}
                    onOpenFontManager={setFontManagerTarget}
                />
            </section>

            <SettingsSection title="Preferences">
                <SettingsRow
                    title="Interface density"
                    description="Choose comfortable spacing or fit more information on screen."
                    control={(
                        <SettingsSegmented
                            value={settings.compactMode ? 'compact' : 'comfortable'}
                            options={[
                                { value: 'comfortable', label: 'Comfortable' },
                                { value: 'compact', label: 'Compact' }
                            ]}
                            onChange={(value) => updateSettings({ compactMode: value === 'compact' })}
                            label="Interface density"
                        />
                    )}
                />
                <SettingsRow
                    title="Reduce motion"
                    description="Minimize transitions, animation, and smooth scrolling."
                    control={<SettingsSwitch checked={settings.accessibilityReduceMotion} onCheckedChange={(accessibilityReduceMotion) => updateSettings({ accessibilityReduceMotion })} label="Reduce motion" />}
                />
            </SettingsSection>

            <AppearanceFontManagerDialog
                open={fontManagerTarget !== null}
                target={fontManagerTarget || 'ui'}
                managedFonts={managedFonts}
                currentFont={fontManagerTarget === 'code' ? settings.appearanceCodeFont : settings.appearanceUiFont}
                usedManagedFontIds={[
                    getAppearanceManagedFontId(settings.appearanceUiFont),
                    getAppearanceManagedFontId(settings.appearanceCodeFont),
                    settings.appearanceCustomTheme ? getAppearanceManagedFontId(settings.appearanceCustomTheme.uiFont) : null,
                    settings.appearanceCustomTheme ? getAppearanceManagedFontId(settings.appearanceCustomTheme.codeFont) : null
                ].filter((fontId): fontId is string => Boolean(fontId))}
                onManagedFontsChange={setManagedFonts}
                onSelect={(font) => {
                    if (fontManagerTarget === 'code') {
                        saveCustomTheme(selectedTheme.tokens, settings.accentColor, settings.appearanceUiFont, font as AppearanceCodeFont)
                    } else {
                        saveCustomTheme(selectedTheme.tokens, settings.accentColor, font as AppearanceUiFont)
                    }
                }}
                onClose={() => setFontManagerTarget(null)}
            />
        </SettingsPageContainer>
    )
}
