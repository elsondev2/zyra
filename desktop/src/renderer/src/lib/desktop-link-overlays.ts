/** Suspend existing portal content while a temporary Browser surface is in front.
 * Keep React/dialog state intact, and restore exact inline styles on return.
 * Portals opened later (for example Browser security warnings) remain visible.
 */
export function suspendLinkOriginOverlays(documents: readonly Document[]): () => void {
    const roots = [...new Set(documents.flatMap(document => [...document.querySelectorAll<HTMLElement>('[data-native-overlay-content]')]))]
    const saved = roots.map(root => ({ root, display: root.style.getPropertyValue('display'), priority: root.style.getPropertyPriority('display'), inert: root.inert }))
    for (const { root } of saved) { root.style.setProperty('display', 'none', 'important'); root.inert = true }
    let restored = false
    return () => {
        if (restored) return
        restored = true
        for (const { root, display, priority, inert } of saved) {
            if (display) root.style.setProperty('display', display, priority)
            else root.style.removeProperty('display')
            root.inert = inert
        }
    }
}
