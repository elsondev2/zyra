import type {
    ProviderCapability,
    RealtimeProviderCapabilityReport
} from '../../../shared/assistant/contracts'

export interface CodexRealtimeCapabilityEvidence {
    providerVersion: string
    generatedSchemaVerified: boolean
    transcriptIdentityBridge: boolean
}

export function createCodexRealtimeCapabilityReport(
    evidence: CodexRealtimeCapabilityEvidence,
    observedAt: string
): RealtimeProviderCapabilityReport {
    const schemaCapability = (method: string): ProviderCapability => evidence.generatedSchemaVerified
        ? capability('supported', method, observedAt, ['generated_schema', 'adapter_assertion'])
        : capability('unknown', method, null, [], ['The installed Codex schema has not been verified.'])
    const documentedCapability = (method: string): ProviderCapability => evidence.generatedSchemaVerified
        ? capability('supported', method, observedAt, ['public_docs', 'interoperability_test'])
        : capability('unknown', method, null, [], ['The installed Codex realtime schema has not been verified.'])
    const transcriptCapability: ProviderCapability = evidence.generatedSchemaVerified && evidence.transcriptIdentityBridge
        ? capability('supported', 'WebRTC data-channel item identity + thread/realtime/transcript/*', observedAt, ['generated_schema', 'interoperability_test'])
        : capability(
            'unknown',
            null,
            null,
            [],
            ['Flat app-server transcript notifications do not carry item IDs; a verified WebRTC identity bridge is required.']
        )
    const unsupported = (notes: string): ProviderCapability => capability(
        'unsupported', null, observedAt, ['adapter_assertion'], [notes]
    )
    const unknown = (notes: string): ProviderCapability => capability('unknown', null, null, [], [notes])

    return {
        schema_version: 2,
        adapter_id: 'codex_subscription_realtime_v3',
        adapter_version: '1',
        provider_version: evidence.providerVersion || 'unknown',
        auth_mode: 'subscription_oauth',
        adapter_role: 'realtime_foreground',
        observed_at: observedAt,
        expires_at: new Date(Date.parse(observedAt) + 30 * 60 * 1000).toISOString(),
        experimental_adapter: true,
        notes: [
            'Codex thread realtime is experimental and capability-gated.',
            'Apps, plugins, and external MCP servers are disabled for the adapter-owned process.'
        ],
        realtime: {
            session: schemaCapability('thread/realtime/start:v3'),
            transports: evidence.generatedSchemaVerified ? ['webrtc'] : [],
            input_modalities: evidence.generatedSchemaVerified ? ['audio', 'text'] : [],
            output_modalities: evidence.generatedSchemaVerified ? ['audio', 'text'] : [],
            audio_input: schemaCapability('WebRTC input track'),
            audio_output: schemaCapability('WebRTC output track'),
            transcript_events: transcriptCapability,
            session_context_seed: schemaCapability('thread/realtime/start.initialItems'),
            silent_context_append: documentedCapability('thread/realtime/appendText'),
            explicit_speech: documentedCapability('thread/realtime/appendSpeech'),
            direct_image_input: unsupported('The installed thread-realtime schema exposes no append-image method.'),
            arbitrary_client_tools: unsupported('Codex thread realtime does not expose generic client function-tool registration.'),
            sideband_control: schemaCapability('codex app-server stdio control plane'),
            voice_list: unknown('Voice-list discovery is not yet included in the production capability probe.'),
            interruption: schemaCapability('thread/realtime/stop + local playback interruption'),
            response_cancel: unsupported('The adapter can stop local playback/session but has no proven response-only cancellation method.'),
            usage_events: unknown('Realtime usage event mapping needs isolated compatibility evidence.'),
            session_expiry_signal: unknown('No stable expiry notification has been proven for this Codex build.'),
            max_session_seconds: null,
            known_limits: [
                'V3 initialItems are role-bearing text only.',
                'Canonical Voice image input routes through the private strong primary.'
            ]
        }
    }
}

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
