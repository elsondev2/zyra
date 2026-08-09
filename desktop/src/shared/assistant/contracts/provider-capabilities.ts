export const PROVIDER_CAPABILITY_SCHEMA_VERSION = 2 as const

export type ProviderCapabilitySupport = 'supported' | 'unsupported' | 'unknown'
export type ProviderCapabilityStability = 'stable' | 'beta' | 'experimental' | 'undocumented' | 'unknown'
export type ProviderCapabilityEvidence =
    | 'public_docs'
    | 'generated_schema'
    | 'interoperability_test'
    | 'adapter_assertion'

export interface ProviderCapability {
    support: ProviderCapabilitySupport
    stability: ProviderCapabilityStability
    method: string | null
    evidence: ProviderCapabilityEvidence[]
    verified_at: string | null
    notes: string[]
}

export interface RealtimeProviderCapabilities {
    session: ProviderCapability
    transports: Array<'webrtc' | 'websocket' | 'sip' | 'other'>
    input_modalities: Array<'audio' | 'text' | 'image'>
    output_modalities: Array<'audio' | 'text'>
    audio_input: ProviderCapability
    audio_output: ProviderCapability
    transcript_events: ProviderCapability
    session_context_seed: ProviderCapability
    silent_context_append: ProviderCapability
    explicit_speech: ProviderCapability
    direct_image_input: ProviderCapability
    arbitrary_client_tools: ProviderCapability
    sideband_control: ProviderCapability
    voice_list: ProviderCapability
    interruption: ProviderCapability
    response_cancel: ProviderCapability
    usage_events: ProviderCapability
    session_expiry_signal: ProviderCapability
    max_session_seconds: number | null
    known_limits: string[]
}

export interface StrongAgentProviderCapabilities {
    private_task_sessions: ProviderCapability
    direct_chat_turns: ProviderCapability
    gateway_controlled_output: ProviderCapability
    structured_tool_events: ProviderCapability
    text_input: ProviderCapability
    image_input: ProviderCapability
    tools: ProviderCapability
    steering: ProviderCapability
    interrupt: ProviderCapability
    usage_events: ProviderCapability
    checkpoint_resume: ProviderCapability
    private_output_stream: ProviderCapability
}

interface ProviderCapabilityReportBase {
    schema_version: typeof PROVIDER_CAPABILITY_SCHEMA_VERSION
    adapter_id: string
    adapter_version: string
    provider_version: string
    auth_mode: 'api_key' | 'subscription_oauth' | 'provider_account' | 'local' | 'other' | 'unknown'
    observed_at: string
    expires_at: string
    experimental_adapter: boolean
    notes: string[]
}

export interface RealtimeProviderCapabilityReport extends ProviderCapabilityReportBase {
    adapter_role: 'realtime_foreground'
    realtime: RealtimeProviderCapabilities
    primary_agent?: never
}

export interface StrongAgentProviderCapabilityReport extends ProviderCapabilityReportBase {
    adapter_role: 'strong_agent'
    primary_agent: StrongAgentProviderCapabilities
    realtime?: never
}

export type ProviderCapabilityReport =
    | RealtimeProviderCapabilityReport
    | StrongAgentProviderCapabilityReport

export const REQUIRED_REALTIME_AUDIO_CAPABILITIES = [
    'session',
    'audio_input',
    'audio_output',
    'transcript_events',
    'session_context_seed',
    'silent_context_append',
    'sideband_control',
    'interruption'
] as const satisfies ReadonlyArray<keyof RealtimeProviderCapabilities>

export interface CapabilityGateResult {
    ok: boolean
    reason: string | null
    missing: string[]
}

export function evaluateRealtimeAudioCapabilities(
    report: RealtimeProviderCapabilityReport,
    now = new Date()
): CapabilityGateResult {
    const observedAt = Date.parse(report.observed_at)
    const expiresAt = Date.parse(report.expires_at)
    if (!Number.isFinite(observedAt) || !Number.isFinite(expiresAt) || observedAt >= expiresAt) {
        return { ok: false, reason: 'The realtime capability report has an invalid validity window.', missing: [] }
    }
    if (observedAt > now.getTime()) {
        return { ok: false, reason: 'The realtime capability report is dated in the future.', missing: [] }
    }
    if (now.getTime() >= expiresAt) {
        return { ok: false, reason: 'The realtime capability report expired.', missing: [] }
    }
    const invalidEvidence: string[] = []
    for (const [name, value] of Object.entries(report.realtime)) {
        if (!isProviderCapability(value)) continue
        if (value.support !== 'unknown' && (value.evidence.length === 0 || !value.verified_at)) {
            invalidEvidence.push(name)
            continue
        }
        if (value.verified_at) {
            const verifiedAt = Date.parse(value.verified_at)
            if (!Number.isFinite(verifiedAt) || verifiedAt > observedAt) invalidEvidence.push(name)
        }
    }
    if (invalidEvidence.length > 0) {
        return {
            ok: false,
            reason: `Realtime capability evidence is invalid: ${invalidEvidence.join(', ')}.`,
            missing: invalidEvidence
        }
    }
    if (!report.realtime.transports.includes('webrtc')) {
        return { ok: false, reason: 'The realtime adapter does not support WebRTC.', missing: ['transports.webrtc'] }
    }
    if (!report.realtime.input_modalities.includes('audio') || !report.realtime.output_modalities.includes('audio')) {
        return { ok: false, reason: 'The realtime adapter does not support the required audio modalities.', missing: ['modalities.audio'] }
    }

    const missing = REQUIRED_REALTIME_AUDIO_CAPABILITIES.filter((name) => {
        const value = report.realtime[name]
        return typeof value !== 'object' || value === null || !('support' in value) || value.support !== 'supported'
    })
    return missing.length > 0
        ? { ok: false, reason: `Required realtime capabilities are unavailable: ${missing.join(', ')}.`, missing: [...missing] }
        : { ok: true, reason: null, missing: [] }
}

function isProviderCapability(value: unknown): value is ProviderCapability {
    return Boolean(value && typeof value === 'object' && 'support' in value && 'evidence' in value)
}
