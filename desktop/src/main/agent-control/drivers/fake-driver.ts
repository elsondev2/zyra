import { randomUUID } from 'crypto'
import type { ControlAction, ControlElement, ControlObservation, ControlTarget } from '../../../shared/agent-control/contracts'
import type { AgentControlDriver, DriverActionContext, DriverObservationOptions } from './driver'
import type { RegisteredControlTarget } from '../target-registry'

export class FakeControlDriver implements AgentControlDriver {
    readonly kind: ControlTarget['kind']
    private readonly elements = new Map<string, ControlElement>()
    private title = 'Fixture'
    private url = 'http://127.0.0.1/fixture'
    private stopped = false

    constructor(kind: ControlTarget['kind'] = 'zyra-browser') {
        this.kind = kind
        this.elements.set('fixture:button', { elementRef: 'fixture:button', role: 'button', name: 'Continue', actions: ['click'] })
        this.elements.set('fixture:password', { elementRef: 'fixture:password', role: 'password', name: 'Password', value: 'never-return-this', sensitive: true, actions: ['type'] })
    }

    async observe(target: RegisteredControlTarget, options: DriverObservationOptions): Promise<ControlObservation> {
        if (this.stopped) throw new Error('Fake driver stopped.')
        return {
            version: 1,
            observationId: `fixture-observation:${randomUUID()}`,
            revision: options.revision,
            targetId: target.target.targetId,
            capturedAt: new Date().toISOString(),
            targetState: 'ready',
            url: this.kind === 'windows-window' ? undefined : this.url,
            title: this.title,
            origin: this.kind === 'windows-window' ? undefined : new URL(this.url).origin,
            elements: [...this.elements.values()],
            screenshotRef: options.includeScreenshot ? 'control-artifact:fixture' : undefined,
            redactions: []
        }
    }

    async act(_target: RegisteredControlTarget, action: ControlAction, _context: DriverActionContext): Promise<{ changed: boolean }> {
        if (this.stopped) throw new Error('Fake driver stopped.')
        if (action.type === 'navigate') this.url = action.url
        if (action.type === 'click') this.title = 'Clicked'
        if (action.type === 'type') this.title = `Typed ${action.text.length} characters`
        if (action.type === 'wait') {
            const condition = action.condition
            if (condition.type === 'delay') await new Promise((resolve) => setTimeout(resolve, condition.durationMs))
        }
        return { changed: action.type !== 'wait' }
    }

    emergencyStop(): void {
        this.stopped = true
    }

    resume(): void {
        this.stopped = false
    }

    health() {
        return { state: this.stopped ? 'disconnected' as const : 'ready' as const }
    }
}
