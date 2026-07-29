export type AssistantTerminalSplitDirection = 'horizontal' | 'vertical'

export type AssistantTerminalGroup = {
    id: string
    terminalIds: string[]
    splitDirection: AssistantTerminalSplitDirection
}

export type AssistantTerminalWorkspaceState = {
    activeTerminalId: string
    activeGroupId: string
    groups: AssistantTerminalGroup[]
}

export const ASSISTANT_TERMINALS_PER_GROUP_LIMIT = 4
const STORAGE_KEY = 'assistant:terminal-workspaces:v1'
const MAX_PERSISTED_WORKSPACES = 24

export function createEmptyAssistantTerminalWorkspaceState(): AssistantTerminalWorkspaceState {
    return { activeTerminalId: '', activeGroupId: '', groups: [] }
}

function normalizeIds(ids: readonly string[]): string[] {
    return [...new Set(ids.map((id) => String(id || '').trim()).filter(Boolean))]
}

function uniqueGroupId(baseId: string, groups: readonly AssistantTerminalGroup[]): string {
    const usedIds = new Set(groups.map((group) => group.id))
    if (!usedIds.has(baseId)) return baseId
    let suffix = 2
    while (usedIds.has(`${baseId}-${suffix}`)) suffix += 1
    return `${baseId}-${suffix}`
}

export function reconcileAssistantTerminalWorkspaceState(
    state: AssistantTerminalWorkspaceState,
    sessionIds: readonly string[]
): AssistantTerminalWorkspaceState {
    const validIds = normalizeIds(sessionIds)
    if (validIds.length === 0) return createEmptyAssistantTerminalWorkspaceState()
    const validIdSet = new Set(validIds)
    const assignedIds = new Set<string>()
    const groups: AssistantTerminalGroup[] = []

    for (const group of state.groups) {
        const terminalIds = normalizeIds(group.terminalIds).filter((terminalId) => {
            if (!validIdSet.has(terminalId) || assignedIds.has(terminalId)) return false
            assignedIds.add(terminalId)
            return true
        })
        if (terminalIds.length === 0) continue
        groups.push({
            id: uniqueGroupId(group.id || `group-${terminalIds[0]}`, groups),
            terminalIds,
            splitDirection: group.splitDirection === 'vertical' ? 'vertical' : 'horizontal'
        })
    }

    for (const terminalId of validIds) {
        if (assignedIds.has(terminalId)) continue
        groups.push({
            id: uniqueGroupId(`group-${terminalId}`, groups),
            terminalIds: [terminalId],
            splitDirection: 'horizontal'
        })
    }

    const activeTerminalId = validIdSet.has(state.activeTerminalId)
        ? state.activeTerminalId
        : validIds[0]
    const activeGroup = groups.find((group) => group.terminalIds.includes(activeTerminalId)) || groups[0]
    return {
        activeTerminalId: activeTerminalId || activeGroup?.terminalIds[0] || '',
        activeGroupId: activeGroup?.id || '',
        groups
    }
}

export function addAssistantTerminalSession(
    state: AssistantTerminalWorkspaceState,
    existingSessionIds: readonly string[],
    terminalId: string,
    mode: 'new' | 'split',
    splitDirection: AssistantTerminalSplitDirection = 'horizontal'
): AssistantTerminalWorkspaceState {
    const normalizedTerminalId = String(terminalId || '').trim()
    if (!normalizedTerminalId) return state
    const base = reconcileAssistantTerminalWorkspaceState(state, existingSessionIds)
    const groups = base.groups.map((group) => ({ ...group, terminalIds: [...group.terminalIds] }))

    if (mode === 'split' && groups.length > 0) {
        const activeGroup = groups.find((group) => group.id === base.activeGroupId)
            || groups.find((group) => group.terminalIds.includes(base.activeTerminalId))
            || groups[0]
        if (activeGroup.terminalIds.length >= ASSISTANT_TERMINALS_PER_GROUP_LIMIT) return base
        activeGroup.terminalIds.push(normalizedTerminalId)
        activeGroup.splitDirection = splitDirection
        return {
            activeTerminalId: normalizedTerminalId,
            activeGroupId: activeGroup.id,
            groups
        }
    }

    const groupId = uniqueGroupId(`group-${normalizedTerminalId}`, groups)
    groups.push({ id: groupId, terminalIds: [normalizedTerminalId], splitDirection: 'horizontal' })
    return { activeTerminalId: normalizedTerminalId, activeGroupId: groupId, groups }
}

export function activateAssistantTerminalSession(
    state: AssistantTerminalWorkspaceState,
    terminalId: string
): AssistantTerminalWorkspaceState {
    const group = state.groups.find((entry) => entry.terminalIds.includes(terminalId))
    if (!group || state.activeTerminalId === terminalId) return state
    return { ...state, activeTerminalId: terminalId, activeGroupId: group.id }
}

export function removeAssistantTerminalSession(
    state: AssistantTerminalWorkspaceState,
    terminalId: string
): AssistantTerminalWorkspaceState {
    const remainingIds = state.groups.flatMap((group) => group.terminalIds).filter((id) => id !== terminalId)
    return reconcileAssistantTerminalWorkspaceState(state, remainingIds)
}

export function loadAssistantTerminalWorkspaceState(workspaceKey: string): AssistantTerminalWorkspaceState {
    if (!workspaceKey || typeof window === 'undefined') return createEmptyAssistantTerminalWorkspaceState()
    try {
        const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') as Record<string, AssistantTerminalWorkspaceState>
        const candidate = stored[workspaceKey]
        if (!candidate || !Array.isArray(candidate.groups)) return createEmptyAssistantTerminalWorkspaceState()
        return reconcileAssistantTerminalWorkspaceState(candidate, candidate.groups.flatMap((group) => group.terminalIds))
    } catch {
        return createEmptyAssistantTerminalWorkspaceState()
    }
}

export function persistAssistantTerminalWorkspaceState(
    workspaceKey: string,
    state: AssistantTerminalWorkspaceState
): void {
    if (!workspaceKey || typeof window === 'undefined') return
    try {
        const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') as Record<string, AssistantTerminalWorkspaceState>
        delete stored[workspaceKey]
        const nextEntries = [...Object.entries(stored), [workspaceKey, state] as const].slice(-MAX_PERSISTED_WORKSPACES)
        localStorage.setItem(STORAGE_KEY, JSON.stringify(Object.fromEntries(nextEntries)))
    } catch {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ [workspaceKey]: state }))
    }
}
