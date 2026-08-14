import type { ThemeTokens } from './settings-theme-catalog'

type Rgb = { r: number; g: number; b: number }

export interface ResolvedAccentTokens {
    primary: string
    secondary: string
    onPrimary: string
}

export interface ResolvedStatusTokens {
    danger: string
    warning: string
    success: string
    info: string
    onDanger: string
}

const WHITE = '#ffffff'
const BLACK = '#000000'
const TEXT_CONTRAST = 7
const SUPPORTING_TEXT_CONTRAST = 5.5
const SECONDARY_TEXT_CONTRAST = 4.5
const MUTED_TEXT_CONTRAST = 3
const ACCENT_CONTRAST = 4.5

function parseHex(value: string): Rgb {
    const normalized = value.trim().replace(/^#/, '')
    const expanded = normalized.length === 3
        ? normalized.split('').map((character) => `${character}${character}`).join('')
        : normalized
    if (!/^[0-9a-f]{6}$/i.test(expanded)) {
        throw new Error(`Unsupported theme color: ${value}`)
    }
    const numeric = Number.parseInt(expanded, 16)
    return {
        r: (numeric >> 16) & 255,
        g: (numeric >> 8) & 255,
        b: numeric & 255
    }
}

function toHex({ r, g, b }: Rgb): string {
    return `#${[r, g, b]
        .map((channel) => Math.max(0, Math.min(255, Math.round(channel))).toString(16).padStart(2, '0'))
        .join('')}`
}

function mixColors(first: string, second: string, firstWeight: number): string {
    const left = parseHex(first)
    const right = parseHex(second)
    const weight = Math.max(0, Math.min(1, firstWeight))
    return toHex({
        r: left.r * weight + right.r * (1 - weight),
        g: left.g * weight + right.g * (1 - weight),
        b: left.b * weight + right.b * (1 - weight)
    })
}

function relativeLuminance(value: string): number {
    const color = parseHex(value)
    const linearize = (channel: number) => {
        const normalized = channel / 255
        return normalized <= 0.04045
            ? normalized / 12.92
            : ((normalized + 0.055) / 1.055) ** 2.4
    }
    return 0.2126 * linearize(color.r) + 0.7152 * linearize(color.g) + 0.0722 * linearize(color.b)
}

export function toRgbChannels(value: string): string {
    const color = parseHex(value)
    return `${color.r} ${color.g} ${color.b}`
}

export function getContrastRatio(foreground: string, background: string): number {
    const foregroundLuminance = relativeLuminance(foreground)
    const backgroundLuminance = relativeLuminance(background)
    const light = Math.max(foregroundLuminance, backgroundLuminance)
    const dark = Math.min(foregroundLuminance, backgroundLuminance)
    return (light + 0.05) / (dark + 0.05)
}

function ensureContrast(color: string, background: string, minimum: number): string {
    if (getContrastRatio(color, background) >= minimum) return color

    const target = getContrastRatio(WHITE, background) >= getContrastRatio(BLACK, background) ? WHITE : BLACK
    let insufficientWeight = 0
    let sufficientWeight = 1
    for (let iteration = 0; iteration < 24; iteration += 1) {
        const targetWeight = (insufficientWeight + sufficientWeight) / 2
        const candidate = mixColors(target, color, targetWeight)
        if (getContrastRatio(candidate, background) >= minimum) {
            sufficientWeight = targetWeight
        } else {
            insufficientWeight = targetWeight
        }
    }
    return mixColors(target, color, sufficientWeight)
}

function toneAtContrast(foreground: string, background: string, targetContrast: number): string {
    const accessibleForeground = ensureContrast(foreground, background, targetContrast)
    let insufficientWeight = 0
    let sufficientWeight = 1
    for (let iteration = 0; iteration < 24; iteration += 1) {
        const foregroundWeight = (insufficientWeight + sufficientWeight) / 2
        const candidate = mixColors(accessibleForeground, background, foregroundWeight)
        if (getContrastRatio(candidate, background) >= targetContrast) {
            sufficientWeight = foregroundWeight
        } else {
            insufficientWeight = foregroundWeight
        }
    }
    return mixColors(accessibleForeground, background, sufficientWeight)
}

function ensureSurfaceSeparation(surface: string, background: string, foreground: string, minimum: number): string {
    if (getContrastRatio(surface, background) >= minimum) return surface
    let insufficientWeight = 0
    let sufficientWeight = 1
    for (let iteration = 0; iteration < 24; iteration += 1) {
        const foregroundWeight = (insufficientWeight + sufficientWeight) / 2
        const candidate = mixColors(foreground, surface, foregroundWeight)
        if (getContrastRatio(candidate, background) >= minimum) {
            sufficientWeight = foregroundWeight
        } else {
            insufficientWeight = foregroundWeight
        }
    }
    return mixColors(foreground, surface, sufficientWeight)
}

export function resolveThemeTokens(tokens: ThemeTokens): ThemeTokens {
    const background = tokens.bg
    const text = ensureContrast(tokens.text, background, TEXT_CONTRAST)
    const card = ensureSurfaceSeparation(tokens.card, background, text, 1.06)
    return {
        bg: background,
        text,
        textDark: toneAtContrast(text, background, SUPPORTING_TEXT_CONTRAST),
        textDarker: toneAtContrast(text, background, SECONDARY_TEXT_CONTRAST),
        textSecondary: toneAtContrast(text, background, SECONDARY_TEXT_CONTRAST),
        textMuted: toneAtContrast(text, background, MUTED_TEXT_CONTRAST),
        card,
        border: ensureContrast(tokens.border, background, 1.35),
        borderSecondary: ensureContrast(tokens.borderSecondary, background, 1.65),
        primary: ensureContrast(tokens.primary, background, ACCENT_CONTRAST),
        secondary: ensureContrast(tokens.secondary, background, ACCENT_CONTRAST),
        accent: ensureSurfaceSeparation(tokens.accent, background, text, 1.08)
    }
}

export function resolveAccentTokens(primary: string, secondary: string, background: string): ResolvedAccentTokens {
    const resolvedPrimary = ensureContrast(primary, background, ACCENT_CONTRAST)
    const resolvedSecondary = ensureContrast(secondary, background, ACCENT_CONTRAST)
    const onPrimary = getContrastRatio(WHITE, resolvedPrimary) >= getContrastRatio(BLACK, resolvedPrimary) ? WHITE : BLACK
    return {
        primary: resolvedPrimary,
        secondary: resolvedSecondary,
        onPrimary
    }
}

export function resolveStatusTokens(background: string, infoSource: string): ResolvedStatusTokens {
    const danger = ensureContrast('#ef4444', background, SECONDARY_TEXT_CONTRAST)
    return {
        danger,
        warning: ensureContrast('#d97706', background, SECONDARY_TEXT_CONTRAST),
        success: ensureContrast('#16a34a', background, SECONDARY_TEXT_CONTRAST),
        info: ensureContrast(infoSource, background, SECONDARY_TEXT_CONTRAST),
        onDanger: getContrastRatio(WHITE, danger) >= getContrastRatio(BLACK, danger) ? WHITE : BLACK
    }
}
