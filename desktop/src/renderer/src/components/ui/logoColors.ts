import { getThemeDefinition, type Theme } from '@/lib/settings-theme-catalog'

const MIN_ICON_CONTRAST_RATIO = 2.8

function normalizeHexColor(value?: string | null): string | null {
    if (!value) return null

    const trimmed = value.trim()
    if (!trimmed.startsWith('#')) return null

    const hex = trimmed.slice(1)
    if (hex.length === 3) {
        return `#${hex.split('').map((character) => character + character).join('').toLowerCase()}`
    }

    if (hex.length === 6) {
        return `#${hex.toLowerCase()}`
    }

    return null
}

function hexToRgb(hexColor: string) {
    const normalized = normalizeHexColor(hexColor)
    if (!normalized) return null

    const hex = normalized.slice(1)
    return {
        red: parseInt(hex.slice(0, 2), 16),
        green: parseInt(hex.slice(2, 4), 16),
        blue: parseInt(hex.slice(4, 6), 16)
    }
}

function srgbChannelToLinear(channel: number) {
    const normalized = channel / 255
    if (normalized <= 0.04045) {
        return normalized / 12.92
    }
    return ((normalized + 0.055) / 1.055) ** 2.4
}

function getRelativeLuminance(hexColor: string) {
    const rgb = hexToRgb(hexColor)
    if (!rgb) return 0

    const red = srgbChannelToLinear(rgb.red)
    const green = srgbChannelToLinear(rgb.green)
    const blue = srgbChannelToLinear(rgb.blue)

    return (0.2126 * red) + (0.7152 * green) + (0.0722 * blue)
}

function getContrastRatio(foregroundHex: string, backgroundHex: string) {
    const foreground = getRelativeLuminance(foregroundHex)
    const background = getRelativeLuminance(backgroundHex)
    const brighter = Math.max(foreground, background)
    const darker = Math.min(foreground, background)
    return (brighter + 0.05) / (darker + 0.05)
}

function mixHexColors(baseHex: string, targetHex: string, targetWeight: number) {
    const base = hexToRgb(baseHex)
    const target = hexToRgb(targetHex)
    if (!base || !target) return targetHex

    const weight = Math.max(0, Math.min(1, targetWeight))
    const red = Math.round((base.red * (1 - weight)) + (target.red * weight))
    const green = Math.round((base.green * (1 - weight)) + (target.green * weight))
    const blue = Math.round((base.blue * (1 - weight)) + (target.blue * weight))

    return `#${[red, green, blue]
        .map((channel) => channel.toString(16).padStart(2, '0'))
        .join('')}`
}

export function withAlpha(hexColor: string, alpha: number) {
    const rgb = hexToRgb(hexColor)
    if (!rgb) return hexColor

    const clampedAlpha = Math.max(0, Math.min(1, alpha))
    return `rgba(${rgb.red}, ${rgb.green}, ${rgb.blue}, ${clampedAlpha})`
}

export function resolveReadableLogoColor(color: string | undefined, theme: Theme) {
    const themeDefinition = getThemeDefinition(theme)
    const fallbackHex = themeDefinition.tokens.text
    const normalizedColor = normalizeHexColor(color)
    if (!normalizedColor) return fallbackHex

    const surfaceHex = themeDefinition.tokens.card
    if (getContrastRatio(normalizedColor, surfaceHex) >= MIN_ICON_CONTRAST_RATIO) {
        return normalizedColor
    }

    const preferredTone = themeDefinition.tokens.text
    const adjustedColor = mixHexColors(
        normalizedColor,
        preferredTone,
        theme === 'light' ? 0.72 : 0.62
    )

    if (getContrastRatio(adjustedColor, surfaceHex) >= MIN_ICON_CONTRAST_RATIO) {
        return adjustedColor
    }

    return preferredTone
}

export function buildSimpleIconUrl(iconSlug: string, colorHex: string) {
    const normalizedColor = normalizeHexColor(colorHex)
    const colorSegment = normalizedColor ? normalizedColor.slice(1) : colorHex.replace(/^#/, '')
    return `https://cdn.simpleicons.org/${iconSlug}/${colorSegment}`
}
