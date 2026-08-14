import type { RealtimeProviderCapabilityReport } from '../../../shared/assistant/contracts'
import type { ForegroundClock } from '../foreground/foreground-route-controller'
import { systemForegroundClock } from '../foreground/foreground-route-controller'
import {
    createChatGptRealtimeCapabilityReport,
    type ChatGptRealtimeCapabilityEvidence
} from './codex-realtime-capabilities'

export interface ChatGptRealtimeProbeResult {
    report: RealtimeProviderCapabilityReport
    evidence: ChatGptRealtimeCapabilityEvidence
    error: string | null
}

export interface ChatGptRealtimeCapabilityProbeOptions {
    transcriptIdentityBridge?: boolean
    ownerScopedClientCommands?: boolean
    directSignalingVerified?: boolean
    clock?: ForegroundClock
}

/**
 * The direct adapter has a source-controlled protocol contract, so capability
 * setup is deterministic and never probes an executable or a paid endpoint.
 */
export function probeDirectChatGptRealtimeCapabilities(
    options: ChatGptRealtimeCapabilityProbeOptions = {}
): ChatGptRealtimeProbeResult {
    const clock = options.clock || systemForegroundClock
    const evidence: ChatGptRealtimeCapabilityEvidence = {
        providerVersion: 'chatgpt-frameless-v3',
        directSignalingVerified: options.directSignalingVerified !== false,
        transcriptIdentityBridge: options.transcriptIdentityBridge === true,
        ownerScopedClientCommands: options.ownerScopedClientCommands === true
    }
    return {
        evidence,
        error: null,
        report: createChatGptRealtimeCapabilityReport(evidence, clock.now())
    }
}

export async function probeDirectChatGptRealtimeCapabilitiesAsync(
    options: ChatGptRealtimeCapabilityProbeOptions = {}
): Promise<ChatGptRealtimeProbeResult> {
    return probeDirectChatGptRealtimeCapabilities(options)
}

// Compatibility exports for callers that persisted the old provider name.
export type CodexRealtimeProbeResult = ChatGptRealtimeProbeResult
export type CodexRealtimeCapabilityProbeOptions = ChatGptRealtimeCapabilityProbeOptions
export const probeInstalledCodexRealtimeCapabilities = probeDirectChatGptRealtimeCapabilities
export const probeInstalledCodexRealtimeCapabilitiesAsync = probeDirectChatGptRealtimeCapabilitiesAsync
