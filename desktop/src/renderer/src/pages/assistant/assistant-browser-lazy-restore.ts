export function browserTabsToMount(
    mounted: ReadonlySet<string>,
    active: boolean,
    activeTabId: string,
    splitTabId: string | null
): Set<string> {
    const next = new Set(mounted)
    if (active) {
        next.add(activeTabId)
        if (splitTabId) next.add(splitTabId)
    }
    return next
}
