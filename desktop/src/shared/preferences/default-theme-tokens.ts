/** Shared defaults for surfaces that render before the full selected theme is available. */
export const DEFAULT_DARK_THEME_TOKENS = {
    bg: '#000000', text: '#ededed', textDark: '#cccccc', textDarker: '#9c9c9c',
    textSecondary: '#006efe', textMuted: '#3e3e3e', card: '#0d0d0d', border: '#222222',
    borderSecondary: '#313131', primary: '#006efe', secondary: '#9540d5', accent: '#121212'
}
export const DEFAULT_LIGHT_THEME_TOKENS = {
    bg: '#f7f3ea', text: '#302d28', textDark: '#454038', textDarker: '#625b50',
    textSecondary: '#766d60', textMuted: '#a39989', card: '#fffdf8', border: '#ded7c8',
    borderSecondary: '#c9bfad', primary: '#9a5b31', secondary: '#4e7a68', accent: '#eee6d8'
}
export function defaultThemeTokens(appearance: 'light' | 'dark') {
    return appearance === 'light' ? DEFAULT_LIGHT_THEME_TOKENS : DEFAULT_DARK_THEME_TOKENS
}
export function resolveDefaultAppearance(mode: unknown, systemDark: boolean): 'light' | 'dark' {
    return mode === 'light' || mode === 'dark' ? mode : systemDark ? 'dark' : 'light'
}
