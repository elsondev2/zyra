import type { DevScopeManagedFont } from '@shared/contracts/font-contracts'

export const GOOGLE_FONT_FAMILIES = [
    'Inter', 'Roboto', 'Open Sans', 'Lato', 'Montserrat', 'Poppins', 'Source Sans 3', 'Nunito Sans',
    'DM Sans', 'Manrope', 'Work Sans', 'IBM Plex Sans', 'Fira Sans', 'Merriweather', 'Playfair Display',
    'Roboto Slab', 'Space Grotesk', 'Plus Jakarta Sans', 'Outfit', 'Ubuntu', 'Noto Sans', 'Noto Serif',
    'JetBrains Mono', 'Fira Code', 'Source Code Pro', 'Roboto Mono', 'IBM Plex Mono', 'Inconsolata',
    'Space Mono', 'Geist', 'Archivo', 'Barlow', 'Cabin', 'Karla', 'Mulish', 'Rubik', 'Libre Franklin',
    'Crimson Pro', 'Lora', 'Bitter', 'PT Sans', 'PT Serif'
] as const

export type FontManagerSource = 'google' | 'installed' | 'manual'
export type FontTarget = 'ui' | 'code'
export type GoogleFontRow = {
    family: string
    managedFont?: DevScopeManagedFont
    custom: boolean
}

function normalizeQuery(query: string): string {
    return query.trim().toLowerCase()
}

export function buildGoogleFontRows(
    query: string,
    downloadedOnly: boolean,
    managedFonts: readonly DevScopeManagedFont[],
    limit = 40
): GoogleFontRow[] {
    const normalizedQuery = normalizeQuery(query)
    const downloaded = managedFonts
        .filter(font => font.source === 'google')
        .sort((left, right) => left.family.localeCompare(right.family))
    const downloadedByFamily = new Map(downloaded.map(font => [font.family.toLowerCase(), font]))

    if (downloadedOnly) {
        return downloaded
            .filter(font => !normalizedQuery || font.family.toLowerCase().includes(normalizedQuery))
            .slice(0, limit)
            .map(font => ({
                family: font.family,
                managedFont: font,
                custom: !GOOGLE_FONT_FAMILIES.some(family => family.toLowerCase() === font.family.toLowerCase())
            }))
    }

    const matches = GOOGLE_FONT_FAMILIES
        .filter(family => !normalizedQuery || family.toLowerCase().includes(normalizedQuery))
        .map(family => ({
            family,
            managedFont: downloadedByFamily.get(family.toLowerCase()),
            custom: false
        }))
    const customFamily = query.trim()
    const hasExactCatalogMatch = GOOGLE_FONT_FAMILIES.some(family => family.toLowerCase() === customFamily.toLowerCase())
    const rows = customFamily && !hasExactCatalogMatch && matches.length === 0
        ? [{ family: customFamily, managedFont: downloadedByFamily.get(customFamily.toLowerCase()), custom: true }]
        : matches

    return rows.slice(0, limit)
}

export function shouldLoadInstalledFonts(open: boolean, source: FontManagerSource, wasActive: boolean): boolean {
    return open && source === 'installed' && !wasActive
}

export function filterInstalledFonts(fonts: readonly string[], query: string, limit = 100): string[] {
    const normalizedQuery = normalizeQuery(query)
    return fonts
        .filter(family => !normalizedQuery || family.toLowerCase().includes(normalizedQuery))
        .slice(0, limit)
}

export function getImportedFonts(fonts: readonly DevScopeManagedFont[]): DevScopeManagedFont[] {
    return fonts
        .filter(font => font.source === 'imported')
        .sort((left, right) => left.family.localeCompare(right.family))
}

export function formatFontBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function getLocalFontPreviewStack(family: string): string {
    const safeFamily = family.replace(/["\\;{}]/g, '').trim()
    return safeFamily ? `"${safeFamily}"` : 'system-ui'
}

export function getManagedFontPreviewAlias(fontId: string): string {
    const safeId = fontId.replace(/[^a-z0-9-]/gi, '-').slice(0, 96) || 'font'
    return `Zyra Preview ${safeId}`
}
