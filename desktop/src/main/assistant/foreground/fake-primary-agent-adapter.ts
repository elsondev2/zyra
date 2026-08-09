import type {
    PrimaryAgentAdapter,
    PrimaryAgentDomainEvent,
    PrimaryDirectTurnHandle,
    PrimaryDirectTurnInput,
    PrimaryPrivateAttemptHandle,
    PrimaryTaskPacket,
    ProviderCapability,
    StrongAgentProviderCapabilityReport
} from '../../../shared/assistant/contracts'
import type { ForegroundClock } from './foreground-route-controller'
import { systemForegroundClock } from './foreground-route-controller'

interface FakePrivateAttempt {
    packet: PrimaryTaskPacket
    handle: PrimaryPrivateAttemptHandle
    cancelled: boolean
}

export class FakePrimaryAgentAdapter implements PrimaryAgentAdapter {
    private readonly listeners = new Set<(event: PrimaryAgentDomainEvent) => void>()
    private readonly attempts = new Map<string, FakePrivateAttempt>()
    private nextTurn = 0
    private nextSession = 0
    directResponse = 'Scripted strong direct response.'

    constructor(private readonly clock: ForegroundClock = systemForegroundClock) {}

    async capabilities(): Promise<StrongAgentProviderCapabilityReport> {
        const observedAt = this.clock.now()
        const supported = (method: string): ProviderCapability => ({
            support: 'supported',
            stability: 'stable',
            method,
            evidence: ['interoperability_test'],
            verified_at: observedAt,
            notes: []
        })
        return {
            schema_version: 2,
            adapter_id: 'fake_primary_agent',
            adapter_version: '1',
            provider_version: 'fake-v1',
            auth_mode: 'local',
            adapter_role: 'strong_agent',
            observed_at: observedAt,
            expires_at: new Date(Date.parse(observedAt) + 60 * 60 * 1000).toISOString(),
            experimental_adapter: false,
            notes: ['Deterministic direct-Chat and private-task test adapter.'],
            primary_agent: {
                private_task_sessions: supported('fake.startPrivate'),
                direct_chat_turns: supported('fake.respondDirect'),
                gateway_controlled_output: supported('fake direct events require a route claim'),
                structured_tool_events: supported('fake private progress'),
                text_input: supported('fake text input'),
                image_input: supported('fake attachment references'),
                tools: supported('fake scripted tools'),
                steering: supported('fake.steer'),
                interrupt: supported('fake.cancel'),
                usage_events: supported('fake usage'),
                checkpoint_resume: supported('fake packet identity'),
                private_output_stream: supported('fake private events')
            }
        }
    }

    async respondDirect(input: PrimaryDirectTurnInput): Promise<PrimaryDirectTurnHandle> {
        if (input.signal.aborted) throw input.signal.reason || new Error('Direct strong turn cancelled.')
        if (input.routeClaim.responseOwner !== 'strong_primary'
            || input.routeClaim.realtimeSessionId !== null
            || input.routeClaim.realtimeSessionGeneration !== null
            || input.routeClaim.conversationId !== input.conversationId) {
            throw new Error('Direct strong output requires an active Chat owner claim.')
        }
        const turnId = `fake_direct_turn_${++this.nextTurn}`
        const handle: PrimaryDirectTurnHandle = {
            turnId,
            providerSessionId: `fake_primary_session_${++this.nextSession}`,
            conversationId: input.conversationId,
            routeClaim: structuredClone(input.routeClaim)
        }
        const event = {
            conversationId: input.conversationId,
            turnId,
            providerItemId: `fake_direct_item_${this.nextTurn}`,
            routeClaim: structuredClone(input.routeClaim),
            text: this.directResponse,
            occurredAt: this.clock.now()
        }
        this.emit({ ...event, type: 'primary.direct.text.delta' })
        this.emit({ ...event, type: 'primary.direct.text.completed' })
        return handle
    }

    async startPrivate(packet: PrimaryTaskPacket, signal: AbortSignal): Promise<PrimaryPrivateAttemptHandle> {
        if (signal.aborted) throw signal.reason || new Error('Private strong attempt cancelled.')
        if (!packet.taskId || !packet.attemptId || !packet.primaryAgentRunId || !packet.verbatimRequest) {
            throw new Error('Private strong execution requires a complete task packet.')
        }
        if (this.attempts.has(packet.attemptId)) {
            const existing = this.attempts.get(packet.attemptId) as FakePrivateAttempt
            if (JSON.stringify(existing.packet) !== JSON.stringify(packet)) {
                throw new Error('Attempt identity was reused with a different task packet.')
            }
            return structuredClone(existing.handle)
        }
        const handle: PrimaryPrivateAttemptHandle = {
            taskId: packet.taskId,
            attemptId: packet.attemptId,
            primaryAgentRunId: packet.primaryAgentRunId,
            providerSessionId: `fake_private_session_${++this.nextSession}`
        }
        this.attempts.set(packet.attemptId, { packet: structuredClone(packet), handle, cancelled: false })
        this.emit({
            type: 'primary.private.attempt.started',
            conversationId: packet.conversationId,
            taskId: packet.taskId,
            attemptId: packet.attemptId,
            primaryAgentRunId: packet.primaryAgentRunId,
            occurredAt: this.clock.now()
        })
        return structuredClone(handle)
    }

    async steer(attemptId: string, contextVersion: number, _instruction: string): Promise<void> {
        const attempt = this.requireAttempt(attemptId)
        this.emit({
            type: 'primary.context.acknowledged',
            conversationId: attempt.packet.conversationId,
            taskId: attempt.packet.taskId,
            attemptId,
            contextVersion,
            occurredAt: this.clock.now()
        })
    }

    async cancel(attemptId: string, _reason: string): Promise<void> {
        this.requireAttempt(attemptId).cancelled = true
    }

    progress(attemptId: string, summary: string, verified = false): void {
        const attempt = this.requireAttempt(attemptId)
        if (attempt.cancelled) throw new Error('A cancelled private attempt cannot emit progress.')
        this.emit({
            type: 'primary.private.progress',
            conversationId: attempt.packet.conversationId,
            taskId: attempt.packet.taskId,
            attemptId,
            primaryAgentRunId: attempt.packet.primaryAgentRunId,
            summary,
            verified,
            occurredAt: this.clock.now()
        })
    }

    complete(attemptId: string): void {
        const attempt = this.requireAttempt(attemptId)
        if (attempt.cancelled) throw new Error('A cancelled private attempt cannot complete.')
        this.emit({
            type: 'primary.private.attempt.completed',
            conversationId: attempt.packet.conversationId,
            taskId: attempt.packet.taskId,
            attemptId,
            primaryAgentRunId: attempt.packet.primaryAgentRunId,
            occurredAt: this.clock.now()
        })
    }

    subscribe(listener: (event: PrimaryAgentDomainEvent) => void): () => void {
        this.listeners.add(listener)
        return () => this.listeners.delete(listener)
    }

    private requireAttempt(attemptId: string): FakePrivateAttempt {
        const attempt = this.attempts.get(attemptId)
        if (!attempt) throw new Error(`Unknown fake primary attempt ${attemptId}.`)
        return attempt
    }

    private emit(event: PrimaryAgentDomainEvent): void {
        for (const listener of this.listeners) listener(structuredClone(event))
    }
}
