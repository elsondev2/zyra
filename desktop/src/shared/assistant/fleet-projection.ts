import type { FleetSnapshot } from './contracts'

function fleetRecordCount(snapshot: FleetSnapshot): number {
    return Object.keys(snapshot.agents).length + Object.keys(snapshot.workflows).length
}

export function shouldApplyAssistantFleetSnapshot(current: FleetSnapshot | null | undefined, incoming: FleetSnapshot): boolean {
    if (!current) return true
    if (current.rootThreadId !== incoming.rootThreadId || current.fleetId !== incoming.fleetId) {
        return incoming.updatedAt.localeCompare(current.updatedAt) >= 0
    }
    if (incoming.lastAppliedSequence !== current.lastAppliedSequence) {
        return incoming.lastAppliedSequence > current.lastAppliedSequence
    }
    return fleetRecordCount(incoming) >= fleetRecordCount(current)
}
