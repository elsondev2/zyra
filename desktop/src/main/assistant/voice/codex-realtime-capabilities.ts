import type {
    ProviderCapability,
    RealtimeProviderCapabilityReport
} from '../../../shared/assistant/contracts'

export interface ChatGptRealtimeCapabilityEvidence {
    providerVersion: string
    directSignalingVerified: boolean
    transcriptIdentityBridge: boolean
    ownerScopedClientCommands: boolean
}

/** Historical type alias retained for internal test/fixture compatibility. */
export type CodexRealtimeCapabilityEvidence = ChatGptRealtimeCapabilityEvidence

export function createChatGptRealtimeCapabilityReport(
    evidence: ChatGptRealtimeCapabilityEvidence,
    observedAt: string
): RealtimeProviderCapabilityReport {
    const direct = (method: string): ProviderCapability => evidence.directSignalingVerified
        ? capability('supported', method, observedAt, ['public_docs', 'adapter_assertion'])
        : capability('unknown', method, null, [], ['Direct ChatGPT realtime signaling has not been verified.'])
    const ownerCommand = (method: string): ProviderCapability => evidence.ownerScopedClientCommands
        ? capability('supported', method, observedAt, ['interoperability_test', 'adapter_assertion'])
        : capability('unknown', method, null, [], ['The owner-scoped renderer command bridge has not been verified.'])
    const transcriptCapability: ProviderCapability = evidence.transcriptIdentityBridge
        ? capability('supported', 'Frameless WebRTC identity-bearing transcript events', observedAt, ['public_docs', 'interoperability_test'])
        : capability('unknown', null, null, [], ['A verified WebRTC transcript identity bridge is required.'])
    const unsupported = (notes: string): ProviderCapability => capability(
        'unsupported', null, observedAt, ['adapter_assertion'], [notes]
    )
    const unknown = (notes: string): ProviderCapability => capability('unknown', null, null, [], [notes])

    return {
        schema_version: 2,
        // Keep the persisted adapter identifier stable while replacing its runtime.
        adapter_id: 'codex_subscription_realtime_v3',
        adapter_version: '2',
        provider_version: evidence.providerVersion || 'chatgpt-realtime-v3',
        auth_mode: 'subscription_oauth',
        adapter_role: 'realtime_foreground',
        observed_at: observedAt,
        expires_at: new Date(Date.parse(observedAt) + 30 * 60 * 1000).toISOString(),
        experimental_adapter: true,
        notes: [
            'Zyra signals ChatGPT Frameless Bidi WebRTC directly through Pi OAuth.',
            'The owning renderer exclusively controls media and the oai-events data channel.'
        ],
        realtime: {
            session: direct('POST /backend-api/codex/realtime/calls (Frameless Bidi v3)'),
            transports: evidence.directSignalingVerified ? ['webrtc'] : [],
            input_modalities: evidence.directSignalingVerified ? ['audio', 'text'] : [],
            output_modalities: evidence.directSignalingVerified ? ['audio', 'text'] : [],
            audio_input: direct('Browser-owned WebRTC input track'),
            audio_output: direct('Browser-owned WebRTC output track'),
            transcript_events: transcriptCapability,
            session_context_seed: direct('Frameless session.initial_items'),
            silent_context_append: ownerCommand('session.context.append channel=commentary'),
            explicit_speech: ownerCommand('session.context.append channel=speakable'),
            direct_image_input: unsupported('Typed Voice images are explicitly gated because utility text generation cannot truthfully inspect them.'),
            arbitrary_client_tools: unsupported('The realtime foreground does not register arbitrary client tools.'),
            sideband_control: ownerCommand('Owner-scoped oai-events client commands'),
            voice_list: unknown('Voice-list discovery is not included in the direct signaling boundary.'),
            interruption: ownerCommand('session.close + local WebRTC shutdown'),
            response_cancel: unsupported('Zyra closes the local Voice session instead of issuing response-only cancellation.'),
            usage_events: unknown('Realtime usage event mapping is not part of the canonical Voice contract.'),
            session_expiry_signal: unknown('No stable Frameless session-expiry event is relied upon.'),
            max_session_seconds: null,
            known_limits: [
                'V3 initial_items are bounded role-bearing text only.',
                'Typed Voice images are rejected instead of being presented as inspected.',
                'Later context and speech commands are accepted only by the owning renderer and current session generation.'
            ]
        }
    }
}

export const createCodexRealtimeCapabilityReport = createChatGptRealtimeCapabilityReport

function capability(
    support: ProviderCapability['support'],
    method: string | null,
    verifiedAt: string | null,
    evidence: ProviderCapability['evidence'],
    notes: string[] = []
): ProviderCapability {
    return {
        support,
        stability: support === 'unknown' ? 'unknown' : 'experimental',
        method,
        evidence,
        verified_at: verifiedAt,
        notes
    }
}
