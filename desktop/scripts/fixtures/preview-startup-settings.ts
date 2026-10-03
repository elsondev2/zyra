// Keep the startup fixture focused on the real editors, not settings bootstrap.
export function useSettings() {
    return { settings: { theme: 'dark', appearanceResolvedMode: 'dark', accentColor: { primary: '#818cf8', secondary: '#6366f1' }, appearanceCodeFont: 'monospace' }, updateSettings: () => undefined }
}
export function getAppearanceCodeFontStack() { return 'monospace' }
