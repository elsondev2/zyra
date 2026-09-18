import assert from 'node:assert/strict'
import { canonicalVoicePresentationEvent } from '../src/main/assistant/voice/canonical-voice-presentation'
import type { RealtimeDomainEvent } from '../src/shared/assistant/contracts'

const identity = { adapterSessionId: 'adapter-a', conversationId: 'chat', realtimeProviderThreadId: 'provider-thread',
    realtimeSessionId: 'realtime-a', realtimeSessionGeneration: 3, occurredAt: '2026-09-14T02:00:00Z' }
const events: RealtimeDomainEvent[] = [
    { ...identity, type: 'realtime.user.transcript.delta', providerItemId: 'user-1', delta: 'Can you', transcriptSource: 'chunk' },
    { ...identity, type: 'realtime.user.transcript.completed', providerItemId: 'user-1', text: 'Can you help?' },
    { ...identity, type: 'realtime.assistant.transcript.delta', providerItemId: 'assistant-1', delta: 'Yes' },
    { ...identity, type: 'realtime.assistant.transcript.completed', providerItemId: 'assistant-1', text: 'Yes, here is the change.', transcriptSource: 'turn' },
    { ...identity, type: 'realtime.transcript.suppressed', providerItemId: 'hydrated-1', role: 'assistant' },
    { ...identity, type: 'realtime.session.closed', reason: 'ended' }
]
for (const event of events) {
    assert.equal(canonicalVoicePresentationEvent(event, null), null)
    assert.equal(canonicalVoicePresentationEvent(event, 'adapter-b'), null)
    const projected = canonicalVoicePresentationEvent(event, 'adapter-a')!
    assert.equal(projected.adapterSessionId, identity.adapterSessionId)
    assert.equal(projected.realtimeSessionGeneration, 3)
    assert.equal(projected.realtimeSessionId, identity.realtimeSessionId)
    if ('transcriptSource' in event) assert.equal((projected as { transcriptSource?: string }).transcriptSource, event.transcriptSource)
    if ('providerItemId' in event) {
        assert.ok('providerItemId' in projected)
        assert.equal(projected.providerItemId, event.providerItemId)
        assert.equal((projected as { role: string }).role, event.type.includes('.user.') ? 'user' : 'assistant')
    }
}
console.log('Canonical Voice presentation retains source identities and rejects old adapters')
