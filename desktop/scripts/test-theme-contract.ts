import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { ACCENT_COLORS } from '../src/renderer/src/lib/settings'
import {
    DARK_THEMES,
    DARK_THEME_IDS,
    LIGHT_THEMES,
    LIGHT_THEME_IDS,
    THEMES,
    getThemeAppearance
} from '../src/renderer/src/lib/settings-theme-catalog'
import {
    getContrastRatio,
    resolveAccentTokens,
    resolveStatusTokens,
    resolveThemeTokens
} from '../src/renderer/src/lib/settings-theme-semantics'

const MINIMUMS = {
    text: 6.98,
    textDark: 5.48,
    textDarker: 4.48,
    textSecondary: 4.48,
    textMuted: 2.98,
    border: 1.33,
    borderSecondary: 1.63,
    accent: 4.48,
    surface: 1.04
}

assert.equal(THEMES.length, 72, 'Theme additions or removals must update the audited theme count')
assert.equal(LIGHT_THEMES.length, 27, 'the light catalog must keep its audited breadth')
assert.equal(DARK_THEMES.length, 45, 'the dark catalog must keep its audited breadth')
assert.equal(new Set(THEMES.map((theme) => theme.id)).size, THEMES.length, 'Theme ids must be unique')
assert.ok(LIGHT_THEMES.every((theme) => getThemeAppearance(theme.id) === 'light'))
assert.ok(DARK_THEMES.every((theme) => getThemeAppearance(theme.id) === 'dark'))
assert.deepEqual(LIGHT_THEMES.map((theme) => theme.id), [...LIGHT_THEME_IDS], 'every shared light id must have one catalog definition')
assert.deepEqual(DARK_THEMES.map((theme) => theme.id), [...DARK_THEME_IDS], 'every shared dark id must have one catalog definition')
assert.equal(new Set(ACCENT_COLORS.map((accent) => accent.name)).size, ACCENT_COLORS.length, 'Accent names must be unique')

for (const theme of THEMES) {
    const tokens = resolveThemeTokens(theme.tokens)
    const ratio = (foreground: string) => getContrastRatio(foreground, tokens.bg)

    assert.ok(ratio(tokens.text) >= MINIMUMS.text, `${theme.id}: primary text contrast`)
    assert.ok(ratio(tokens.textDark) >= MINIMUMS.textDark, `${theme.id}: supporting text contrast`)
    assert.ok(ratio(tokens.textDarker) >= MINIMUMS.textDarker, `${theme.id}: tertiary text contrast`)
    assert.ok(ratio(tokens.textSecondary) >= MINIMUMS.textSecondary, `${theme.id}: secondary text contrast`)
    assert.ok(ratio(tokens.textMuted) >= MINIMUMS.textMuted, `${theme.id}: muted text contrast`)
    assert.ok(ratio(tokens.border) >= MINIMUMS.border, `${theme.id}: border separation`)
    assert.ok(ratio(tokens.borderSecondary) >= MINIMUMS.borderSecondary, `${theme.id}: strong border separation`)
    assert.ok(ratio(tokens.primary) >= MINIMUMS.accent, `${theme.id}: theme primary contrast`)
    assert.ok(ratio(tokens.secondary) >= MINIMUMS.accent, `${theme.id}: theme secondary contrast`)
    assert.ok(getContrastRatio(tokens.card, tokens.bg) >= MINIMUMS.surface, `${theme.id}: card separation`)
    assert.ok(getContrastRatio(tokens.accent, tokens.bg) >= MINIMUMS.surface, `${theme.id}: accent surface separation`)

    assert.ok(ratio(tokens.text) >= ratio(tokens.textDark), `${theme.id}: primary/supporting hierarchy`)
    assert.ok(ratio(tokens.textDark) >= ratio(tokens.textSecondary), `${theme.id}: supporting/secondary hierarchy`)
    assert.ok(ratio(tokens.textSecondary) >= ratio(tokens.textMuted), `${theme.id}: secondary/muted hierarchy`)

    for (const accent of ACCENT_COLORS) {
        const resolvedAccent = resolveAccentTokens(accent.primary, accent.secondary, tokens.bg)
        assert.ok(ratio(resolvedAccent.primary) >= MINIMUMS.accent, `${theme.id}/${accent.name}: primary accent contrast`)
        assert.ok(ratio(resolvedAccent.secondary) >= MINIMUMS.accent, `${theme.id}/${accent.name}: secondary accent contrast`)
        assert.ok(getContrastRatio(resolvedAccent.onPrimary, resolvedAccent.primary) >= 4.48, `${theme.id}/${accent.name}: accent foreground contrast`)
    }

    const status = resolveStatusTokens(tokens.bg, tokens.primary)
    for (const [name, color] of Object.entries({
        danger: status.danger,
        warning: status.warning,
        success: status.success,
        info: status.info
    })) {
        assert.ok(ratio(color) >= MINIMUMS.textSecondary, `${theme.id}: ${name} status contrast`)
    }
    assert.ok(getContrastRatio(status.onDanger, status.danger) >= MINIMUMS.textSecondary, `${theme.id}: danger foreground contrast`)
}

const themeCss = readFileSync(resolve(import.meta.dir, '../src/renderer/src/styles/theme-tokens.css'), 'utf8')
assert.match(themeCss, /--surface-topbar:\s*var\(--surface-chrome\)/, 'App top bar must use shared chrome')
assert.match(themeCss, /--surface-sidebar:\s*var\(--surface-chrome\)/, 'App sidebar must use shared chrome')
assert.match(themeCss, /--settings-topbar:\s*var\(--surface-topbar\)/, 'Settings top bar must match the chat top-bar surface')
assert.match(themeCss, /--settings-sidebar:\s*var\(--surface-sidebar\)/, 'Settings sidebar must match the chat sidebar surface')

const tailwindConfig = readFileSync(resolve(import.meta.dir, '../tailwind.config.js'), 'utf8')
for (const variable of [
    '--theme-foreground-rgb',
    '--theme-background-rgb',
    '--accent-primary-rgb',
    '--accent-secondary-rgb',
    '--status-success-rgb',
    '--status-warning-rgb',
    '--status-danger-rgb'
]) {
    assert.ok(tailwindConfig.includes(variable), `Tailwind compatibility colors must use ${variable}`)
}
assert.match(tailwindConfig, /'media-white':\s*'rgb\(255 255 255/, 'Media overlays must retain content-relative white')
assert.match(tailwindConfig, /'media-black':\s*'rgb\(0 0 0/, 'Media overlays must retain content-relative black')

const settingsSource = readFileSync(resolve(import.meta.dir, '../src/renderer/src/lib/settings.tsx'), 'utf8')
for (const variable of [
    '--accent-primary-rgb',
    '--accent-secondary-rgb',
    '--status-success-rgb',
    '--status-warning-rgb',
    '--status-danger-rgb',
    '--status-danger-contrast'
]) {
    assert.ok(settingsSource.includes(`setProperty('${variable}'`), `Runtime theme application must set ${variable}`)
}

console.log(`theme contract: ok (${THEMES.length} themes × ${ACCENT_COLORS.length} accents)`)
