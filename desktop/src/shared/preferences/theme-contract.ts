export const LIGHT_THEME_IDS = [
    'light',
    'paper-light',
    'notion-light',
    'github-light',
    'solarized-light',
    'rose-pine-dawn',
    'catppuccin-latte',
    'everforest-light',
    'nord-snow',
    'tokyo-day',
    'vitesse-light',
    'blossom-light',
    'ocean-mist',
    'lavender-light',
    'gruvbox-light',
    'atom-one-light',
    'bluloco-light',
    'brackets-light',
    'quiet-light',
    'hop-light',
    'netbeans-light',
    'github-light-high-contrast',
    'ayu-light',
    'kanagawa-lotus',
    'material-lighter',
    'light-owl',
    'alabaster-light'
] as const

export const DARK_THEME_IDS = [
    'dark',
    'midnight',
    'purple',
    'green',
    'ocean',
    'forest',
    'slate',
    'charcoal',
    'navy',
    'codex',
    'dp-code',
    'linear',
    'vercel',
    'notion',
    'raycast',
    'solarized',
    'sentry',
    'matrix',
    'temple',
    'oscurange',
    'lobster',
    'absolutely',
    'vscode-plus',
    'material',
    'dracula',
    'nord',
    'gruvbox',
    'one-dark',
    'github-dark',
    'tokyo-night',
    'rose-pine',
    'rose-pine-moon',
    'catppuccin-frappe',
    'catppuccin-macchiato',
    'catppuccin-mocha',
    'ayu-dark',
    'everforest',
    'vesper',
    'monokai',
    'material-palenight',
    'material-ocean',
    'night-owl',
    'moonlight',
    'cobalt2',
    'synthwave'
] as const

export type LightThemeId = typeof LIGHT_THEME_IDS[number]
export type DarkThemeId = typeof DARK_THEME_IDS[number]
export type ThemeId = LightThemeId | DarkThemeId
export type ThemeAppearance = 'light' | 'dark'

const lightThemeIds = new Set<string>(LIGHT_THEME_IDS)
const darkThemeIds = new Set<string>(DARK_THEME_IDS)

export function isLightThemeId(value: unknown): value is LightThemeId {
    return typeof value === 'string' && lightThemeIds.has(value)
}

export function isDarkThemeId(value: unknown): value is DarkThemeId {
    return typeof value === 'string' && darkThemeIds.has(value)
}

export function isThemeId(value: unknown): value is ThemeId {
    return isLightThemeId(value) || isDarkThemeId(value)
}

export function getThemeAppearance(themeId: ThemeId): ThemeAppearance {
    return isLightThemeId(themeId) ? 'light' : 'dark'
}
