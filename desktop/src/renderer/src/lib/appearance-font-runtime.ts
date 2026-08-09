import type { DevScopeManagedFont } from '@shared/contracts/font-contracts'
import {
    getAppearanceManagedFontAlias,
    getAppearanceManagedFontId,
    type AppearanceCodeFont,
    type AppearanceUiFont
} from './settings'

const loadedFonts = new Map<string, Promise<FontFace[]>>()

function toUint8Array(value: unknown): Uint8Array {
    if (value instanceof Uint8Array) return value
    if (value instanceof ArrayBuffer) return new Uint8Array(value)
    if (value && typeof value === 'object' && Array.isArray((value as { data?: unknown }).data)) {
        return Uint8Array.from((value as { data: number[] }).data)
    }
    throw new Error('Zyra received invalid managed font data.')
}

export async function listAppearanceManagedFonts(): Promise<DevScopeManagedFont[]> {
    const result = await window.devscope.fonts.listManaged()
    if (!result.success) throw new Error(result.error)
    return result.fonts
}

export async function ensureAppearanceFontLoaded(font: AppearanceUiFont | AppearanceCodeFont): Promise<void> {
    const fontId = getAppearanceManagedFontId(font)
    if (!fontId || typeof FontFace === 'undefined') return
    const existing = loadedFonts.get(fontId)
    if (existing) {
        await existing
        return
    }

    const loading = (async () => {
        const result = await window.devscope.fonts.readManaged(fontId)
        if (!result.success) throw new Error(result.error)
        const family = getAppearanceManagedFontAlias(fontId)
        const faces = await Promise.all(result.faces.map(async (face) => {
            const bytes = toUint8Array(face.data)
            const source = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
            const fontFace = new FontFace(family, source, {
                style: face.style,
                weight: face.weight,
                ...(face.unicodeRange ? { unicodeRange: face.unicodeRange } : {})
            })
            await fontFace.load()
            return fontFace
        }))
        for (const face of faces) document.fonts.add(face)
        return faces
    })().catch((error) => {
        loadedFonts.delete(fontId)
        throw error
    })

    loadedFonts.set(fontId, loading)
    await loading
}

export function forgetAppearanceManagedFont(fontId: string): void {
    const loaded = loadedFonts.get(fontId)
    loadedFonts.delete(fontId)
    if (!loaded) return
    void loaded.then((faces) => {
        for (const face of faces) document.fonts.delete(face)
    }).catch(() => undefined)
}
