export interface ZyraMonacoWidgetPalette {
    isLightTheme: boolean
    text: string
    textSecondary: string
    card: string
    background: string
    border: string
    accent: string
}

function withAlpha(color: string, alpha: string, fallback: string): string {
    const normalized = String(color || '').trim()
    return /^#[\da-f]{6}$/i.test(normalized) ? `${normalized}${alpha}` : fallback
}

export function buildZyraMonacoWidgetColors(palette: ZyraMonacoWidgetPalette): Record<string, string> {
    const {
        isLightTheme,
        text,
        textSecondary,
        card,
        background,
        border,
        accent
    } = palette
    const selectedBackground = withAlpha(accent, isLightTheme ? '1f' : '2b', isLightTheme ? '#2563eb1f' : '#60a5fa2b')
    const hoverBackground = withAlpha(accent, isLightTheme ? '0f' : '14', isLightTheme ? '#2563eb0f' : '#60a5fa14')
    const shortcutBackground = withAlpha(textSecondary, isLightTheme ? '14' : '1f', isLightTheme ? '#64748b14' : '#94a3b81f')
    const shortcutBorder = withAlpha(textSecondary, isLightTheme ? '2e' : '38', isLightTheme ? '#64748b2e' : '#94a3b838')
    const shortcutBottomBorder = withAlpha(textSecondary, isLightTheme ? '47' : '52', isLightTheme ? '#64748b47' : '#94a3b852')

    return {
        'menu.background': card,
        'menu.foreground': text,
        'menu.border': border,
        'menu.selectionBackground': selectedBackground,
        'menu.selectionForeground': text,
        'menu.selectionBorder': withAlpha(accent, isLightTheme ? '42' : '55', isLightTheme ? '#2563eb42' : '#60a5fa55'),
        'menu.separatorBackground': border,
        'quickInput.background': card,
        'quickInput.foreground': text,
        'quickInputTitle.background': background,
        'quickInputList.focusBackground': selectedBackground,
        'quickInputList.focusForeground': text,
        'quickInputList.focusIconForeground': accent,
        'pickerGroup.foreground': accent,
        'pickerGroup.border': border,
        'input.background': background,
        'input.foreground': text,
        'input.border': border,
        'focusBorder': accent,
        'list.hoverBackground': hoverBackground,
        'list.focusBackground': selectedBackground,
        'list.focusForeground': text,
        'list.highlightForeground': accent,
        'editorWidget.background': card,
        'editorWidget.foreground': text,
        'editorWidget.border': border,
        'widget.border': border,
        'widget.shadow': isLightTheme ? '#00000029' : '#00000070',
        'keybindingLabel.background': shortcutBackground,
        'keybindingLabel.foreground': textSecondary,
        'keybindingLabel.border': shortcutBorder,
        'keybindingLabel.bottomBorder': shortcutBottomBorder
    }
}
