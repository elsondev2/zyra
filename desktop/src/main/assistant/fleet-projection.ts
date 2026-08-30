import type { FleetSnapshot } from '../../shared/assistant/contracts'

function fleetRecordCount(snapshot: FleetSnapshot): number {
    return Object.keys(snapshot.agents).length + Object.keys(snapshot.workflows).length
}

export function shouldApplyAssistantFleetSnapshot(
    current: FleetSnapshot | null | undefined,
    incoming: FleetSnapshot
): boolean {
    if (!current) return true
    if (current.rootThreadId !== incoming.rootThreadId || current.fleetId !== incoming.fleetId) {
        return incoming.updatedAt.localeCompare(current.updatedAt) >= 0
    }
    if (incoming.lastAppliedSequence !== current.lastAppliedSequence) {
        return incoming.lastAppliedSequence > current.lastAppliedSequence
    }
    return fleetRecordCount(incoming) >= fleetRecordCount(current)
}

export class FleetProjection {
    private readonly byThreadId = new Map<string, FleetSnapshot>()

    apply(threadId: string, snapshot: FleetSnapshot): FleetSnapshot {
        const current = this.byThreadId.get(threadId) || null
        if (!shouldApplyAssistantFleetSnapshot(current, snapshot)) return current!
        const bounded = JSON.parse(JSON.stringify(snapshot)) as FleetSnapshot
        this.byThreadId.set(threadId, bounded)
        return bounded
    }

    get(threadId: string): FleetSnapshot | null {
        return this.byThreadId.get(threadId) ?? null
    }

    remove(threadId: string): void {
        this.byThreadId.delete(threadId)
    }

    clear(): void {
        this.byThreadId.clear()
    }
}
