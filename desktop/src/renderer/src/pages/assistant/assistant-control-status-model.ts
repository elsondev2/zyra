import type { ControlCursorState, ControlPrincipal, ControlStateSnapshot, ControlTarget } from '@shared/agent-control/contracts'
import type { AssistantSessionShell } from '@shared/assistant/contracts'

export const controlOwnerThreadId = (principal: ControlPrincipal) => principal.type === 'root' ? principal.threadId : principal.parentThreadId
export const controlPrincipalKey = (principal?: ControlPrincipal) => !principal ? '' : principal.type === 'root'
    ? `root:${principal.threadId}:${principal.turnId}` : `agent:${principal.fleetId}:${principal.agentRunId}`
export const isControlCursorBusy = (cursor: ControlCursorState) => cursor.visible && cursor.phase !== 'idle'

export function buildControlStatus(state: ControlStateSnapshot, sessions: readonly AssistantSessionShell[], cursors: readonly ControlCursorState[] = state.cursors) {
    const owners = new Map<string, { id: string; title: string }>()
    for (const session of sessions) for (const thread of session.threads) {
        const owner = { id: thread.id, title: thread.agentNickname ? `${session.title} · ${thread.agentNickname}` : session.title }
        owners.set(thread.id, owner)
        if (thread.providerThreadId) owners.set(thread.providerThreadId, owner)
    }
    const targets = new Map(state.targets.map(target => [target.targetId, target]))
    const groups = new Map<string, { key: string; kind: ControlTarget['kind']; title: string; grantIds: string[]; usingNow: boolean; surfaces: string[] }>()
    for (const grant of state.grants) {
        if (grant.state !== 'active' || Date.parse(grant.expiresAt) <= Date.now()) continue
        const target = targets.get(grant.targetId)
        if (!target) continue
        const threadId = controlOwnerThreadId(grant.principal)
        const owner = owners.get(threadId)
        const key = `${target.kind}:${owner?.id || threadId}`
        let group = groups.get(key)
        if (!group) {
            group = { key, kind: target.kind, title: owner?.title || `Chat ${threadId.slice(0, 6)}`, grantIds: [], usingNow: false, surfaces: [] }
            groups.set(key, group)
        }
        group.grantIds.push(grant.grantId)
        if (target.title && !group.surfaces.includes(target.title)) group.surfaces.push(target.title)
        group.usingNow ||= cursors.some(cursor => cursor.targetId === target.targetId && isControlCursorBusy(cursor)
            && controlPrincipalKey(cursor.principal) === controlPrincipalKey(grant.principal))
    }
    const chromeHealth = state.health.find(entry => entry.targetKind === 'chrome-tab')?.state
    const chrome = state.pairing.automaticConnectionPaused ? 'Paused'
        : state.pairing.state === 'error' || (state.pairing.state === 'paired' && chromeHealth === 'degraded') ? 'Connection issue'
        : state.pairing.state === 'paired' && chromeHealth !== 'disconnected' && chromeHealth !== 'unavailable' ? 'Connected'
            : 'Not connected'
    return { chrome, groups: [...groups.values()] }
}
