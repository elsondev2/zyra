/** Programmatic appearance faces are shared with same-origin UI documents, not reloaded. */
export const APPEARANCE_FONT_FACES_CHANGED_EVENT = 'zyra:appearance-font-faces-changed'

const managedFaces = new WeakMap<Document, Set<FontFace>>()
const emptyFaces: ReadonlySet<FontFace> = new Set()

export function getAppearanceManagedFontFaces(owner: Document): ReadonlySet<FontFace> {
    return managedFaces.get(owner) ?? emptyFaces
}

export function addAppearanceManagedFontFaces(owner: Document, faces: readonly FontFace[]): void {
    let current = managedFaces.get(owner)
    if (!current) managedFaces.set(owner, current = new Set())
    for (const face of faces) {
        owner.fonts.add(face)
        current.add(face)
    }
    owner.defaultView?.dispatchEvent(new Event(APPEARANCE_FONT_FACES_CHANGED_EVENT))
}

export function removeAppearanceManagedFontFaces(owner: Document, faces: readonly FontFace[]): void {
    const current = managedFaces.get(owner)
    for (const face of faces) {
        owner.fonts.delete(face)
        current?.delete(face)
    }
    if (!current?.size) managedFaces.delete(owner)
    owner.defaultView?.dispatchEvent(new Event(APPEARANCE_FONT_FACES_CHANGED_EVENT))
}
