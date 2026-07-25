import type { ControlObservation } from '../../shared/agent-control/contracts'
import { AgentControlError } from './control-errors'

export class ObservationStore {
    private readonly observations = new Map<string, ControlObservation>()
    private readonly revisions = new Map<string, number>()

    nextRevision(targetId: string): number {
        const revision = (this.revisions.get(targetId) || 0) + 1
        this.revisions.set(targetId, revision)
        return revision
    }

    set(observation: ControlObservation): void {
        this.revisions.set(observation.targetId, Math.max(observation.revision, this.revisions.get(observation.targetId) || 0))
        this.observations.set(observation.targetId, observation)
    }

    get(targetId: string): ControlObservation | undefined {
        return this.observations.get(targetId)
    }

    currentRevision(targetId: string): number {
        return this.observations.get(targetId)?.revision || this.revisions.get(targetId) || 0
    }

    requireRevision(targetId: string, revision: number): ControlObservation {
        const observation = this.observations.get(targetId)
        const current = this.currentRevision(targetId)
        if (!observation || revision !== current) {
            throw new AgentControlError(
                'CONTROL_STALE_OBSERVATION',
                'The target changed after this observation. Observe it again before acting.',
                { retryable: true, freshRevision: current || undefined }
            )
        }
        return observation
    }

    invalidate(targetId: string): number {
        const revision = this.nextRevision(targetId)
        this.observations.delete(targetId)
        return revision
    }

    invalidateAll(): void {
        const ids = new Set([...this.revisions.keys(), ...this.observations.keys()])
        for (const id of ids) this.invalidate(id)
    }

    remove(targetId: string): void {
        this.invalidate(targetId)
        this.observations.delete(targetId)
    }
}
