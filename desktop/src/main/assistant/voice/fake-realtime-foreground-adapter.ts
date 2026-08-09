import type {
    HydrationReceipt,
    ProviderCapability,
    RealtimeConnectInput,
    RealtimeDomainEvent,
    RealtimeForegroundAdapter,
    RealtimeHydrationDelta,
    RealtimeHydrationSeed,
    RealtimeProviderCapabilityReport,
    RealtimeSessionHandle,
    RealtimeSpeechItem,
    SessionCloseReceipt,
    SpeechSubmissionReceipt
} from '../../../shared/assistant/contracts'
import type { ForegroundClock } from '../foreground/foreground-route-controller'
import { systemForegroundClock } from '../foreground/foreground-route-controller'
import {
    applyRealtimeHydrationDelta,
    validateRealtimeHydrationDelta,
    validateRealtimeHydrationSeed
} from './realtime-hydration'

interface FakeSession {
    input: RealtimeConnectInput
    handle: RealtimeSessionHandle
    currentWatermarks: RealtimeHydrationSeed['sourceWatermarks']
    closed: boolean
}

export class FakeRealtimeForegroundAdapter implements RealtimeForegroundAdapter {
    private readonly listeners = new Set<(event: RealtimeDomainEvent) => void>()
    private readonly sessions = new Map<string, FakeSession>()
    private sessionOrdinal = 0
    private speechOrdinal = 0
    private connectFailure: Error | null = null
    onBeforeConnectReady: ((input: RealtimeConnectInput) => void | Promise<void>) | null = null

    constructor(private readonly clock: ForegroundClock = systemForegroundClock) {}

    async capabilities(): Promise<RealtimeProviderCapabilityReport> {
        const observedAt = this.clock.now()
        return fakeRealtimeCapabilityReport(observedAt)
    }

    failNextConnect(error = new Error('Injected realtime connection failure.')): void {
        this.connectFailure = error
    }

    async connect(input: RealtimeConnectInput): Promise<RealtimeSessionHandle> {
        validateRealtimeHydrationSeed(input.hydrationSeed)
        if (input.signal.aborted) throw input.signal.reason || new Error('Realtime connection cancelled.')
        if (input.hydrationSeed.conversationId !== input.conversationId) {
            throw new Error('Realtime connection hydration belongs to another conversation.')
        }
        if (!Number.isSafeInteger(input.requestedSessionGeneration) || input.requestedSessionGeneration < 1) {
            throw new Error('Realtime connection requires a positive session generation.')
        }
        if (this.connectFailure) {
            const error = this.connectFailure
            this.connectFailure = null
            throw error
        }
        const ordinal = ++this.sessionOrdinal
        const adapterSessionId = `fake_adapter_session_${input.conversationId}_${ordinal}`
        const providerThreadId = `fake_provider_thread_${input.conversationId}`
        const realtimeSessionId = `fake_realtime_session_${input.conversationId}_${ordinal}`
        const base = {
            adapterSessionId,
            conversationId: input.conversationId,
            realtimeProviderThreadId: providerThreadId,
            realtimeSessionId,
            realtimeSessionGeneration: input.requestedSessionGeneration,
            occurredAt: this.clock.now()
        }
        this.emit({ ...base, type: 'realtime.session.connecting' })
        await this.onBeforeConnectReady?.(input)
        if (input.signal.aborted) throw input.signal.reason || new Error('Realtime connection cancelled.')
        const handle: RealtimeSessionHandle = {
            adapterSessionId,
            realtimeProviderThreadId: providerThreadId,
            realtimeSessionId,
            realtimeSessionGeneration: input.requestedSessionGeneration,
            answerSdp: `v=0\r\no=fake ${ordinal} 1 IN IP4 127.0.0.1\r\n`,
            realtimeVersion: 'fake-v1',
            hydratedPacketId: input.hydrationSeed.packetId,
            hydratedThrough: structuredClone(input.hydrationSeed.sourceWatermarks)
        }
        this.sessions.set(adapterSessionId, {
            input: structuredCloneConnectInput(input),
            handle,
            currentWatermarks: structuredClone(handle.hydratedThrough),
            closed: false
        })
        this.emit({ ...base, type: 'realtime.session.ready', realtimeVersion: handle.realtimeVersion })
        return structuredClone(handle)
    }

    async appendContext(sessionId: string, delta: RealtimeHydrationDelta): Promise<HydrationReceipt> {
        validateRealtimeHydrationDelta(delta)
        const session = this.requireOpenSession(sessionId)
        session.currentWatermarks = applyRealtimeHydrationDelta(
            session.input.hydrationSeed,
            session.currentWatermarks,
            delta
        )
        const appliedAt = this.clock.now()
        const receipt: HydrationReceipt = {
            sessionId,
            deltaId: delta.deltaId,
            appliedThrough: structuredClone(session.currentWatermarks),
            appliedAt
        }
        this.emit({
            ...eventBase(session, appliedAt),
            type: 'realtime.context.applied',
            deltaId: delta.deltaId,
            appliedThrough: structuredClone(session.currentWatermarks)
        })
        return receipt
    }

    async requestSpeech(sessionId: string, item: RealtimeSpeechItem): Promise<SpeechSubmissionReceipt> {
        const session = this.requireOpenSession(sessionId)
        if (item.routeClaim.conversationId !== session.input.conversationId
            || item.routeClaim.realtimeSessionId !== session.handle.realtimeSessionId
            || item.routeClaim.realtimeSessionGeneration !== session.handle.realtimeSessionGeneration) {
            throw new Error('Speech request carries a stale realtime route claim.')
        }
        if (Date.parse(item.expiresAt) <= Date.parse(this.clock.now())) throw new Error('Speech request expired.')
        return {
            sessionId,
            deliveryId: item.deliveryId,
            providerItemId: `fake_speech_item_${++this.speechOrdinal}`,
            submittedAt: this.clock.now()
        }
    }

    async close(sessionId: string, reason: string): Promise<SessionCloseReceipt> {
        const session = this.sessions.get(sessionId)
        const closedAt = this.clock.now()
        if (session && !session.closed) {
            session.closed = true
            this.emit({ ...eventBase(session, closedAt), type: 'realtime.session.closed', reason })
        }
        return { sessionId, reason, closedAt }
    }

    subscribe(listener: (event: RealtimeDomainEvent) => void): () => void {
        this.listeners.add(listener)
        return () => this.listeners.delete(listener)
    }

    emitTranscript(input: {
        sessionId: string
        role: 'user' | 'assistant'
        providerItemId: string
        text: string
        completed?: boolean
    }): void {
        const session = this.sessions.get(input.sessionId)
        if (!session) throw new Error(`Unknown fake realtime session ${input.sessionId}.`)
        const suffix = input.completed ? 'completed' : 'delta'
        const type = `realtime.${input.role}.transcript.${suffix}` as RealtimeDomainEvent['type']
        this.emit({
            ...eventBase(session, this.clock.now()),
            type,
            providerItemId: input.providerItemId,
            ...(input.completed ? { text: input.text } : { delta: input.text })
        } as RealtimeDomainEvent)
    }

    activeSessionIds(): string[] {
        return [...this.sessions.entries()].filter(([, session]) => !session.closed).map(([id]) => id)
    }

    private requireOpenSession(sessionId: string): FakeSession {
        const session = this.sessions.get(sessionId)
        if (!session || session.closed) throw new Error(`Realtime session ${sessionId} is not active.`)
        return session
    }

    private emit(event: RealtimeDomainEvent): void {
        for (const listener of this.listeners) listener(structuredClone(event))
    }
}

export function fakeRealtimeCapabilityReport(observedAt: string): RealtimeProviderCapabilityReport {
    const supported = (method: string): ProviderCapability => ({
        support: 'supported',
        stability: 'stable',
        method,
        evidence: ['interoperability_test'],
        verified_at: observedAt,
        notes: []
    })
    const unsupported = (notes: string): ProviderCapability => ({
        support: 'unsupported',
        stability: 'stable',
        method: null,
        evidence: ['adapter_assertion'],
        verified_at: observedAt,
        notes: [notes]
    })
    const expiresAt = new Date(Date.parse(observedAt) + 60 * 60 * 1000).toISOString()
    return {
        schema_version: 2,
        adapter_id: 'fake_realtime_foreground',
        adapter_version: '1',
        provider_version: 'fake-v1',
        auth_mode: 'local',
        adapter_role: 'realtime_foreground',
        observed_at: observedAt,
        expires_at: expiresAt,
        experimental_adapter: false,
        notes: ['Deterministic test adapter with no network or microphone dependency.'],
        realtime: {
            session: supported('fake.connect'),
            transports: ['webrtc'],
            input_modalities: ['audio', 'text'],
            output_modalities: ['audio', 'text'],
            audio_input: supported('fake.audio.input'),
            audio_output: supported('fake.audio.output'),
            transcript_events: supported('fake.transcript.identity'),
            session_context_seed: supported('fake.connect.hydrationSeed'),
            silent_context_append: supported('fake.appendContext'),
            explicit_speech: supported('fake.requestSpeech'),
            direct_image_input: unsupported('Images route through the private strong primary.'),
            arbitrary_client_tools: unsupported('The fake exposes only provider-neutral adapter methods.'),
            sideband_control: supported('fake.sideband'),
            voice_list: supported('fake.voices'),
            interruption: supported('fake.interruption'),
            response_cancel: supported('fake.cancel'),
            usage_events: supported('fake.usage'),
            session_expiry_signal: supported('fake.expiry'),
            max_session_seconds: 3600,
            known_limits: []
        }
    }
}

function eventBase(session: FakeSession, occurredAt: string) {
    return {
        adapterSessionId: session.handle.adapterSessionId,
        conversationId: session.input.conversationId,
        realtimeProviderThreadId: session.handle.realtimeProviderThreadId,
        realtimeSessionId: session.handle.realtimeSessionId,
        realtimeSessionGeneration: session.handle.realtimeSessionGeneration,
        occurredAt
    }
}

function structuredCloneConnectInput(input: RealtimeConnectInput): RealtimeConnectInput {
    return {
        ...input,
        signal: input.signal,
        hydrationSeed: structuredClone(input.hydrationSeed)
    }
}
