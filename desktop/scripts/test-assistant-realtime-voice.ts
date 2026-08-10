import assert from 'node:assert/strict'
import type { AssistantMessage } from '../src/shared/assistant/contracts'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import previewContent from '../src/renderer/src/assets/voice-previews/content.json'
import {
    DEFAULT_INSTRUCTOR_OUTPUT_MODALITY,
    DEFAULT_INSTRUCTOR_REALTIME_VOICE,
    DEFAULT_INSTRUCTOR_VOICE_INSTRUCTIONS,
    INSTRUCTOR_REALTIME_VOICES
} from '../src/shared/assistant/contracts/realtime-voice'
import {
    calculateInstructorVoiceActivity,
    smoothInstructorVoiceActivity
} from '../src/renderer/src/pages/assistant/instructor-voice-activity'
import { INSTRUCTOR_VOICE_VISUAL_THEMES } from '../src/renderer/src/pages/assistant/instructor-voice-visuals'
import {
    applyRealtimeTranscriptEvent
} from '../src/renderer/src/pages/assistant/instructor-voice-transcript'
import { shouldShowComposerRealtimeVoicePrimaryAction } from '../src/renderer/src/pages/assistant/assistant-composer-view-state'
import { filterVoiceHydrationReplay } from '../src/renderer/src/pages/assistant/assistant-voice-hydration-replay'
import { shouldDelegateVoiceInspection } from '../src/main/assistant/voice/voice-strong-routing'
import {
    normalizeInstructorVoicePreferences,
    readInstructorVoicePreferences,
    shouldPlayInstructorAudio,
    writeInstructorVoicePreferences
} from '../src/renderer/src/pages/assistant/instructor-voice-preferences'
import { CodexRealtimeVoiceRuntime } from '../src/main/assistant/codex-realtime-voice'
import {
    buildInstructorAppServerArgs,
    buildInstructorRealtimeMessageTurnParams,
    buildInstructorRealtimeStartParams,
    buildInstructorThreadStartParams,
    normalizeInstructorRealtimeMessage,
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

assert.deepEqual(buildInstructorAppServerArgs(), [
    'app-server',
    '--stdio',
    '-c',
    'mcp_servers={}',
    '--disable',
    'plugins',
    '--disable',
    'apps',
    '--enable',
    'realtime_conversation'
])

const threadParams = buildInstructorThreadStartParams('C:\\workspace', instructions)
assert.deepEqual(threadParams, {
    cwd: 'C:\\workspace',
    approvalPolicy: 'never',
    sandbox: 'read-only',
    ephemeral: true,
    developerInstructions: instructions,
    serviceName: 'zyra_desktop'
})

const realtimeParams = buildInstructorRealtimeStartParams('thread-1', offerSdp, instructions, {
    voice: 'sol',
    outputModality: 'text'
})
assert.equal(
    realtimeParams.outputModality,
    'audio',
    'text-only display should retain the subscription-backed v3 audio transport'
)
assert.equal(realtimeParams.includeStartupContext, false)
assert.equal(realtimeParams.prompt, instructions)
assert.equal(realtimeParams.version, 'v3')
assert.equal(realtimeParams.voice, 'sol')
assert.equal(realtimeParams.codexResponseHandoffMode, 'bemTags')
assert.equal(realtimeParams.delegationAckFiller, false)
assert.deepEqual(realtimeParams.transport, { type: 'webrtc', sdp: offerSdp })
const canonicalRealtimeParams = buildInstructorRealtimeStartParams('thread-1', offerSdp, instructions, {
    initialItems: [
        { role: 'user', text: 'Earlier canonical user turn.' },
        { role: 'assistant', text: 'Earlier canonical assistant turn.' }
    ],
    clientManagedHandoffs: true
})
assert.deepEqual(canonicalRealtimeParams.initialItems, [
    { role: 'user', text: 'Earlier canonical user turn.' },
    { role: 'assistant', text: 'Earlier canonical assistant turn.' }
])
assert.equal(canonicalRealtimeParams.clientManagedHandoffs, true)

const normalizedRealtimeMessage = normalizeInstructorRealtimeMessage({
    text: '  What is in this image?  ',
    images: [{
        name: 'sample.png',
        mimeType: 'image/png',
        dataUrl: 'data:image/png;base64,aA=='
    }]
})
assert.deepEqual(normalizedRealtimeMessage, {
    text: 'What is in this image?',
    images: [{
        name: 'sample.png',
        mimeType: 'image/png',
        dataUrl: 'data:image/png;base64,aA=='
    }]
})
assert.deepEqual(
    buildInstructorRealtimeMessageTurnParams('thread-1', normalizedRealtimeMessage),
    {
        threadId: 'thread-1',
        input: [
            { type: 'text', text: 'What is in this image?' },
            { type: 'image', url: 'data:image/png;base64,aA==', detail: 'auto' }
        ],
        approvalPolicy: 'never',
        sandboxPolicy: { type: 'readOnly' }
    }
)
assert.throws(
    () => normalizeInstructorRealtimeMessage({
        images: [{ mimeType: 'image/jpeg', dataUrl: 'data:image/png;base64,aA==' }]
    }),
    /inconsistent image metadata/
)

const composerRuntime = new CodexRealtimeVoiceRuntime()
const composerRuntimeEvents: unknown[] = []
composerRuntime.on('event', (event) => composerRuntimeEvents.push(event))
const composerRuntimeInternals = composerRuntime as unknown as {
    threadId: string
    composerTurnText: Map<string, string>
    handleComposerTurnNotification: (method: string, payload: Record<string, unknown>) => void
}
composerRuntimeInternals.threadId = 'thread-1'
composerRuntimeInternals.composerTurnText.set('typed-turn-1', '')
composerRuntimeInternals.handleComposerTurnNotification('item/agentMessage/delta', {
    turnId: 'typed-turn-1',
    delta: 'Image response.'
})
composerRuntimeInternals.handleComposerTurnNotification('turn/completed', {
    turn: { id: 'typed-turn-1', status: 'completed' }
})
assert.deepEqual(composerRuntimeEvents, [
    {
        type: 'composer.response.delta',
        threadId: 'thread-1',
        turnId: 'typed-turn-1',
        delta: 'Image response.'
    },
    {
        type: 'composer.response.done',
        threadId: 'thread-1',
        turnId: 'typed-turn-1',
        text: 'Image response.',
        error: undefined
    }
])
composerRuntime.dispose()

const defaultRealtimeParams = buildInstructorRealtimeStartParams('thread-1', offerSdp, instructions)
assert.equal(defaultRealtimeParams.outputModality, DEFAULT_INSTRUCTOR_OUTPUT_MODALITY)
assert.equal(defaultRealtimeParams.voice, DEFAULT_INSTRUCTOR_REALTIME_VOICE)
const unsupportedVoiceParams = buildInstructorRealtimeStartParams('thread-1', offerSdp, instructions, {
    voice: 'verse'
})
assert.equal(unsupportedVoiceParams.voice, DEFAULT_INSTRUCTOR_REALTIME_VOICE)
assert.deepEqual(INSTRUCTOR_REALTIME_VOICES, [
    'arbor',
    'breeze',
    'cove',
    'ember',
    'juniper',
    'maple',
    'sol',
    'spruce',
    'vale'
])
assert.deepEqual(Object.keys(INSTRUCTOR_VOICE_VISUAL_THEMES), INSTRUCTOR_REALTIME_VOICES)
assert.deepEqual(Object.keys(previewContent), INSTRUCTOR_REALTIME_VOICES)
const previewHashes = new Set<string>()
const previewTopics = new Set<string>()
for (const voice of INSTRUCTOR_REALTIME_VOICES) {
    const preview = previewContent[voice]
    assert.ok(preview.topic.length >= 12)
    assert.ok(preview.text.split(/\s+/).length >= 45)
    assert.ok((preview.text.match(/[.!?](?:\s|$)/g) ?? []).length >= 3)
    previewTopics.add(preview.topic)
    const audio = readFileSync(new URL(`../src/renderer/src/assets/voice-previews/${voice}.ogg`, import.meta.url))
    assert.ok(audio.byteLength > 40_000)
    assert.equal(audio.subarray(0, 4).toString('ascii'), 'OggS')
    previewHashes.add(createHash('sha256').update(audio).digest('hex'))
}
assert.equal(previewTopics.size, INSTRUCTOR_REALTIME_VOICES.length)
assert.equal(previewHashes.size, INSTRUCTOR_REALTIME_VOICES.length)
assert.equal(calculateInstructorVoiceActivity(new Uint8Array(64).fill(128)), 0)
const loudSamples = new Uint8Array(64).map((_, index) => index % 2 === 0 ? 84 : 172)
assert.ok(calculateInstructorVoiceActivity(loudSamples) > 0.8)
const attackLevel = smoothInstructorVoiceActivity(0, 1)
assert.ok(attackLevel > 0.1 && attackLevel < 0.3)
let sustainedLevel = 0
for (let index = 0; index < 16; index += 1) sustainedLevel = smoothInstructorVoiceActivity(sustainedLevel, 1)
assert.ok(sustainedLevel > 0.9)
assert.ok(smoothInstructorVoiceActivity(sustainedLevel, 0) < sustainedLevel)
assert.deepEqual(
    parseInstructorRealtimeNotification('thread/realtime/started', {
        threadId: 'thread-1',
        realtimeSessionId: 'realtime-1',
        version: 'v3'
    }),
    {
        type: 'session.started',
        threadId: 'thread-1',
        realtimeSessionId: 'realtime-1',
        realtimeVersion: 'v3'
    }
)
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
    parseInstructorRealtimeNotification('thread/realtime/transcript/delta', {
        threadId: 'thread-1',
        itemId: 'provider-item-1',
        role: 'assistant',
        delta: 'Identified'
    }),
    {
        type: 'transcript.delta',
        threadId: 'thread-1',
        providerItemId: 'provider-item-1',
        role: 'assistant',
        delta: 'Identified'
    }
)
assert.deepEqual(
    parseInstructorRealtimeNotification('thread/realtime/transcript/delta', {
        threadId: 'thread-1',
        role: 'assistant',
        delta: ' '
    }),
    {
        type: 'transcript.delta',
        threadId: 'thread-1',
        role: 'assistant',
        delta: ' '
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

const repeatedUserText = "We're going to take a shower"
let transcript = applyRealtimeTranscriptEvent([], {
    type: 'turn.created',
    turn: { id: 'user-turn-1', role: 'user', transcript: " We're going to" }
})
transcript = applyRealtimeTranscriptEvent(transcript, {
    type: 'turn.delta',
    turn_id: 'user-turn-1',
    delta: ' take a shower'
})
transcript = applyRealtimeTranscriptEvent(transcript, {
    type: 'turn.done',
    turn: { id: 'user-turn-1', role: 'user', transcript: ` ${repeatedUserText}` }
})
transcript = applyRealtimeTranscriptEvent(transcript, {
    type: 'turn.done',
    turn: { id: 'assistant-turn-1', role: 'assistant', transcript: ' Alright.' }
})

transcript = applyRealtimeTranscriptEvent(transcript, {
    type: 'turn.done',
    turn: { id: 'user-turn-1', role: 'user', transcript: ` ${repeatedUserText}` }
})
assert.deepEqual(
    transcript.map(({ id, role, text, final }) => ({ id, role, text, final })),
    [
        { id: 'user-turn-1', role: 'user', text: repeatedUserText, final: true },
        { id: 'assistant-turn-1', role: 'assistant', text: 'Alright.', final: true }
    ],
    'a replayed v3 turn should update its original bubble instead of creating a duplicate'
)

transcript = applyRealtimeTranscriptEvent(transcript, {
    type: 'turn.done',
    turn: { id: 'user-turn-2', role: 'user', transcript: repeatedUserText }
})
assert.equal(
    transcript.filter((entry) => entry.role === 'user').length,
    2,
    'the same words with a new turn id should remain visible as an intentional repeat'
)

let dataChannelTranscript = applyRealtimeTranscriptEvent([], {
    type: 'conversation.item.created',
    item: { id: 'assistant-item-1', role: 'assistant' }
})
dataChannelTranscript = applyRealtimeTranscriptEvent(dataChannelTranscript, {
    type: 'response.audio_transcript.delta',
    item_id: 'assistant-item-1',
    delta: 'You have '
})
dataChannelTranscript = applyRealtimeTranscriptEvent(dataChannelTranscript, {
    type: 'response.audio_transcript.delta',
    item_id: 'assistant-item-1',
    delta: 'You have '
})
assert.equal(dataChannelTranscript[0]?.text, 'You have ', 'a replayed provider delta should not duplicate visible words')
dataChannelTranscript = applyRealtimeTranscriptEvent(dataChannelTranscript, {
    type: 'response.audio_transcript.delta',
    item_id: 'assistant-item-1',
    delta: 'You have 120'
})
assert.equal(dataChannelTranscript[0]?.text, 'You have 120', 'a cumulative provider delta should replace its shorter prefix')
dataChannelTranscript = applyRealtimeTranscriptEvent(dataChannelTranscript, {
    type: 'response.audio_transcript.done',
    item_id: 'assistant-item-1',
    transcript: 'You have 120 GB free.'
})
dataChannelTranscript = applyRealtimeTranscriptEvent(dataChannelTranscript, {
    type: 'conversation.item.input_audio_transcription.completed',
    item_id: 'user-item-1',
    transcript: 'How much storage is free?'
})
assert.deepEqual(dataChannelTranscript.map(({ id, role, text, final }) => ({ id, role, text, final })), [
    { id: 'assistant-item-1', role: 'assistant', text: 'You have 120 GB free.', final: true },
    { id: 'user-item-1', role: 'user', text: 'How much storage is free?', final: true }
])
assert.equal(shouldDelegateVoiceInspection("What's the storage left on my PC if the storage is free?"), true)
assert.equal(shouldDelegateVoiceInspection('What are you able to do here?'), false)
assert.equal(shouldDelegateVoiceInspection('Checking on what?'), false)
assert.equal(shouldDelegateVoiceInspection('Run the build and fix the file if it fails'), true)

const hydrationHistory: AssistantMessage[] = [{
    id: 'canonical-earlier-answer',
    role: 'assistant',
    text: 'Earlier canonical answer.',
    turnId: null,
    streaming: false,
    createdAt: '2026-08-10T09:59:00.000Z',
    updatedAt: '2026-08-10T09:59:00.000Z'
}]
assert.deepEqual(filterVoiceHydrationReplay([
    { id: 'hydrated-item', role: 'assistant', text: 'Earlier canonical answer.', final: true },
    { id: 'new-item', role: 'assistant', text: 'Fresh Voice answer.', final: true }
], hydrationHistory, '2026-08-10T10:00:00.000Z').map((entry) => entry.id), ['new-item'])
assert.deepEqual(filterVoiceHydrationReplay([
    { id: 'hydrated-partial', role: 'assistant', text: 'Earlier canonical', final: false }
], hydrationHistory, '2026-08-10T10:00:00.000Z'), [])

const preferenceStorage = new Map<string, string>()
const originalLocalStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
        getItem: (key: string) => preferenceStorage.get(key) ?? null,
        setItem: (key: string, value: string) => preferenceStorage.set(key, value)
    }
})

const preferences = normalizeInstructorVoicePreferences({
    instructions: '  Remember this instructor prompt.  ',
    voice: 'sol',
    outputModality: 'text'
})
assert.deepEqual(preferences, {
    instructions: '  Remember this instructor prompt.  ',
    voice: 'sol',
    outputModality: 'text'
})
writeInstructorVoicePreferences(preferences)
assert.deepEqual(readInstructorVoicePreferences(), preferences)
assert.equal(shouldPlayInstructorAudio('audio'), true)
assert.equal(shouldPlayInstructorAudio('text'), false)
assert.deepEqual(
    normalizeInstructorVoicePreferences({ voice: 'invalid', outputModality: 'video' }),
    {
        instructions: DEFAULT_INSTRUCTOR_VOICE_INSTRUCTIONS,
        voice: DEFAULT_INSTRUCTOR_REALTIME_VOICE,
        outputModality: DEFAULT_INSTRUCTOR_OUTPUT_MODALITY
    }
)
if (originalLocalStorage) Object.defineProperty(globalThis, 'localStorage', originalLocalStorage)
else Reflect.deleteProperty(globalThis, 'localStorage')

const emptyRealtimeVoiceAction = {
    currentSubmitLabel: 'Send',
    text: '',
    contextFilesLength: 0,
    realtimeVoiceAvailable: true,
    composerAvailable: true,
    isConnected: true,
    canStop: false,
    showBusySendActions: false,
    dictationBusy: false
}
assert.equal(
    shouldShowComposerRealtimeVoicePrimaryAction(emptyRealtimeVoiceAction),
    true,
    'an empty connected composer should put realtime Voice in the primary Send slot'
)
assert.equal(
    shouldShowComposerRealtimeVoicePrimaryAction({ ...emptyRealtimeVoiceAction, text: 'Send this' }),
    false,
    'sendable text should restore the Send action'
)
assert.equal(
    shouldShowComposerRealtimeVoicePrimaryAction({ ...emptyRealtimeVoiceAction, contextFilesLength: 1 }),
    false,
    'an attachment-only message should restore the Send action'
)
assert.equal(
    shouldShowComposerRealtimeVoicePrimaryAction({ ...emptyRealtimeVoiceAction, canStop: true }),
    false,
    'stopping an active assistant turn should take priority over starting realtime Voice'
)
assert.equal(
    shouldShowComposerRealtimeVoicePrimaryAction({ ...emptyRealtimeVoiceAction, dictationBusy: true }),
    false,
    'realtime Voice should not start while composer dictation is active'
)
assert.equal(
    shouldShowComposerRealtimeVoicePrimaryAction({ ...emptyRealtimeVoiceAction, realtimeVoiceAvailable: false }),
    false,
    'the unavailable realtime service should not replace Send with a dead action'
)

const voiceLabSource = readFileSync(
    new URL('../src/renderer/src/pages/assistant/InstructorVoiceLab.tsx', import.meta.url),
    'utf8'
)
const voiceConversationSource = readFileSync(
    new URL('../src/renderer/src/pages/assistant/InstructorVoiceConversation.tsx', import.meta.url),
    'utf8'
)
const voiceConversationStyles = readFileSync(
    new URL('../src/renderer/src/pages/assistant/InstructorVoiceConversation.css', import.meta.url),
    'utf8'
)
const voiceOrbSource = readFileSync(
    new URL('../src/renderer/src/pages/assistant/InstructorVoiceOrb.tsx', import.meta.url),
    'utf8'
)
const voiceOrbStyles = readFileSync(
    new URL('../src/renderer/src/pages/assistant/InstructorVoiceOrb.css', import.meta.url),
    'utf8'
)
const voiceSettingsStyles = readFileSync(
    new URL('../src/renderer/src/pages/assistant/InstructorVoiceSettings.css', import.meta.url),
    'utf8'
)
const composerViewSource = readFileSync(
    new URL('../src/renderer/src/pages/assistant/AssistantComposerView.tsx', import.meta.url),
    'utf8'
)
const conversationPaneSource = readFileSync(
    new URL('../src/renderer/src/pages/assistant/AssistantConversationPane.tsx', import.meta.url),
    'utf8'
)
const conversationHeaderSource = readFileSync(
    new URL('../src/renderer/src/pages/assistant/AssistantConversationHeader.tsx', import.meta.url),
    'utf8'
)
const canonicalVoiceStageSource = readFileSync(
    new URL('../src/renderer/src/pages/assistant/AssistantCanonicalVoiceStage.tsx', import.meta.url),
    'utf8'
)
const canonicalVoiceDockSource = readFileSync(
    new URL('../src/renderer/src/pages/assistant/AssistantCanonicalVoiceDock.tsx', import.meta.url),
    'utf8'
)
const canonicalVoiceStageStyles = readFileSync(
    new URL('../src/renderer/src/pages/assistant/AssistantCanonicalVoiceStage.css', import.meta.url),
    'utf8'
)
const timelineRowsSource = readFileSync(
    new URL('../src/renderer/src/pages/assistant/AssistantTimelineRows.tsx', import.meta.url),
    'utf8'
)
const liveTranscriptSource = readFileSync(
    new URL('../src/renderer/src/pages/assistant/InstructorVoiceLiveTranscript.tsx', import.meta.url),
    'utf8'
)
assert.match(voiceLabSource, /<InstructorVoiceConversation/)
assert.doesNotMatch(voiceLabSource, /ConversationDrawer/)
assert.match(voiceConversationSource, /userMessage \? 'is-user' : 'is-assistant'/)
assert.match(voiceConversationStyles, /instructor-voice-conversation-user-bubble/)
assert.match(voiceConversationStyles, /background: color-mix\(/)
assert.doesNotMatch(voiceConversationStyles, /--sparkle-/)
assert.match(voiceOrbSource, /animateLayout/)
assert.match(voiceOrbSource, /instructor-voice-orb-render-surface/)
assert.match(voiceOrbSource, /instructor-voice-orb-volume/)
assert.match(voiceOrbStyles, /--instructor-orb-layout-scale/)
assert.match(voiceOrbStyles, /--instructor-orb-volume-scale/)
assert.match(voiceSettingsStyles, /grid-template-columns: minmax\(280px/)
assert.match(voiceSettingsStyles, /instructor-voice-settings-instructions-pane/)
assert.doesNotMatch(voiceSettingsStyles, /--sparkle-/)
assert.match(composerViewSource, /showRealtimeVoicePrimaryAction[\s\S]{0,120}<ComposerRealtimeVoiceButton/u)
assert.match(conversationPaneSource, /onStartRealtimeVoice=\{handleStartCanonicalVoice\}/u)
assert.match(conversationPaneSource, /messages=\{displayedTimelineMessages\}/u)
assert.match(canonicalVoiceStageSource, /<InstructorVoiceOrb/u)
assert.match(canonicalVoiceDockSource, /<InstructorVoiceComposer/u)
assert.match(canonicalVoiceDockSource, /allowImages=\{false\}/u)
assert.match(canonicalVoiceDockSource, /AssistantPendingApprovalPanel/u)
assert.match(canonicalVoiceStageStyles, /bottom: 90px/u)
assert.match(conversationPaneSource, /VOICE_TIMELINE_RESERVE_PX = 500/u)
assert.match(conversationPaneSource, /VOICE_SCROLL_BUTTON_BOTTOM_PX = 78/u)
assert.doesNotMatch(conversationPaneSource, /voiceTimelineInsetFrameRef/u, 'Voice startup must not relayout the virtual timeline on every animation frame')
assert.match(timelineRowsSource, /usesProviderNativeStreaming = message\.modality === 'voice'/u)
assert.doesNotMatch(liveTranscriptSource, /data-transcript-word|element\.animate/u, 'the orb caption should use one calm transition rather than per-word animation')
assert.doesNotMatch(conversationHeaderSource, /onToggleVoice|Start Voice in this chat/u, 'realtime Voice activation should live in the empty composer instead of the title bar')

console.log('Assistant realtime voice contract passed.')
