import { randomUUID } from 'crypto'
import type { ControlTarget } from '../../shared/agent-control/contracts'
import type { AgentControlDriver } from './drivers/driver'
import { AgentControlError } from './control-errors'

export type RegisteredControlTarget = {
    target: ControlTarget
    driver: AgentControlDriver
    trustedIdentity: unknown
    ownerWebContentsId?: number
    registeredAt: string
}

export class TargetRegistry {
    private readonly targets = new Map<string, RegisteredControlTarget>()

    register(input: Omit<RegisteredControlTarget, 'registeredAt'>): RegisteredControlTarget {
        const registered = { ...input, registeredAt: new Date().toISOString() }
        this.targets.set(input.target.targetId, registered)
        return registered
    }

    createTargetId(kind: ControlTarget['kind']): string {
        return `control-target:${kind}:${randomUUID()}`
    }

    get(targetId: string): RegisteredControlTarget {
        const target = this.targets.get(targetId)
        if (!target) throw new AgentControlError('CONTROL_TARGET_NOT_FOUND', 'The control target is no longer available.')
        return target
    }

    findByTrustedIdentity(identity: unknown): RegisteredControlTarget | undefined {
        return [...this.targets.values()].find((entry) => entry.trustedIdentity === identity)
    }

    transferOwner(targetId: string, previousOwnerWebContentsId: number, ownerWebContentsId: number): RegisteredControlTarget {
        const target = this.get(targetId)
        if (target.ownerWebContentsId !== previousOwnerWebContentsId) {
            throw new AgentControlError('CONTROL_SCOPE_DENIED', 'The Browser control target owner changed during transfer.')
        }
        target.ownerWebContentsId = ownerWebContentsId
        return target
    }

    list(kind?: ControlTarget['kind']): RegisteredControlTarget[] {
        return [...this.targets.values()].filter((entry) => !kind || entry.target.kind === kind)
    }

    remove(targetId: string): RegisteredControlTarget | undefined {
        const target = this.targets.get(targetId)
        if (target) this.targets.delete(targetId)
        return target
    }

    clear(): RegisteredControlTarget[] {
        const targets = [...this.targets.values()]
        this.targets.clear()
        return targets
    }
}
