export const ZYRA_THEME_CHANGED_EVENT = 'zyra:theme-changed'

export function dispatchZyraThemeChanged(): void {
    if (typeof window === 'undefined') return
    window.dispatchEvent(new CustomEvent(ZYRA_THEME_CHANGED_EVENT))
}
