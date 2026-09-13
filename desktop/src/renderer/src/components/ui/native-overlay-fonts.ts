import { APPEARANCE_FONT_FACES_CHANGED_EVENT, getAppearanceManagedFontFaces } from '@/lib/appearance-font-faces'
import { ZYRA_THEME_CHANGED_EVENT } from '@/lib/theme-events'

/** A loaded FontFace can belong to both FontFaceSets without another font read or decode. */
export function synchronizeNativeOverlayFonts(owner: Document, target: Document): () => void {
    const mirrored = new Set<FontFace>()
    const sync = () => {
        const current = getAppearanceManagedFontFaces(owner)
        for (const face of mirrored) {
            if (!current.has(face)) {
                target.fonts.delete(face)
                mirrored.delete(face)
            }
        }
        for (const face of current) {
            if (!target.fonts.has(face)) {
                target.fonts.add(face)
                mirrored.add(face)
            }
        }
    }
    sync()
    const view = owner.defaultView
    view?.addEventListener(APPEARANCE_FONT_FACES_CHANGED_EVENT, sync)
    view?.addEventListener(ZYRA_THEME_CHANGED_EVENT, sync)
    return () => {
        view?.removeEventListener(APPEARANCE_FONT_FACES_CHANGED_EVENT, sync)
        view?.removeEventListener(ZYRA_THEME_CHANGED_EVENT, sync)
        for (const face of mirrored) target.fonts.delete(face)
        mirrored.clear()
    }
}
