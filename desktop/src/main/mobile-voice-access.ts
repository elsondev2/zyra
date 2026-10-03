import type { AssistantService } from './assistant/service'
import type { InstructorRealtimeVoice } from '../shared/assistant/contracts'
import { MobileVoiceSession } from '../../../mobile/gateway/src/voice-session.mjs'
import { getCodexVoiceTranscriptionState } from './assistant/codex-voice-transcription'
import { transcribeVoiceAndSave } from './assistant/voice-history'

// Browser owners occupy -1..-2,000,000,000; Electron webContents use positive IDs.
// Allocate a fresh owner for each socket so late cleanup cannot end a reconnect.
let nextVoiceOwner = -2_000_000_001

export class MobileVoiceAccess extends MobileVoiceSession {
    constructor(service: AssistantService, receive: (event: Record<string, unknown>) => void, deviceName?: string) {
        const owner = nextVoiceOwner--
        super({
            dictation: { state: getCodexVoiceTranscriptionState, transcribe: transcribeVoiceAndSave },
            start: (session, input, signal) => service.startMobileRealtimeVoice(session, {
                sdp: input.sdp, voice: input.voice as InstructorRealtimeVoice | undefined, deviceName
            }, owner, signal),
            ingest: (adapterSessionId, payload) => service.ingestRealtimeVoiceEvent({ adapterSessionId, payload }, owner),
            message: input => service.sendRealtimeVoiceMessage(input, owner),
            transcribe: async (input, signal) => {
                if (!service.ownsRealtimeVoice(owner)) throw new Error('This phone no longer owns Voice.')
                const text = await transcribeVoiceAndSave(input, signal)
                signal.throwIfAborted()
                if (!service.ownsRealtimeVoice(owner)) throw new Error('This phone no longer owns Voice.')
                return text
            },
            stop: async () => { if (service.ownsRealtimeVoice(owner)) await service.stopRealtimeVoice(owner) },
            subscribe: listener => service.subscribeExternalRealtimeVoiceEvents((event, eventOwner) => {
                if (eventOwner === owner) listener(event)
            })
        }, receive)
    }
}
