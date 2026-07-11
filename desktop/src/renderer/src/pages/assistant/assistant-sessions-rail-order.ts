import type { SessionProjectGroup } from './assistant-sessions-rail-utils'
import { getSessionLastActivityAt, getSortableTimestamp } from './assistant-sessions-rail-utils'
import type { AssistantRailSortMode } from './useAssistantPageSidebarState'

const STORAGE_KEY = 'devscope-assistant-sessions-rail-order-v1'

export type AssistantSessionsRailOrder = {
    projectOrder: string[]
    sessionOrderByProject: Record<string, string[]>
}

export type AssistantSessionsRailDragState =
    | { kind: 'project'; projectKey: string }
    | { kind: 'session'; projectKey: string; sessionId: string }

const DEFAULT_ORDER: AssistantSessionsRailOrder = {
    projectOrder: [],
    sessionOrderByProject: {}
}

function isStringArray(value: unknown): value is string[] {
    return Array.isArray(value) && value.every((entry) => typeof entry === 'string')
}

function unique(values: string[]): string[] {
    const seen = new Set<string>()
    const next: string[] = []
    for (const value of values) {
        if (seen.has(value)) continue
        seen.add(value)
        next.push(value)
    }
    return next
}

export function loadAssistantSessionsRailOrder(): AssistantSessionsRailOrder {
    if (typeof window === 'undefined') return DEFAULT_ORDER
    try {
        const stored = window.localStorage.getItem(STORAGE_KEY)
        if (!stored) return DEFAULT_ORDER
        const parsed = JSON.parse(stored) as Partial<AssistantSessionsRailOrder>
        return {
            projectOrder: isStringArray(parsed.projectOrder) ? unique(parsed.projectOrder) : [],
            sessionOrderByProject: typeof parsed.sessionOrderByProject === 'object' && parsed.sessionOrderByProject !== null
                ? Object.fromEntries(
                    Object.entries(parsed.sessionOrderByProject).flatMap(([projectKey, sessionIds]) => {
                        if (!isStringArray(sessionIds)) return []
                        return [[projectKey, unique(sessionIds)]]
                    })
                )
                : {}
        }
    } catch {
        return DEFAULT_ORDER
    }
}

export function saveAssistantSessionsRailOrder(order: AssistantSessionsRailOrder): void {
    if (typeof window === 'undefined') return
    try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(order))
    } catch {
        // Ignore storage quota and privacy-mode failures.
    }
}

function compareByOrderAndSortMode<T extends { id: string; createdAt: string; updatedAt?: string }>(
    left: T,
    right: T,
    orderIndex: Map<string, number>,
    sortMode: AssistantRailSortMode
): number {
    const leftIndex = orderIndex.get(left.id)
    const rightIndex = orderIndex.get(right.id)
    const resolveUpdatedAt = (value: T) => {
        if ('threads' in value && Array.isArray(value.threads)) {
            return getSessionLastActivityAt(value as T & Parameters<typeof getSessionLastActivityAt>[0])
        }
        return value.updatedAt || value.createdAt
    }

    if (leftIndex == null && rightIndex == null) {
        if (sortMode === 'updated') {
            const updatedDelta = getSortableTimestamp(resolveUpdatedAt(right)) - getSortableTimestamp(resolveUpdatedAt(left))
            if (updatedDelta !== 0) return updatedDelta
        }
        const createdDelta = getSortableTimestamp(right.createdAt) - getSortableTimestamp(left.createdAt)
        if (createdDelta !== 0) return createdDelta
        return left.id.localeCompare(right.id)
    }

    if (leftIndex == null) return -1
    if (rightIndex == null) return 1

    if (leftIndex != null && rightIndex != null && leftIndex !== rightIndex) {
        return leftIndex - rightIndex
    }

    if (sortMode === 'updated') {
        const updatedDelta = getSortableTimestamp(resolveUpdatedAt(right)) - getSortableTimestamp(resolveUpdatedAt(left))
        if (updatedDelta !== 0) return updatedDelta
    }
    const createdDelta = getSortableTimestamp(right.createdAt) - getSortableTimestamp(left.createdAt)
    if (createdDelta !== 0) return createdDelta
    return left.id.localeCompare(right.id)
}

function compareGroupsByOrderAndSortMode(
    left: SessionProjectGroup,
    right: SessionProjectGroup,
    orderIndex: Map<string, number>,
    sortMode: AssistantRailSortMode
): number {
    const leftIndex = orderIndex.get(left.key)
    const rightIndex = orderIndex.get(right.key)
    if (leftIndex != null && rightIndex != null && leftIndex !== rightIndex) {
        return leftIndex - rightIndex
    }
    if (leftIndex != null) return -1
    if (rightIndex != null) return 1

    if (sortMode === 'updated') {
        const updatedDelta = getSortableTimestamp(right.updatedAt) - getSortableTimestamp(left.updatedAt)
        if (updatedDelta !== 0) return updatedDelta
    }
    const createdDelta = getSortableTimestamp(right.createdAt) - getSortableTimestamp(left.createdAt)
    if (createdDelta !== 0) return createdDelta
    return left.label.localeCompare(right.label) || left.key.localeCompare(right.key)
}

export function orderAssistantSessionsGroups(
    groups: SessionProjectGroup[],
    order: AssistantSessionsRailOrder,
    sortMode: AssistantRailSortMode = 'updated'
): SessionProjectGroup[] {
    const projectOrderIndex = new Map(order.projectOrder.map((projectKey, index) => [projectKey, index]))

    return [...groups]
        .map((group) => {
            const sessionOrderIndex = new Map((order.sessionOrderByProject[group.key] || []).map((sessionId, index) => [sessionId, index]))
            return {
                ...group,
                sessions: [...group.sessions].sort((left, right) => compareByOrderAndSortMode(
                    { ...left, updatedAt: getSessionLastActivityAt(left) },
                    { ...right, updatedAt: getSessionLastActivityAt(right) },
                    sessionOrderIndex,
                    sortMode
                ))
            }
        })
        .sort((left, right) => compareGroupsByOrderAndSortMode(left, right, projectOrderIndex, sortMode))
}

export function orderAssistantSessionsList<T extends { id: string; createdAt: string; updatedAt?: string }>(
    sessions: T[],
    orderedSessionIds: string[],
    sortMode: AssistantRailSortMode = 'updated'
): T[] {
    const sessionOrderIndex = new Map(orderedSessionIds.map((sessionId, index) => [sessionId, index]))
    return [...sessions].sort((left, right) => compareByOrderAndSortMode(left, right, sessionOrderIndex, sortMode))
}

export function moveArrayItem(
    values: string[],
    itemId: string,
    placement: 'start' | 'before' | 'after' | 'end',
    targetId?: string | null
): string[] {
    if (targetId && targetId === itemId && (placement === 'before' || placement === 'after')) {
        return unique(values)
    }
    const next = values.filter((value) => value !== itemId)

    if (placement === 'start') {
        next.unshift(itemId)
        return unique(next)
    }

    if (placement === 'end' || !targetId) {
        next.push(itemId)
        return unique(next)
    }

    const targetIndex = next.indexOf(targetId)
    const insertIndex = targetIndex === -1
        ? next.length
        : placement === 'after'
            ? targetIndex + 1
            : targetIndex
    next.splice(insertIndex, 0, itemId)
    return unique(next)
}

export function getGroupSessionIds(group: SessionProjectGroup): string[] {
    return group.sessions.map((session) => session.id)
}

export function getProjectIds(groups: SessionProjectGroup[]): string[] {
    return groups.map((group) => group.key)
}

export function normalizeRailOrder(order: AssistantSessionsRailOrder): AssistantSessionsRailOrder {
    return {
        projectOrder: unique(order.projectOrder),
        sessionOrderByProject: Object.fromEntries(
            Object.entries(order.sessionOrderByProject).map(([projectKey, sessionIds]) => [projectKey, unique(sessionIds)])
        )
    }
}
