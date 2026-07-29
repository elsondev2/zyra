import assert from 'node:assert/strict'
import {
    DEFAULT_INSTRUCTOR_VOICE_INSTRUCTIONS
} from '../src/shared/assistant/contracts/realtime-voice'
import {
    buildInstructorAppServerArgs,
    buildInstructorRealtimeStartParams,
    buildInstructorThreadStartParams,
    normalizeInstructorVoiceInstructions,
    normalizeWebRtcOfferSdp,
    parseInstructorRealtimeNotification
} from '../src/main/assistant/codex-realtime-voice-contract'

const instructions = normalizeInstructorVoiceInstructions('  Teach me TypeScript one step at a time.  ')
assert.equal(instructions, 'Teach me TypeScript one step at a time.')
assert.equal(normalizeInstructorVoiceInstructions(''), DEFAULT_INSTRUCTOR_VOICE_INSTRUCTIONS)
assert.throws(() => normalizeInstructorVoiceInstructions('x'.repeat(8_001)), /8,000 characters/)

const offerSdp = 'v=0\r\no=- 1 2 IN IP4 127.0.0.1\r\n'
assert.equal(normalizeWebRtcOfferSdp(offerSdp), offerSdp)
assert.equal(normalizeWebRtcOfferSdp(offerSdp).endsWith('\r\n'), true)
assert.throws(() => normalizeWebRtcOfferSdp('not an sdp'), /WebRTC offer/)

assert.deepEqual(buildInstructorAppServerArgs(), ['app-server', '--enable', 'realtime_conversation'])

const threadParams = buildInstructorThreadStartParams('C:\\workspace', instructions)
assert.deepEqual(threadParams, {
    cwd: 'C:\\workspace',
    approvalPolicy: 'never',
    sandbox: 'read-only',
    ephemeral: true,
    developerInstructions: instructions
})

const realtimeParams = buildInstructorRealtimeStartParams('thread-1', offerSdp, instructions)
assert.equal(realtimeParams.outputModality, 'audio')
assert.equal(realtimeParams.includeStartupContext, false)
assert.equal(realtimeParams.prompt, instructions)
assert.equal(realtimeParams.version, 'v1')
assert.deepEqual(realtimeParams.transport, { type: 'webrtc', sdp: offerSdp })

assert.deepEqual(
    parseInstructorRealtimeNotification('thread/realtime/transcript/delta', {
        threadId: 'thread-1',
        role: 'user',
        delta: 'Hello'
    }),
    {
        type: 'transcript.delta',
        threadId: 'thread-1',
        role: 'user',
        delta: 'Hello'
    }
)
assert.deepEqual(
    parseInstructorRealtimeNotification('thread/realtime/error', {
        threadId: 'thread-1',
        message: 'Feature unavailable.'
    }),
    {
        type: 'session.error',
        threadId: 'thread-1',
        message: 'Feature unavailable.'
    }
)
assert.equal(parseInstructorRealtimeNotification('item/completed', {}), null)

console.log('Assistant realtime voice contract passed.')
