import assert from 'node:assert/strict'
import { isAssistantTransportFailure } from '../src/shared/assistant/transport-failure'
import { getAssistantRecoveryIssue } from '../src/renderer/src/pages/assistant/assistant-runtime-recovery'

for (const text of ['WebSocket closed 1006', 'WebSocket closed (1011)', 'WebSocket closed: 1012', 'WebSocket closed 1013', 'WebSocket stream closed before response.completed', 'fetch failed', 'read ECONNRESET']) {
    assert.equal(isAssistantTransportFailure(text), true, `${text} is a recoverable infrastructure failure`)
    assert.equal(getAssistantRecoveryIssue({ threadLastError: text })?.recoverable, true, `${text} keeps the network recovery affordance`)
}
for (const text of ['WebSocket closed 1008', 'WebSocket authentication rejected', 'No ChatGPT account is available for this model. Check accounts and usage rules in Providers > Limits.', 'No API key found for openai-codex.', '429 quota exceeded', '401 unauthorized']) {
    assert.equal(isAssistantTransportFailure(text), false, `${text} must not be relabelled as a network failure`)
    assert.equal(getAssistantRecoveryIssue({ threadLastError: text })?.recoverable, false)
}
console.log('Network recovery policy: native WebSocket infrastructure failures recover; policy, quota and authentication failures remain distinct.')
