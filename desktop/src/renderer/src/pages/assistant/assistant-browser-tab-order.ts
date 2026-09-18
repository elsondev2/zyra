export function reorderBrowserTabs<T extends { id: string }>(tabs: T[], ids: readonly string[]): T[] {
    if (tabs.length !== ids.length || new Set(ids).size !== tabs.length) return tabs
    const byId = new Map(tabs.map(tab => [tab.id, tab]))
    if (ids.some(id => !byId.has(id)) || tabs.every((tab, index) => tab.id === ids[index])) return tabs
    return ids.map(id => byId.get(id)!)
}
