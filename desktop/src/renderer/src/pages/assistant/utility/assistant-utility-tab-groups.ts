import type { AssistantUtilityTab } from '@shared/assistant/utility-window'

export type AssistantUtilityTabGroup = {
    id: string
    title: string
    colorIndex: number
    tabs: AssistantUtilityTab[]
}

export function buildAssistantUtilityTabGroups(tabs: AssistantUtilityTab[]): AssistantUtilityTabGroup[] {
    const groups: AssistantUtilityTabGroup[] = []
    const groupById = new Map<string, AssistantUtilityTabGroup>()

    for (const tab of tabs) {
        let group = groupById.get(tab.canonicalChatId)
        if (!group) {
            group = {
                id: tab.canonicalChatId,
                title: tab.chatTitle,
                colorIndex: tab.colorIndex,
                tabs: []
            }
            groupById.set(tab.canonicalChatId, group)
            groups.push(group)
        }
        group.tabs.push(tab)
    }

    return groups
}

export function resolveVisibleAssistantUtilityTabs(
    groups: AssistantUtilityTabGroup[],
    collapsedGroupIds: ReadonlySet<string>
): AssistantUtilityTab[] {
    if (groups.length <= 1) return groups.flatMap((group) => group.tabs)
    return groups.flatMap((group) => collapsedGroupIds.has(group.id) ? [] : group.tabs)
}
