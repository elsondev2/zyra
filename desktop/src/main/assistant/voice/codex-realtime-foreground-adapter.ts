import type {
    AssistantRealtimeVoiceEvent,
    HydrationReceipt,
    InstructorOutputModality,
    InstructorRealtimeVoice,
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
import { evaluateRealtimeAudioCapabilities } from '../../../shared/assistant/contracts'
import type { ForegroundClock } from '../foreground/foreground-route-controller'
import { systemForegroundClock } from '../foreground/foreground-route-controller'
import type { CodexRealtimeCapabilityEvidence } from './codex-realtime-capabilities'
import { createCodexRealtimeCapabilityReport } from './codex-realtime-capabilities'
import {
    applyRealtimeHydrationDelta,
    validateRealtimeHydrationDelta,
    validateRealtimeHydrationSeed
} from './realtime-hydration'

export interface CodexRealtimeTransport {
    start(input: {
        cwd: string
        sdp: string
        instructions?: string
        voice?: InstructorRealtimeVoice
        outputModality?: InstructorOutputModality
        initialItems?: Array<{ role: 'developer' | 'user' | 'assistant'; text: string }>
        clientManagedHandoffs?: boolean
    }): Promise<{
        threadId: string
        sdp: string
        realtimeVersion: string
        realtimeSessionId?: string
    }>
    appendContext(items: Array<{ role: 'developer' | 'user' | 'assistant'; text: string }>): Promise<void>
    requestSpeech(text: string): Promise<void>
    stop(): Promise<void>
    on(event: 'event', listener: (payload: AssistantRealtimeVoiceEvent) => void): unknown
    off(event: 'event', listener: (payload: AssistantRealtimeVoiceEvent) => void): unknown
}

interface CodexAdapterSession {
    input: RealtimeConnectInput
    handle: RealtimeSessionHandle | null
    currentWatermarks: RealtimeHydrationSeed['sourceWatermarks']
    closed: boolean
    missingTranscriptIdentityReported: boolean
}

export class CodexRealtimeForegroundAdapter implements RealtimeForegroundAdapter {
    private readonly listeners = new Set<(event: RealtimeDomainEvent) => void>()
    private readonly sessions = new Map<string, CodexAdapterSession>()
    private readonly runtimeListener: (event: AssistantRealtimeVoiceEvent) => void
    private currentAdapterSessionId: string | null = null
    private nextSessionOrdinal = 0

    constructor(
        private readonly runtime: CodexRealtimeTransport,
        private readonly capabilityEvidence: CodexRealtimeCapabilityEvidence,
        private readonly clock: ForegroundClock = systemForegroundClock
    ) {
        this.runtimeListener = (event) => this.handleRuntimeEvent(event)
        runtime.on('event', this.runtimeListener)
    }

    async capabilities(): Promise<RealtimeProviderCapabilityReport> {
        return createCodexRealtimeCapabilityReport(this.capabilityEvidence, this.clock.now())
    }

    async connect(input: RealtimeConnectInput): Promise<RealtimeSessionHandle> {
        const gate = evaluateRealtimeAudioCapabilities(await this.capabilities(), new Date(this.clock.now()))
        if (!gate.ok) throw new Error(gate.reason || 'Codex realtime Voice is unavailable.')
        validateRealtimeHydrationSeed(input.hydrationSeed)
        if (input.signal.aborted) throw input.signal.reason || new Error('Realtime connection cancelled.')
        if (input.hydrationSeed.conversationId !== input.conversationId) {
            throw new Error('Realtime hydration belongs to another canonical conversation.')
        }
        const adapterSessionId = `codex_adapter_session_${++this.nextSessionOrdinal}`
        const previousSessionId = this.currentAdapterSessionId
        if (previousSessionId) {
            const previous = this.sessions.get(previousSessionId)
            if (previous) previous.closed = true
        }
        const session: CodexAdapterSession = {
            input: cloneConnectInput(input),
            handle: null,
            currentWatermarks: structuredClone(input.hydrationSeed.sourceWatermarks),
            closed: false,
            missingTranscriptIdentityReported: false
        }
        this.sessions.set(adapterSessionId, session)
        this.currentAdapterSessionId = adapterSessionId
        this.emit({
            ...pendingEventBase(adapterSessionId, input, this.clock.now()),
            type: 'realtime.session.connecting'
        })

        try {
            const result = await this.runtime.start({
                cwd: input.projectCwd,
                sdp: input.offerSdp,
                instructions: input.instructions,
                voice: input.voice as InstructorRealtimeVoice,
                outputModality: input.output,
                initialItems: input.hydrationSeed.items.map(({ role, text }) => ({ role, text })),
                clientManagedHandoffs: true
            })
            if (input.signal.aborted) {
                await this.runtime.stop().catch(() => undefined)
                throw input.signal.reason || new Error('Realtime connection cancelled.')
            }
            if (result.realtimeVersion !== 'v3') throw new Error(`Codex negotiated unsupported realtime version ${result.realtimeVersion}.`)
            if (!result.realtimeSessionId) throw new Error('Codex did not return a stable realtime session ID.')
            const handle: RealtimeSessionHandle = {
                adapterSessionId,
                realtimeProviderThreadId: result.threadId,
                realtimeSessionId: result.realtimeSessionId,
                realtimeSessionGeneration: input.requestedSessionGeneration,
                answerSdp: result.sdp,
                realtimeVersion: result.realtimeVersion,
                hydratedPacketId: input.hydrationSeed.packetId,
                hydratedThrough: structuredClone(input.hydrationSeed.sourceWatermarks)
            }
            session.handle = handle
            this.emit({ ...eventBase(session, this.clock.now()), type: 'realtime.session.ready', realtimeVersion: result.realtimeVersion })
            return structuredClone(handle)
        } catch (error) {
            session.closed = true
            if (this.currentAdapterSessionId === adapterSessionId) this.currentAdapterSessionId = null
            throw error
        }
    }

    async appendContext(sessionId: string, delta: RealtimeHydrationDelta): Promise<HydrationReceipt> {
        validateRealtimeHydrationDelta(delta)
        const session = this.requireCurrentSession(sessionId)
        const next = applyRealtimeHydrationDelta(session.input.hydrationSeed, session.currentWatermarks, delta)
        await this.runtime.appendContext(delta.items.map(({ role, text }) => ({ role, text })))
        session.currentWatermarks = next
        const appliedAt = this.clock.now()
        const receipt: HydrationReceipt = {
            sessionId,
            deltaId: delta.deltaId,
            appliedThrough: structuredClone(next),
            appliedAt
        }
        this.emit({
            ...eventBase(session, appliedAt),
            type: 'realtime.context.applied',
            deltaId: delta.deltaId,
            appliedThrough: structuredClone(next)
        })
        return receipt
    }

    async requestSpeech(sessionId: string, item: RealtimeSpeechItem): Promise<SpeechSubmissionReceipt> {
        const session = this.requireCurrentSession(sessionId)
        const handle = session.handle as RealtimeSessionHandle
        if (item.routeClaim.conversationId !== session.input.conversationId
            || item.routeClaim.realtimeSessionId !== handle.realtimeSessionId
            || item.routeClaim.realtimeSessionGeneration !== handle.realtimeSessionGeneration) {
            throw new Error('Codex speech request carries a stale Voice route claim.')
        }
        if (Date.parse(item.expiresAt) <= Date.parse(this.clock.now())) throw new Error('Codex speech request expired.')
        await this.runtime.requestSpeech(item.text)
        return {
            sessionId,
            deliveryId: item.deliveryId,
            providerItemId: null,
            submittedAt: this.clock.now()
        }
    }

    async close(sessionId: string, reason: string): Promise<SessionCloseReceipt> {
        const session = this.sessions.get(sessionId)
        const closedAt = this.clock.now()
        if (session && !session.closed) {
            session.closed = true
            if (this.currentAdapterSessionId === sessionId) {
                this.currentAdapterSessionId = null
                await this.runtime.stop()
            }
            if (session.handle) this.emit({ ...eventBase(session, closedAt), type: 'realtime.session.closed', reason })
        }
        return { sessionId, reason, closedAt }
    }

    subscribe(listener: (event: RealtimeDomainEvent) => void): () => void {
        this.listeners.add(listener)
        return () => this.listeners.delete(listener)
    }

    dispose(): void {
        this.runtime.off('event', this.runtimeListener)
        this.listeners.clear()
        this.sessions.clear()
        this.currentAdapterSessionId = null
    }

    private requireCurrentSession(sessionId: string): CodexAdapterSession {
        const session = this.sessions.get(sessionId)
        if (!session || session.closed || !session.handle || this.currentAdapterSessionId !== sessionId) {
            throw new Error(`Codex realtime session ${sessionId} is not current.`)
        }
        return session
    }

    private handleRuntimeEvent(event: AssistantRealtimeVoiceEvent): void {
        const sessionId = this.currentAdapterSessionId
        const session = sessionId ? this.sessions.get(sessionId) : null
        if (!session || session.closed || !session.handle) return
        if (event.threadId && event.threadId !== session.handle.realtimeProviderThreadId) return
        if (event.type === 'transcript.delta' || event.type === 'transcript.done') {
            if (!event.providerItemId) {
                if (!session.missingTranscriptIdentityReported) {
                    session.missingTranscriptIdentityReported = true
                    this.emit({
                        ...eventBase(session, this.clock.now()),
                        type: 'realtime.session.error',
                        category: 'incompatible_protocol',
                        message: 'Codex transcript event omitted the stable provider item identity required for canonical delivery.'
                    })
                }
                return
            }
            const role = event.role === 'user' ? 'user' : 'assistant'
            const type = `realtime.${role}.transcript.${event.type === 'transcript.done' ? 'completed' : 'delta'}`
            this.emit({
                ...eventBase(session, this.clock.now()),
                type,
                providerItemId: event.providerItemId,
                ...(event.type === 'transcript.done' ? { text: event.text } : { delta: event.delta })
            } as RealtimeDomainEvent)
            return
        }
        if (event.type === 'session.error') {
            this.emit({
                ...eventBase(session, this.clock.now()),
                type: 'realtime.session.error',
                category: normalizeCodexErrorCategory(event.message),
                message: event.message
            })
        } else if (event.type === 'session.closed') {
            session.closed = true
            this.currentAdapterSessionId = null
            this.emit({ ...eventBase(session, this.clock.now()), type: 'realtime.session.closed', reason: event.reason || null })
        }
    }

    private emit(event: RealtimeDomainEvent): void {
        for (const listener of this.listeners) listener(event)
    }
}

function normalizeCodexErrorCategory(message: string): string {
    const normalized = message.toLowerCase()
    if (normalized.includes('auth') || normalized.includes('login')) return 'authentication_required'
    if (normalized.includes('unsupported') || normalized.includes('unavailable')) return 'feature_unavailable'
    if (normalized.includes('limit')) return 'session_limit_reached'
    if (normalized.includes('timeout') || normalized.includes('transport')) return 'transport_failed'
    return 'request_rejected'
}

function pendingEventBase(adapterSessionId: string, input: RealtimeConnectInput, occurredAt: string) {
    return {
        adapterSessionId,
        conversationId: input.conversationId,
        realtimeProviderThreadId: 'pending',
        realtimeSessionId: 'pending',
        realtimeSessionGeneration: input.requestedSessionGeneration,
        occurredAt
    }
}

function eventBase(session: CodexAdapterSession, occurredAt: string) {
    const handle = session.handle as RealtimeSessionHandle
    return {
        adapterSessionId: handle.adapterSessionId,
        conversationId: session.input.conversationId,
        realtimeProviderThreadId: handle.realtimeProviderThreadId,
        realtimeSessionId: handle.realtimeSessionId,
        realtimeSessionGeneration: handle.realtimeSessionGeneration,
        occurredAt
    }
}

function cloneConnectInput(input: RealtimeConnectInput): RealtimeConnectInput {
    return { ...input, signal: input.signal, hydrationSeed: structuredClone(input.hydrationSeed) }
}
