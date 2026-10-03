export interface RgbColor {
    r: number
    g: number
    b: number
}

export interface HsvColor {
    h: number
    s: number
    v: number
}

export function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value))
}

export function normalizeHex(value: unknown): string | null {
    if (typeof value !== 'string') return null
    const normalized = value.trim().toLowerCase()
    return /^#[0-9a-f]{6}$/.test(normalized) ? normalized : null
}

export function hexToRgb(hex: string): RgbColor | null {
    const normalized = normalizeHex(hex)
    if (!normalized) return null
    return {
        r: parseInt(normalized.slice(1, 3), 16),
        g: parseInt(normalized.slice(3, 5), 16),
        b: parseInt(normalized.slice(5, 7), 16)
    }
}

function toHexByte(value: number): string {
    return clamp(Math.round(value), 0, 255).toString(16).padStart(2, '0')
}

export function rgbToHex(r: number, g: number, b: number): string {
    return `#${toHexByte(r)}${toHexByte(g)}${toHexByte(b)}`
}

export function rgbToHsv(r: number, g: number, b: number): HsvColor {
    const red = clamp(r, 0, 255) / 255
    const green = clamp(g, 0, 255) / 255
    const blue = clamp(b, 0, 255) / 255
    const max = Math.max(red, green, blue)
    const min = Math.min(red, green, blue)
    const delta = max - min

    let h = 0
    if (delta !== 0) {
        if (max === red) h = 60 * (((green - blue) / delta) % 6)
        else if (max === green) h = 60 * ((blue - red) / delta + 2)
        else h = 60 * ((red - green) / delta + 4)
    }
    if (h < 0) h += 360

    const s = max === 0 ? 0 : (delta / max) * 100
    return { h, s, v: max * 100 }
}

export function hsvToRgb(h: number, s: number, v: number): RgbColor {
    const hue = ((h % 360) + 360) % 360
    const saturation = clamp(s, 0, 100) / 100
    const value = clamp(v, 0, 100) / 100

    const c = value * saturation
    const x = c * (1 - Math.abs(((hue / 60) % 2) - 1))
    const m = value - c

    let red = 0
    let green = 0
    let blue = 0
    if (hue < 60) {
        red = c
        green = x
    } else if (hue < 120) {
        red = x
        green = c
    } else if (hue < 180) {
        green = c
        blue = x
    } else if (hue < 240) {
        green = x
        blue = c
    } else if (hue < 300) {
        red = x
        blue = c
    } else {
        red = c
        blue = x
    }

    return {
        r: Math.round((red + m) * 255),
        g: Math.round((green + m) * 255),
        b: Math.round((blue + m) * 255)
    }
}

export function hexToHsv(hex: string): HsvColor | null {
    const rgb = hexToRgb(hex)
    if (!rgb) return null
    return rgbToHsv(rgb.r, rgb.g, rgb.b)
}

export function hsvToHex(h: number, s: number, v: number): string {
    const rgb = hsvToRgb(h, s, v)
    return rgbToHex(rgb.r, rgb.g, rgb.b)
}
