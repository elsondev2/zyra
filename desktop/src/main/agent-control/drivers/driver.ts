import type {
    ControlAction,
    ControlObservation,
    ControlTarget,
    ControlWindowCandidate
} from '../../../shared/agent-control/contracts'
import type { RegisteredControlTarget } from '../target-registry'

export type DriverObservationOptions = {
    revision: number
    includeScreenshot: boolean
    signal?: AbortSignal
}

export type DriverActionContext = {
    revision: number
    previousObservation: ControlObservation
    signal?: AbortSignal
}

export interface AgentControlDriver {
    readonly kind: ControlTarget['kind']
    observe(target: RegisteredControlTarget, options: DriverObservationOptions): Promise<ControlObservation>
    act(target: RegisteredControlTarget, action: ControlAction, context: DriverActionContext): Promise<{ changed: boolean }>
    release?(target: RegisteredControlTarget): Promise<void> | void
    emergencyStop?(): Promise<void> | void
    dispose?(): Promise<void> | void
    health?(): { state: 'ready' | 'degraded' | 'disconnected' | 'unavailable'; lastDisconnectReason?: string }
    listWindows?(): Promise<ControlWindowCandidate[]>
    selectWindow?(windowToken: string): Promise<{ trustedIdentity: unknown; target: Omit<Extract<ControlTarget, { kind: 'windows-window' }>, 'targetId'> }>
}
