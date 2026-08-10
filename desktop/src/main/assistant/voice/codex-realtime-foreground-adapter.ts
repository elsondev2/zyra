import type {
    AssistantRealtimeVoiceEvent,
    AssistantSendRealtimeVoiceMessageInput,
    HydrationReceipt,
    InstructorOutputModality,
    InstructorRealtimeVoice,
    RealtimeConnectInput,
    RealtimeDomainEvent,
    RealtimeForegroundAdapter,
    RealtimeHydrationDelta,
    RealtimeHydrationItem,
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
    sendMessage(input: AssistantSendRealtimeVoiceMessageInput): Promise<{ mode: 'text-turn' | 'vision-turn' }>
    stop(): Promise<void>
    on(event: 'event', listener: (payload: AssistantRealtimeVoiceEvent) => void): unknown
    off(event: 'event', listener: (payload: AssistantRealtimeVoiceEvent) => void): unknown
}

interface CodexAdapterSession {
    input: RealtimeConnectInput
    handle: RealtimeSessionHandle | null
    currentWatermarks: RealtimeHydrationSeed['sourceWatermarks']
    closed: boolean
    webRtcTurnRoles: Map<string, 'user' | 'assistant'>
    hydrationReplayBudget: Map<string, number>
    suppressedHydrationProviderItemIds: Set<string>
    completedTranscriptProviderItemIds: Set<string>
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
            webRtcTurnRoles: new Map(),
            hydrationReplayBudget: createHydrationReplayBudget(input.hydrationSeed.items),
            suppressedHydrationProviderItemIds: new Set(),
            completedTranscriptProviderItemIds: new Set()
        }
        this.sessions.set(adapterSessionId, session)
        this.currentAdapterSessionId = adapterSessionId
        this.emit({
            ...pendingEventBase(adapterSessionId, input, this.clock.now()),
            type: 'realtime.session.connecting'
        })

        const abortRuntimeStart = () => {
            void this.runtime.stop().catch(() => undefined)
        }
        input.signal.addEventListener('abort', abortRuntimeStart, { once: true })
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
        } finally {
            input.signal.removeEventListener('abort', abortRuntimeStart)
        }
    }

    async appendContext(sessionId: string, delta: RealtimeHydrationDelta): Promise<HydrationReceipt> {
        validateRealtimeHydrationDelta(delta)
        const session = this.requireCurrentSession(sessionId)
        const next = applyRealtimeHydrationDelta(session.input.hydrationSeed, session.currentWatermarks, delta)
        addHydrationReplayBudget(session.hydrationReplayBudget, delta.items)
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

    async appendTransientContext(sessionId: string, text: string): Promise<void> {
        this.requireCurrentSession(sessionId)
        const normalized = text.trim()
        if (!normalized) return
        await this.runtime.appendContext([{ role: 'developer', text: normalized.slice(0, 4000) }])
    }

    async sendComposerMessage(
        sessionId: string,
        input: AssistantSendRealtimeVoiceMessageInput
    ): Promise<{ mode: 'text-turn' | 'vision-turn' }> {
        this.requireCurrentSession(sessionId)
        return this.runtime.sendMessage(input)
    }

    ingestWebRtcEvent(sessionId: string, value: unknown): void {
        const session = this.requireCurrentSession(sessionId)
        const event = normalizeWebRtcTranscriptEvent(value, session.webRtcTurnRoles)
        if (event && session.suppressedHydrationProviderItemIds.has(event.providerItemId)) return
        if (event && session.completedTranscriptProviderItemIds.has(event.providerItemId)) return
        if (event?.kind === 'completed' && consumeHydrationReplay(
            session,
            event.role,
            event.text,
            event.providerItemId
        )) return
        if (!event) {
            if (isWebRtcTranscriptCompletion(value)) {
                this.emit({
                    ...eventBase(session, this.clock.now()),
                    type: 'realtime.session.error',
                    category: 'incompatible_protocol',
                    message: 'Codex completed a realtime turn without the stable item identity and transcript required for canonical delivery.'
                })
            }
            return
        }
        if (event.kind === 'completed') session.completedTranscriptProviderItemIds.add(event.providerItemId)
        this.emit({
            ...eventBase(session, this.clock.now()),
            type: `realtime.${event.role}.transcript.${event.kind}`,
            providerItemId: event.providerItemId,
            ...(event.kind === 'completed' ? { text: event.text } : { delta: event.delta })
        } as RealtimeDomainEvent)
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
            if (event.providerItemId && session.suppressedHydrationProviderItemIds.has(event.providerItemId)) return
            if (event.providerItemId && session.completedTranscriptProviderItemIds.has(event.providerItemId)) return
            if (event.type === 'transcript.done'
                && event.providerItemId
                && consumeHydrationReplay(
                    session,
                    event.role === 'user' ? 'user' : 'assistant',
                    event.text,
                    event.providerItemId
                )) return
            // Flat app-server notifications may omit item identity. The
            // production Desktop bridge supplies the identity-bearing WebRTC
            // event instead; never guess or commit the flat notification.
            if (!event.providerItemId) return
            if (event.type === 'transcript.done') session.completedTranscriptProviderItemIds.add(event.providerItemId)
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
        if (event.type === 'composer.response.delta') return
        if (event.type === 'composer.response.done') {
            if (event.error || !event.text.trim()) {
                this.emit({
                    ...eventBase(session, this.clock.now()),
                    type: 'realtime.session.error',
                    category: 'request_rejected',
                    message: event.error || 'The private typed-input turn ended without a result for Voice to narrate.'
                })
                return
            }
            const adapterSessionId = session.handle.adapterSessionId
            void this.runtime.requestSpeech(event.text.trim()).catch((error) => {
                const current = this.sessions.get(adapterSessionId)
                if (!current || current.closed || current !== session) return
                this.emit({
                    ...eventBase(session, this.clock.now()),
                    type: 'realtime.session.error',
                    category: 'request_rejected',
                    message: error instanceof Error ? error.message : 'Voice could not narrate the typed-input result.'
                })
            })
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

function createHydrationReplayBudget(items: RealtimeHydrationItem[]): Map<string, number> {
    const budget = new Map<string, number>()
    addHydrationReplayBudget(budget, items)
    return budget
}

function addHydrationReplayBudget(budget: Map<string, number>, items: RealtimeHydrationItem[]): void {
    for (const item of items) {
        if (item.role !== 'user' && item.role !== 'assistant') continue
        const key = hydrationReplayKey(item.role, item.text)
        budget.set(key, (budget.get(key) || 0) + 1)
    }
}

function consumeHydrationReplay(
    session: CodexAdapterSession,
    role: 'user' | 'assistant',
    text: string,
    providerItemId: string
): boolean {
    const key = hydrationReplayKey(role, text)
    const remaining = session.hydrationReplayBudget.get(key) || 0
    if (remaining <= 0) return false
    if (remaining === 1) session.hydrationReplayBudget.delete(key)
    else session.hydrationReplayBudget.set(key, remaining - 1)
    session.suppressedHydrationProviderItemIds.add(providerItemId)
    return true
}

function hydrationReplayKey(role: 'user' | 'assistant', text: string): string {
    return `${role}\0${text.replace(/\s+/gu, ' ').trim()}`
}

type NormalizedWebRtcTranscriptEvent =
    | { kind: 'delta'; role: 'user' | 'assistant'; providerItemId: string; delta: string }
    | { kind: 'completed'; role: 'user' | 'assistant'; providerItemId: string; text: string }

export function normalizeWebRtcTranscriptEvent(
    value: unknown,
    turnRoles = new Map<string, 'user' | 'assistant'>()
): NormalizedWebRtcTranscriptEvent | null {
    const payload = asRecord(value)
    const type = asText(payload?.['type'])
    if (!type) return null
    const turn = asRecord(payload?.['turn'])
    const item = asRecord(payload?.['item'])
    const turnId = boundedProviderItemId(
        asText(turn?.['id']) || asText(item?.['id']) || asText(payload?.['turn_id']) || asText(payload?.['item_id'])
    )
    const explicitRole = normalizeTranscriptRole(
        asText(turn?.['role']) || asText(item?.['role']) || asText(payload?.['role'])
    )
    if (turnId && explicitRole) turnRoles.set(turnId, explicitRole)

    if (type === 'turn.created' || type === 'conversation.item.created') return null
    const role = explicitRole
        || (turnId ? turnRoles.get(turnId) : undefined)
        || (type.includes('input_audio_transcription') ? 'user' : type.includes('transcript') ? 'assistant' : undefined)
    if (!turnId || !role) return null

    const delta = typeof payload?.['delta'] === 'string' ? payload['delta'] : ''
    if (type === 'turn.delta'
        || type.endsWith('.transcript.delta')
        || type.endsWith('.audio_transcript.delta')
        || type.endsWith('.input_audio_transcription.delta')) {
        return delta ? { kind: 'delta', role, providerItemId: turnId, delta } : null
    }

    if (type === 'turn.done'
        || type.endsWith('.transcript.done')
        || type.endsWith('.audio_transcript.done')
        || type.endsWith('.input_audio_transcription.completed')) {
        const text = String(turn?.['transcript'] ?? payload?.['transcript'] ?? payload?.['text'] ?? '').trim()
        turnRoles.delete(turnId)
        return text ? { kind: 'completed', role, providerItemId: turnId, text } : null
    }
    return null
}

function isWebRtcTranscriptCompletion(value: unknown): boolean {
    const type = asText(asRecord(value)?.['type']) || ''
    return type === 'turn.done'
        || type.endsWith('.transcript.done')
        || type.endsWith('.audio_transcript.done')
        || type.endsWith('.input_audio_transcription.completed')
}

function asRecord(value: unknown): Record<string, unknown> | null {
    return value && typeof value === 'object' ? value as Record<string, unknown> : null
}

function asText(value: unknown): string | null {
    return typeof value === 'string' && value.trim() ? value.trim() : null
}

function normalizeTranscriptRole(value: string | null): 'user' | 'assistant' | null {
    if (value === 'user') return 'user'
    if (value === 'assistant') return 'assistant'
    return null
}

function boundedProviderItemId(value: string | null): string | null {
    return value && value.length <= 512 ? value : null
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
