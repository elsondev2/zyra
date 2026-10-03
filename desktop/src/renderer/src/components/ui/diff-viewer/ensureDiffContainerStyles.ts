let baseDiffStyles: string | null = null
const overlaySheets = new WeakMap<Document, CSSStyleSheet>()

function getBaseDiffStyles(): string | null {
    if (baseDiffStyles !== null) return baseDiffStyles

    // @pierre/diffs registers its styled custom element in the app document.
    // A native overlay is another document, so its portal-created element has
    // a shadow root but never receives that registration's stylesheet.
    const source = document.createElement('diffs-container')
    const sheet = source.shadowRoot?.adoptedStyleSheets[0]
    if (!sheet) return null

    baseDiffStyles = [...sheet.cssRules].map(rule => rule.cssText).join('\n')
    return baseDiffStyles
}

export function ensureDiffContainerStyles(container: ParentNode | null): void {
    if (!container) return

    for (const host of container.querySelectorAll<HTMLElement>('diffs-container')) {
        const ownerDocument = host.ownerDocument
        if (ownerDocument === document || ownerDocument.defaultView?.customElements.get('diffs-container')) continue

        const shadowRoot = host.shadowRoot
        const ownerWindow = ownerDocument.defaultView as (Window & typeof globalThis) | null
        if (!shadowRoot || !ownerWindow) continue

        let sheet = overlaySheets.get(ownerDocument)
        if (!sheet) {
            const styles = getBaseDiffStyles()
            if (!styles) continue
            sheet = new ownerWindow.CSSStyleSheet()
            sheet.replaceSync(styles)
            overlaySheets.set(ownerDocument, sheet)
        }

        if (!shadowRoot.adoptedStyleSheets.includes(sheet)) {
            shadowRoot.adoptedStyleSheets = [...shadowRoot.adoptedStyleSheets, sheet]
        }
    }
}
