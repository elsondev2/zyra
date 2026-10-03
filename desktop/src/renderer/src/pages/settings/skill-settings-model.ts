import type { AssistantSkillConflict } from '@shared/assistant/contracts'

export type SkillConflictFilter = 'unresolved' | 'resolved' | 'all'

export function skillConflictNeedsReview(conflict: AssistantSkillConflict): boolean {
    return !conflict.preferredSourceId || conflict.preferredSourceId !== conflict.winnerSourceId
}

export function filterSkillConflicts(
    conflicts: AssistantSkillConflict[],
    filter: SkillConflictFilter,
    query: string
): AssistantSkillConflict[] {
    const search = query.trim().toLocaleLowerCase()
    return conflicts.filter((conflict) => {
        if (filter === 'unresolved' && !skillConflictNeedsReview(conflict)) return false
        if (filter === 'resolved' && skillConflictNeedsReview(conflict)) return false
        return !search || [conflict.name, conflict.winnerSourceLabel, ...conflict.sources.map((source) => source.label)]
            .some((value) => value.toLocaleLowerCase().includes(search))
    })
}

export function moveEnabledSkillSource(
    priority: string[],
    enabledSourceIds: string[],
    sourceId: string,
    direction: -1 | 1
): string[] {
    const enabled = new Set(enabledSourceIds)
    const current = priority.indexOf(sourceId)
    if (current < 0 || !enabled.has(sourceId)) return priority
    let adjacent = current + direction
    while (adjacent >= 0 && adjacent < priority.length && !enabled.has(priority[adjacent])) adjacent += direction
    if (adjacent < 0 || adjacent >= priority.length) return priority
    const result = [...priority]
    result[current] = priority[adjacent]
    result[adjacent] = sourceId
    return result
}
