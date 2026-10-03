import { useCallback, useState } from 'react'

type Item = { session: { id: string } }
export function retainSidebarGroups<T extends Item>(groups: T[][], held: string[][] | null): T[][] {
    if (!held) return groups
    const byId = new Map(groups.flat().map(item => [item.session.id, item]))
    const retainedIds = new Set(held.flat())
    return groups.map((group, index) => [
        ...(held[index] || []).flatMap(id => byId.has(id) ? [byId.get(id)!] : []),
        ...group.filter(item => !retainedIds.has(item.session.id))
    ])
}

/** Keep mouse/keyboard targets in place while their status continues updating. */
export function useStableSidebarGroups<T extends Item>(groups: T[][]) {
    const [held, setHeld] = useState<string[][] | null>(null)
    const release = useCallback(() => setHeld(null), [])
    return {
        groups: retainSidebarGroups(groups, held),
        hold: () => setHeld(current => current || groups.map(group => group.map(item => item.session.id))),
        release
    }
}
