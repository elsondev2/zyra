export interface VisibleAction {
    element: HTMLElement
    label: string
    context: string
}

/** Exposes the current screen's named controls to the command palette. */
export function findVisibleActions(root: Document = document): VisibleAction[] {
    const seen = new Set<string>()
    const actions: VisibleAction[] = []
    for (const element of root.querySelectorAll<HTMLElement>('button, a[href], [role="button"]')) {
        if (element.closest('[data-native-overlay-content], [aria-hidden="true"], [inert]')) continue
        if (element.matches(':disabled, [aria-disabled="true"]')) continue
        if (element.getClientRects().length === 0) continue
        const style = root.defaultView?.getComputedStyle(element)
        if (style?.visibility === 'hidden' || style?.display === 'none') continue
        const label = (element.getAttribute('aria-label') || element.getAttribute('title') || element.innerText || '').trim().replace(/\s+/g, ' ')
        if (!label || label.length > 80) continue
        const context = element.closest<HTMLElement>('[aria-label], [data-inspector-workspace], nav, aside')
        const contextLabel = context === element ? '' : (context?.getAttribute('aria-label') || context?.dataset.inspectorWorkspace || context?.tagName.toLowerCase() || '')
        const key = `${contextLabel}\0${label}`
        if (seen.has(key)) continue
        seen.add(key)
        actions.push({ element, label, context: contextLabel })
    }
    return actions.slice(0, 150)
}
