import assert from 'node:assert/strict'
import { loadSettings } from '../src/renderer/src/lib/settings'
import { sanitizeDevicePreferenceValue } from '../src/main/setup/device-preferences-service'

const legacy = loadSettings({ settingsSchemaVersion: 4, appearanceThemeMode: 'dark', theme: 'dark', appearanceDarkTheme: 'dark', appearanceLightTheme: 'paper-light' })
assert.equal(legacy.theme, 'vercel')
assert.equal(legacy.appearanceDarkTheme, 'vercel')
assert.equal(legacy.appearanceThemeMode, 'dark')
assert.equal(legacy.appearanceLightTheme, 'paper-light')
const custom = loadSettings({ settingsSchemaVersion: 4, appearanceThemeMode: 'dark', theme: 'dark', appearanceDarkTheme: 'dark', appearanceCustomThemeActive: true,
    appearanceCustomTheme: { baseTheme: 'dark', tokens: { bg: '#112233' }, uiFont: 'hanken', codeFont: 'consolas', accentColor: { name: 'Custom', primary: '#123456', secondary: '#abcdef' } } })
assert.equal(custom.appearanceCustomThemeActive, true)
assert.equal(custom.appearanceCustomTheme?.baseTheme, 'vercel')
assert.equal(custom.appearanceCustomTheme?.tokens.bg, '#112233')
assert.equal(custom.appearanceCustomTheme?.tokens.text, '#ededed')
assert.equal(custom.appearanceUiFont, 'hanken')
assert.equal(custom.appearanceCodeFont, 'consolas')
assert.equal(sanitizeDevicePreferenceValue('appearanceDarkTheme', 'dark'), 'vercel')
assert.equal(sanitizeDevicePreferenceValue('appearanceDarkTheme', 'paper-light'), undefined)
assert.equal(loadSettings({ settingsSchemaVersion: 4, appearanceThemeMode: 'dark', appearanceDarkTheme: 'forest' }).theme, 'forest')
console.log('Retired Dark preset: legacy selection, custom colors, fonts and shared preference migration passed')
