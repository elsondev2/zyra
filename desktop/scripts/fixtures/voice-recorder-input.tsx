import { useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import type { Root } from 'react-dom/client'
import { useAssistantSpeechInput } from '../../src/renderer/src/pages/assistant/useAssistantSpeechInput'
import { AssistantVoiceRecorderBar } from '../../src/renderer/src/pages/assistant/AssistantVoiceRecorderBar'
import { createAssistantComposerHandlers } from '../../src/renderer/src/pages/assistant/assistant-composer-handlers'
import { ASSISTANT_COMPOSER_FOCUS_CLASS_NAME } from '../../src/renderer/src/pages/assistant/assistant-composer-focus'

export async function checkVoiceRecorderInput(root: Root): Promise<string[]> {
    const check = (value: unknown, label: string) => { if (!value) throw new Error(label) }
    const sleep = () => new Promise(resolve => setTimeout(resolve, 20))
    const wait = async (test: () => boolean, label: string) => {
        const deadline = performance.now() + 2500
        while (!test() && performance.now() < deadline) await sleep()
        check(test(), label)
    }
    const focusStyle = async (enabled: boolean) => {
        const request = { focusSelector: '[data-recorder-frame]', pseudoClass: 'focus-within', enabled, done: false }
        ;(window as any).sidebarPointerRequest = request
        await wait(() => request.done, 'Chromium applies the recording focus style without a foreground window')
    }
    let processor: any, stops = 0, closes = 0, apiCalls = 0
    let voice!: ReturnType<typeof useAssistantSpeechInput>, setDraft!: (value: string) => void
    let draft = '', scope = 'one', deferred = false, transcriptFails = false, sendFails = false
    let release!: (value: unknown) => void
    const sent: { prompt: string; files: unknown[]; options: any }[] = []
    class SyntheticAudioContext {
        sampleRate = 24000
        destination = {}
        resume() { return Promise.resolve() }
        close() { closes++; return Promise.resolve() }
        createMediaStreamSource() { return { connect() {}, disconnect() {} } }
        createScriptProcessor() { processor = { connect() {}, disconnect() {}, onaudioprocess: null }; return processor }
        createGain() { return { gain: { value: 1 }, connect() {}, disconnect() {} } }
    }
    ;(window as any).AudioContext = SyntheticAudioContext
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: async () => ({ getTracks: () => [{ stop() { stops++ } }] }) } })
    ;(window as any).devscope = { assistant: { transcribeVoice: () => {
        apiCalls++
        check(stops >= apiCalls && closes >= apiCalls, 'Microphone and audio context stop before transcription')
        if (deferred) return new Promise(resolve => { release = resolve })
        return Promise.resolve(transcriptFails ? { success: false, error: 'Synthetic transcription failure' } : { success: true, text: 'spoken words' })
    } } }
    function ComposerFixture() {
        const [text, setText] = useState('typed draft')
        draft = text; setDraft = setText
        const textareaRef = useRef<HTMLTextAreaElement | null>(null)
        const noop = () => {}
        const handlers = createAssistantComposerHandlers({
            disabled: false, allowEmptySubmit: false, isConnected: true, isSending: false, isThinking: false, busyMessageMode: 'queue',
            text, setText, inlineMentionTags: [], setInlineMentionTags: noop, contextFiles: [{ id: 'file', path: '/fixture.ts', name: 'fixture.ts', kind: 'code', source: 'manual' }], setContextFiles: noop,
            sentPromptHistory: [], setSentPromptHistory: noop, setHistoryCursor: noop, setDraftBeforeHistory: noop, setComposerCursor: noop,
            selectedModel: 'fixture/model', selectedRuntimeMode: 'full-access', selectedInteractionMode: 'default', selectedEffort: 'high', fastModeEnabled: false, removingAttachmentIds: [], textareaRef,
            onSend: async (prompt: string, files: any[], options: any) => { sent.push({ prompt, files, options }); return !sendFails }
        } as any)
        voice = useAssistantSpeechInput({ text, setText, setComposerCursor: noop, textareaRef, disabled: false, isConnected: true, engine: 'codex', scopeKey: scope,
            onSubmitTranscript: value => handlers.handleSendTranscript(value) })
        const showRecorder = voice.isRecording || voice.isTranscribing
        return <div>
            <button onClick={voice.startRecording}>Record</button>
            <div data-recorder-frame className={`w-[620px] rounded-full border border-white/[0.09] ${ASSISTANT_COMPOSER_FOCUS_CLASS_NAME}`}>
                {showRecorder ? <AssistantVoiceRecorderBar durationLabel={voice.durationLabel} isTranscribing={voice.isTranscribing} waveformLevels={voice.waveformLevels} onCancel={voice.cancelRecording} onSubmit={voice.submitRecording} onSend={voice.submitAndSendRecording} />
                    : <textarea ref={textareaRef} value={text} onChange={event => setText(event.target.value)} />}
            </div>
            {voice.speechError ? <div role="alert">{voice.speechError}</div> : null}
        </div>
    }
    const render = () => flushSync(() => root.render(<ComposerFixture />))
    const action = (label: string) => document.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!
    const start = async (text = 'typed draft') => {
        flushSync(() => setDraft(text)); voice.startRecording()
        await wait(() => voice.isRecording, 'Recording starts without device access')
        processor.onaudioprocess({ inputBuffer: { numberOfChannels: 1, length: 4096, getChannelData: () => new Float32Array(4096).fill(.1) } })
    }
    render(); await sleep(); await sleep()
    await start()
    const input = document.querySelector<HTMLElement>('[aria-label="Voice note recorder"]')!
    check(document.activeElement === input, 'Recording input receives focus')
    const frame = document.querySelector<HTMLElement>('[data-recorder-frame]')!
    input.blur()
    await focusStyle(false)
    await sleep()
    const unfocusedShadow = getComputedStyle(frame).boxShadow
    await focusStyle(true)
    await wait(() => getComputedStyle(frame).boxShadow !== unfocusedShadow, `Focused recording shows the composer focus ring (baseline: ${unfocusedShadow}; classes: ${frame.className})`)
    input.blur(); await focusStyle(false); await sleep()
    check(document.activeElement !== input, 'Recording input releases DOM focus')
    action('Stop and transcribe voice note').click()
    await wait(() => !voice.isRecording && !voice.isTranscribing, 'Stop finishes transcription')
    check(draft === 'typed draft spoken words' && sent.length === 0, 'Stop leaves the transcript in the draft without sending')

    await start()
    action('Transcribe and send voice note').click()
    voice.submitAndSendRecording()
    await wait(() => !voice.isTranscribing && sent.length === 1, 'Send transcribes and submits once')
    check(sent[0].prompt === 'typed draft spoken words', 'Submission uses the complete transcript instead of stale text')
    check(sent[0].files.length === 1 && sent[0].options.model === 'fixture/model' && sent[0].options.effort === 'high' && sent[0].options.dispatchMode === 'immediate', 'Voice send preserves files, model, effort, permissions and normal dispatch')
    check(draft === '', 'Successful send clears the draft')

    await start('')
    document.querySelector<HTMLElement>('[aria-label="Voice note recorder"]')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
    await wait(() => !voice.isTranscribing && sent.length === 2, 'Enter transcribes and sends from the recording input')
    check(sent[1].prompt === 'spoken words', 'Enter submits the transcript')

    await start('keep draft'); transcriptFails = true
    action('Transcribe and send voice note').click()
    await wait(() => !voice.isRecording && !voice.isTranscribing, 'Failed transcription settles')
    check(sent.length === 2 && draft === 'keep draft' && voice.speechError, 'Failed transcription sends nothing and preserves the draft')
    transcriptFails = false

    await start(); sendFails = true
    action('Transcribe and send voice note').click()
    await wait(() => !voice.isTranscribing && sent.length === 3, 'Failed send settles')
    check(draft === 'typed draft spoken words', 'A rejected send restores the full transcript')
    sendFails = false

    deferred = true
    await start('keep cancelled draft')
    action('Transcribe and send voice note').click()
    await wait(() => voice.isTranscribing && Boolean(release), 'Deferred transcription starts')
    action('Cancel transcription').click()
    release({ success: true, text: 'discard cancelled result' }); await sleep(); await sleep()
    check(sent.length === 3 && draft === 'keep cancelled draft', 'Cancellation suppresses late transcription and sending')

    release = undefined as any
    await start('keep thread draft')
    action('Transcribe and send voice note').click()
    await wait(() => voice.isTranscribing && Boolean(release), 'Thread-switch transcription starts')
    scope = 'other-thread'; render(); await sleep()
    release({ success: true, text: 'discard previous thread result' }); await sleep(); await sleep()
    check(sent.length === 3 && draft === 'keep thread draft', 'Switching chats cannot send an old recording into the new thread')
    root.unmount()
    return ['recording Stop preserves draft; Send and Enter submit full text once with chat configuration; focus ring, failure recovery, cancellation, and thread-switch isolation pass (synthetic audio/API, actual hook and composer handlers)']
}
