import assert from 'node:assert/strict'
import { readVoiceAgentStatusPreference, writeVoiceAgentStatusPreference, VOICE_AGENT_STATUS_STORAGE_KEY, VOICE_AGENT_STATUS_CHANGED_EVENT } from '../src/renderer/src/pages/assistant/voice-agent-status-preference'

const values = new Map<string, string>()
const events: string[] = []
Object.assign(globalThis, { localStorage: { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) }, window: { dispatchEvent: (event: Event) => events.push(event.type) } })
assert.equal(readVoiceAgentStatusPreference(), false, 'existing and fresh installs default off')
values.set(VOICE_AGENT_STATUS_STORAGE_KEY, 'invalid')
assert.equal(readVoiceAgentStatusPreference(), false, 'invalid saved values do not enable statuses')
writeVoiceAgentStatusPreference(true)
assert.equal(readVoiceAgentStatusPreference(), true)
assert.equal(values.get(VOICE_AGENT_STATUS_STORAGE_KEY), 'true')
assert.equal(events.at(-1), VOICE_AGENT_STATUS_CHANGED_EVENT, 'mounted timelines receive same-window changes')
writeVoiceAgentStatusPreference(false)
assert.equal(readVoiceAgentStatusPreference(), false)
Object.assign(globalThis, { localStorage: { getItem: () => { throw new Error('unavailable') }, setItem: () => { throw new Error('unavailable') } } })
assert.equal(readVoiceAgentStatusPreference(), false, 'unavailable storage stays off')
assert.doesNotThrow(() => writeVoiceAgentStatusPreference(true))
console.log('Voice agent status default, persistence, notifications and storage failures: ok')
