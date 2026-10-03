import { getContrastRatio, resolveAccentTokens } from '@/lib/settings-theme-semantics'
import { clamp, hexToHsv, hsvToHex } from './zyra-color'

export function suggestAccentCompanion(primary: string, background: string): string {
    const hsv = hexToHsv(primary)
    if (!hsv) return primary
    const darkBackground = getContrastRatio('#ffffff', background) > getContrastRatio('#000000', background)
    const candidate = hsvToHex(
        hsv.h,
        hsv.s < 5 ? 0 : clamp(hsv.s * 0.72, 28, 90),
        darkBackground ? Math.max(hsv.v, 86) : Math.min(hsv.v, 42)
    )
    return resolveAccentTokens(primary, candidate, background).secondary
}
