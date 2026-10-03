import type { AppearancePreferences, AppearanceModelDependencies } from './appearance-settings-model'
import {
    createActiveThemePresetPatch,
    createResetAppearancePatch,
    createSaveCustomThemePatch,
    createThemeModePatch,
    createThemePresetPatch,
    createUseSavedCustomThemePatch,
    hasAppearanceChanges
} from './appearance-settings-model'

function assert(condition: unknown, message: string): asserts condition {
    if (!condition) throw new Error(message)
}

function equal(actual: unknown, expected: unknown, message: string) {
    const actualJson = JSON.stringify(actual)
    const expectedJson = JSON.stringify(expected)
    if (actualJson !== expectedJson) throw new Error(`${message}\nExpected ${expectedJson}\nReceived ${actualJson}`)
}

const blue = { name: 'Blue', primary: '#3b82f6', secondary: '#60a5fa' }
const violet = { name: 'Violet', primary: '#7c3aed', secondary: '#a78bfa' }
const tokens = {
    bg: '#000000', text: '#ffffff', textDark: '#eeeeee', textDarker: '#dddddd',
    textSecondary: '#cccccc', textMuted: '#999999', card: '#111111', border: '#222222',
    borderSecondary: '#333333', primary: '#444444', secondary: '#555555', accent: '#666666'
}
const dependencies: AppearanceModelDependencies = {
    resolveTheme: (mode, lightTheme, darkTheme) => mode === 'light' ? lightTheme : mode === 'dark' ? darkTheme : darkTheme,
    getThemeAppearance: (theme) => theme === 'paper-light' || theme === 'github-light' ? 'light' : 'dark',
    getPresetAccent: (theme) => theme === 'paper-light' || theme === 'github-light' ? blue : violet
}
const settings: AppearancePreferences = {
    theme: 'vercel',
    appearanceThemeMode: 'dark',
    appearanceLightTheme: 'paper-light',
    appearanceDarkTheme: 'vercel',
    appearanceCustomTheme: {
        baseTheme: 'vercel', tokens, accentColor: violet, uiFont: 'segoe', codeFont: 'cascadia'
    },
    appearanceCustomThemeActive: true,
    appearanceUiFont: 'segoe',
    appearanceCodeFont: 'cascadia',
    appearanceInterfaceScale: 100,
    appearanceCodeScale: 100,
    appearanceContrastScale: 100,
    appearanceAnimationSpeed: 'normal',
    appearanceAnimationScale: 100,
    accentColor: violet
}

const systemPatch = createThemeModePatch(settings, 'system', dependencies)
equal(systemPatch, {
    appearanceThemeMode: 'system',
    theme: 'vercel',
    appearanceCustomThemeActive: false,
    accentColor: violet
}, 'Mode selection resolves the active preset and leaves the saved custom theme intact.')

const inactiveLightPatch = createThemePresetPatch('dark', 'light', 'github-light', dependencies)
equal(inactiveLightPatch, { appearanceLightTheme: 'github-light' }, 'Choosing an inactive light preset must not replace the active dark palette.')

const activeLightPatch = createThemePresetPatch('light', 'light', 'github-light', dependencies)
equal(activeLightPatch, {
    appearanceLightTheme: 'github-light',
    theme: 'github-light',
    appearanceCustomThemeActive: false,
    accentColor: blue
}, 'Choosing the active light preset updates the visible theme and preset accent.')

const activatedLightPatch = createActiveThemePresetPatch(settings, 'light', 'github-light', dependencies)
equal(activatedLightPatch, {
    appearanceThemeMode: 'light',
    appearanceLightTheme: 'github-light',
    theme: 'github-light',
    appearanceCustomThemeActive: false,
    accentColor: blue
}, 'Choosing a light theme card makes that preset active immediately.')

const savedCustomPatch = createSaveCustomThemePatch(settings, tokens, dependencies, blue, 'hanken', 'jetbrains')
assert(savedCustomPatch.appearanceCustomTheme?.baseTheme === 'vercel', 'Custom values stay based on the visible theme.')
assert(savedCustomPatch.appearanceDarkTheme === 'vercel', 'Saving a dark custom theme updates only the dark preset slot.')
assert(savedCustomPatch.appearanceThemeMode === 'dark' && savedCustomPatch.appearanceCustomThemeActive === true, 'Editing custom values activates the visible appearance explicitly.')
assert(savedCustomPatch.appearanceUiFont === 'hanken' && savedCustomPatch.appearanceCodeFont === 'jetbrains', 'Custom theme saves include both font choices.')

const restoredPatch = createUseSavedCustomThemePatch(settings.appearanceCustomTheme!, dependencies)
assert(restoredPatch.theme === 'vercel' && restoredPatch.appearanceDarkTheme === 'vercel', 'Restoring a saved custom theme restores its matching mode slot.')
assert(restoredPatch.appearanceUiFont === 'segoe' && restoredPatch.appearanceCodeFont === 'cascadia', 'Restoring a saved custom theme restores its fonts.')

const resetPatch = createResetAppearancePatch('paper-light', 'vercel', 'bricolage', dependencies)
assert(resetPatch.appearanceThemeMode === 'system' && resetPatch.appearanceCustomThemeActive === false, 'Reset returns to system mode and deactivates custom values.')
assert(!Object.prototype.hasOwnProperty.call(resetPatch, 'appearanceCustomTheme'), 'Reset keeps the saved custom theme available for later use.')
assert(resetPatch.appearanceUiFont === 'bricolage' && resetPatch.appearanceCodeFont === 'jetbrains', 'Reset restores both font defaults.')
assert(resetPatch.appearanceInterfaceScale === 100 && resetPatch.appearanceCodeScale === 100 && resetPatch.appearanceContrastScale === 100 && resetPatch.appearanceAnimationSpeed === 'normal' && resetPatch.appearanceAnimationScale === 100, 'Reset restores display scale and motion defaults.')
assert(hasAppearanceChanges(settings, 'paper-light', 'vercel', 'bricolage'), 'Changed appearance settings expose the reset action.')
assert(!hasAppearanceChanges({ ...settings, appearanceThemeMode: 'system', appearanceCustomThemeActive: false, appearanceUiFont: 'bricolage', appearanceCodeFont: 'jetbrains' }, 'paper-light', 'vercel', 'bricolage'), 'An inactive saved custom theme alone does not expose reset.')
assert(hasAppearanceChanges({ ...settings, appearanceThemeMode: 'system', appearanceCustomThemeActive: false, appearanceUiFont: 'bricolage', appearanceCodeFont: 'jetbrains', appearanceContrastScale: 120 }, 'paper-light', 'vercel', 'bricolage'), 'A customized display scale exposes the reset action.')
assert(hasAppearanceChanges({ ...settings, appearanceThemeMode: 'system', appearanceCustomThemeActive: false, appearanceUiFont: 'bricolage', appearanceCodeFont: 'jetbrains', appearanceAnimationScale: 125 }, 'paper-light', 'vercel', 'bricolage'), 'A customized motion rate exposes the reset action.')

console.log('Appearance settings model: mode pairs, inactive presets, custom save/restore and reset behavior: ok')
