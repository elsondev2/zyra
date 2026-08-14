import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type RefObject, type SetStateAction } from 'react'
import type { AssistantTranscriptionEngine } from '@/lib/settings'
import {
    ASSISTANT_VOICE_MAX_DURATION_MS,
    ASSISTANT_VOICE_MAX_WAVEFORM_SAMPLES,
    createAssistantVoicePayload,
    describeAssistantMicrophoneError,
    formatAssistantVoiceDuration,
    normalizeAssistantVoiceWaveformLevel
} from './assistant-voice-recorder'

type AssistantSpeechErrorKind =
    | 'permission'
    | 'capture'
    | 'network'
    | 'runtime'
    | 'no-speech'
    | 'unknown'

type BrowserSpeechRecognitionAlternative = { transcript: string }
type BrowserSpeechRecognitionResult = {
    isFinal: boolean
    length: number
    [index: number]: BrowserSpeechRecognitionAlternative
}
type BrowserSpeechRecognitionEvent = {
    resultIndex: number
    results: ArrayLike<BrowserSpeechRecognitionResult>
}
type BrowserSpeechRecognitionErrorEvent = { error: string }
type BrowserSpeechRecognition = {
    continuous: boolean
    interimResults: boolean
    lang: string
    maxAlternatives: number
    onresult: ((event: BrowserSpeechRecognitionEvent) => void) | null
    onerror: ((event: BrowserSpeechRecognitionErrorEvent) => void) | null
    onend: (() => void) | null
    start: () => void
    stop: () => void
    abort: () => void
}
type BrowserSpeechRecognitionCtor = new () => BrowserSpeechRecognition
type SpeechRecognitionWindow = Window & {
    SpeechRecognition?: BrowserSpeechRecognitionCtor
    webkitSpeechRecognition?: BrowserSpeechRecognitionCtor
    webkitAudioContext?: typeof AudioContext
}

type RecorderRuntime = {
    audioContext: AudioContext
    sourceNode: MediaStreamAudioSourceNode
    processorNode: ScriptProcessorNode
    silentGainNode: GainNode
    stream: MediaStream
    chunks: Float32Array[]
    capturedSampleCount: number
    sampleRateHz: number
    startedAt: number
}

const RECORDER_BUFFER_SIZE = 4096
const WAVEFORM_EMIT_INTERVAL_MS = 45
const DURATION_UPDATE_INTERVAL_MS = 100

const getSpeechRecognitionCtor = () => {
    if (typeof window === 'undefined') return null
    const recognitionWindow = window as SpeechRecognitionWindow
    return recognitionWindow.SpeechRecognition || recognitionWindow.webkitSpeechRecognition || null
}

const getAudioContextCtor = () => {
    if (typeof window === 'undefined') return null
    const audioWindow = window as SpeechRecognitionWindow
    return window.AudioContext || audioWindow.webkitAudioContext || null
}

const appendSpeechToDraft = (baseText: string, spokenText: string) => {
    const normalizedSpokenText = spokenText.trim()
    if (!normalizedSpokenText) return baseText
    if (!baseText.trim()) return normalizedSpokenText
    return /\s$/.test(baseText) ? `${baseText}${normalizedSpokenText}` : `${baseText} ${normalizedSpokenText}`
}

const normalizeBrowserSpeechError = (error: string): { kind: AssistantSpeechErrorKind; message: string | null } => {
    switch (error) {
        case 'not-allowed':
        case 'service-not-allowed':
            return { kind: 'permission', message: 'Microphone permission was denied.' }
        case 'audio-capture':
            return { kind: 'capture', message: 'No microphone was found.' }
        case 'network':
            return { kind: 'network', message: 'Browser dictation could not reach its speech service.' }
        case 'no-speech':
            return { kind: 'no-speech', message: null }
        default:
            return { kind: 'unknown', message: 'Browser dictation failed.' }
    }
}

const microphoneErrorKind = (error: unknown): AssistantSpeechErrorKind => {
    const name = error instanceof DOMException
        ? error.name
        : typeof error === 'object' && error !== null && 'name' in error
            ? String((error as { name?: unknown }).name || '')
            : ''
    if (name === 'NotAllowedError' || name === 'SecurityError') return 'permission'
    if (name === 'NotFoundError' || name === 'DevicesNotFoundError') return 'capture'
    return 'runtime'
}

export function useAssistantSpeechInput({
    text,
    setText,
    setComposerCursor,
    textareaRef,
    disabled,
    isConnected,
    engine,
    scopeKey
}: {
    text: string
    setText: Dispatch<SetStateAction<string>>
    setComposerCursor: Dispatch<SetStateAction<number>>
    textareaRef: RefObject<HTMLTextAreaElement | null>
    disabled: boolean
    isConnected: boolean
    engine: AssistantTranscriptionEngine
    scopeKey: string
}) {
    const speechRecognitionCtor = useMemo(() => getSpeechRecognitionCtor(), [])
    const audioContextCtor = useMemo(() => getAudioContextCtor(), [])
    const recognitionRef = useRef<BrowserSpeechRecognition | null>(null)
    const recorderRuntimeRef = useRef<RecorderRuntime | null>(null)
    const recorderTimerRef = useRef<number | null>(null)
    const waveformLevelsRef = useRef<number[]>([])
    const waveformLastEmitAtRef = useRef(0)
    const textAtStartRef = useRef('')
    const finalTranscriptRef = useRef('')
    const requestIdRef = useRef(0)
    const mountedRef = useRef(true)
    const startingRef = useRef(false)
    const autoSubmitRef = useRef(false)
    const availableRef = useRef({ disabled, isConnected, engine, scopeKey })
    availableRef.current = { disabled, isConnected, engine, scopeKey }

    const [isStarting, setIsStarting] = useState(false)
    const [isRecording, setIsRecording] = useState(false)
    const [isTranscribing, setIsTranscribing] = useState(false)
    const [durationMs, setDurationMs] = useState(0)
    const [waveformLevels, setWaveformLevels] = useState<number[]>([])
    const [speechError, setSpeechError] = useState<string | null>(null)
    const [speechErrorKind, setSpeechErrorKind] = useState<AssistantSpeechErrorKind | null>(null)

    const isSupported = useMemo(() => {
        if (engine === 'browser') return Boolean(speechRecognitionCtor)
        return typeof navigator !== 'undefined'
            && Boolean(navigator.mediaDevices?.getUserMedia)
            && Boolean(audioContextCtor)
            && typeof window.devscope?.assistant?.transcribeVoice === 'function'
    }, [audioContextCtor, engine, speechRecognitionCtor])

    const durationLabel = useMemo(() => formatAssistantVoiceDuration(durationMs), [durationMs])

    const clearRecorderTimer = useCallback(() => {
        if (recorderTimerRef.current !== null) {
            window.clearInterval(recorderTimerRef.current)
            recorderTimerRef.current = null
        }
    }, [])

    const resetRecorderPresentation = useCallback(() => {
        waveformLevelsRef.current = []
        waveformLastEmitAtRef.current = 0
        autoSubmitRef.current = false
        setDurationMs(0)
        setWaveformLevels([])
    }, [])

    const teardownRecorder = useCallback(async (resetPresentation: boolean) => {
        const runtime = recorderRuntimeRef.current
        recorderRuntimeRef.current = null
        clearRecorderTimer()
        if (mountedRef.current) setIsRecording(false)

        if (!runtime) {
            if (resetPresentation) resetRecorderPresentation()
            return null
        }

        runtime.processorNode.onaudioprocess = null
        try { runtime.sourceNode.disconnect() } catch {}
        try { runtime.processorNode.disconnect() } catch {}
        try { runtime.silentGainNode.disconnect() } catch {}
        runtime.stream.getTracks().forEach((track) => track.stop())
        await runtime.audioContext.close().catch(() => undefined)
        if (resetPresentation) resetRecorderPresentation()

        return {
            chunks: runtime.chunks,
            sampleRateHz: runtime.sampleRateHz
        }
    }, [clearRecorderTimer, resetRecorderPresentation])

    const syncTextareaToEnd = useCallback((nextText: string) => {
        window.requestAnimationFrame(() => {
            const textarea = textareaRef.current
            if (!textarea) return
            textarea.focus()
            const cursor = nextText.length
            textarea.setSelectionRange(cursor, cursor)
            setComposerCursor(cursor)
        })
    }, [setComposerCursor, textareaRef])

    const applyTranscript = useCallback((spokenText: string) => {
        const nextText = appendSpeechToDraft(textAtStartRef.current, spokenText)
        setText(nextText)
        syncTextareaToEnd(nextText)
    }, [setText, syncTextareaToEnd])

    const stopBrowserRecording = useCallback(() => {
        recognitionRef.current?.stop()
        setIsRecording(false)
    }, [])

    const cancelBrowserRecording = useCallback(() => {
        const recognition = recognitionRef.current
        recognitionRef.current = null
        if (recognition) {
            recognition.onresult = null
            recognition.onerror = null
            recognition.onend = null
            recognition.abort()
        }
        if (mountedRef.current) setIsRecording(false)
    }, [])

    const startBrowserRecording = useCallback(() => {
        if (!speechRecognitionCtor || disabled || !isConnected || isRecording || isTranscribing || isStarting) return
        setSpeechError(null)
        setSpeechErrorKind(null)
        finalTranscriptRef.current = ''
        textAtStartRef.current = text

        const recognition = new speechRecognitionCtor()
        recognition.continuous = true
        recognition.interimResults = true
        recognition.maxAlternatives = 1
        recognition.lang = 'en-US'
        recognition.onresult = (event) => {
            let interimTranscript = ''
            for (let index = event.resultIndex; index < event.results.length; index += 1) {
                const result = event.results[index]
                const transcript = String(result?.[0]?.transcript || '').trim()
                if (!transcript) continue
                if (result.isFinal) {
                    finalTranscriptRef.current = [finalTranscriptRef.current.trim(), transcript].filter(Boolean).join(' ').trim()
                    interimTranscript = ''
                } else {
                    interimTranscript = transcript
                }
            }
            applyTranscript([finalTranscriptRef.current.trim(), interimTranscript.trim()].filter(Boolean).join(' ').trim())
        }
        recognition.onerror = (event) => {
            const normalized = normalizeBrowserSpeechError(String(event.error || ''))
            setSpeechErrorKind(normalized.kind)
            if (normalized.message) setSpeechError(normalized.message)
        }
        recognition.onend = () => {
            recognitionRef.current = null
            setIsRecording(false)
        }

        try {
            recognitionRef.current = recognition
            setIsRecording(true)
            recognition.start()
        } catch {
            recognitionRef.current = null
            setIsRecording(false)
            setSpeechErrorKind('runtime')
            setSpeechError('Browser dictation is unavailable in this runtime.')
        }
    }, [applyTranscript, disabled, isConnected, isRecording, isStarting, isTranscribing, speechRecognitionCtor, text])

    const startCodexRecording = useCallback(async () => {
        if (!audioContextCtor || disabled || !isConnected || isRecording || isTranscribing || startingRef.current) return
        if (!navigator.mediaDevices?.getUserMedia) {
            setSpeechErrorKind('runtime')
            setSpeechError('Microphone capture is unavailable in this runtime.')
            return
        }

        startingRef.current = true
        setIsStarting(true)
        setSpeechError(null)
        setSpeechErrorKind(null)
        resetRecorderPresentation()
        textAtStartRef.current = text
        requestIdRef.current += 1
        const recordingScopeKey = scopeKey

        let stream: MediaStream | null = null
        let audioContext: AudioContext | null = null
        let sourceNode: MediaStreamAudioSourceNode | null = null
        let processorNode: ScriptProcessorNode | null = null
        let silentGainNode: GainNode | null = null
        try {
            stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    channelCount: 1,
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true
                }
            })
            const latest = availableRef.current
            if (!mountedRef.current
                || latest.disabled
                || !latest.isConnected
                || latest.engine !== 'codex'
                || latest.scopeKey !== recordingScopeKey) {
                stream.getTracks().forEach((track) => track.stop())
                return
            }

            audioContext = new audioContextCtor()
            await audioContext.resume()
            sourceNode = audioContext.createMediaStreamSource(stream)
            processorNode = audioContext.createScriptProcessor(RECORDER_BUFFER_SIZE, 1, 1)
            silentGainNode = audioContext.createGain()
            silentGainNode.gain.value = 0

            const runtime: RecorderRuntime = {
                audioContext,
                sourceNode,
                processorNode,
                silentGainNode,
                stream,
                chunks: [],
                capturedSampleCount: 0,
                sampleRateHz: audioContext.sampleRate,
                startedAt: performance.now()
            }
            processorNode.onaudioprocess = (event) => {
                const input = event.inputBuffer
                const channelCount = Math.max(1, input.numberOfChannels)
                const mono = new Float32Array(input.length)
                for (let channelIndex = 0; channelIndex < input.numberOfChannels; channelIndex += 1) {
                    const channel = input.getChannelData(channelIndex)
                    for (let sampleIndex = 0; sampleIndex < input.length; sampleIndex += 1) {
                        mono[sampleIndex] += (channel[sampleIndex] ?? 0) / channelCount
                    }
                }
                const maximumSampleCount = Math.ceil(runtime.sampleRateHz * ASSISTANT_VOICE_MAX_DURATION_MS / 1000)
                const remainingSampleCount = Math.max(0, maximumSampleCount - runtime.capturedSampleCount)
                if (remainingSampleCount === 0) return
                const captured = remainingSampleCount < mono.length ? mono.slice(0, remainingSampleCount) : mono
                runtime.chunks.push(captured)
                runtime.capturedSampleCount += captured.length

                let sumSquares = 0
                for (const sample of captured) sumSquares += sample * sample
                const rawRms = Math.sqrt(sumSquares / Math.max(1, captured.length))
                const waveformLevel = normalizeAssistantVoiceWaveformLevel(rawRms)
                const now = performance.now()
                if (now - waveformLastEmitAtRef.current >= WAVEFORM_EMIT_INTERVAL_MS) {
                    waveformLastEmitAtRef.current = now
                    const next = [...waveformLevelsRef.current, waveformLevel].slice(-ASSISTANT_VOICE_MAX_WAVEFORM_SAMPLES)
                    waveformLevelsRef.current = next
                    setWaveformLevels(next)
                }
            }

            sourceNode.connect(processorNode)
            processorNode.connect(silentGainNode)
            silentGainNode.connect(audioContext.destination)
            recorderRuntimeRef.current = runtime
            setIsRecording(true)
            recorderTimerRef.current = window.setInterval(() => {
                const activeRuntime = recorderRuntimeRef.current
                if (!activeRuntime) return
                setDurationMs(Math.min(
                    ASSISTANT_VOICE_MAX_DURATION_MS,
                    Math.max(0, performance.now() - activeRuntime.startedAt)
                ))
            }, DURATION_UPDATE_INTERVAL_MS)
        } catch (error) {
            try { processorNode?.disconnect() } catch {}
            try { sourceNode?.disconnect() } catch {}
            try { silentGainNode?.disconnect() } catch {}
            stream?.getTracks().forEach((track) => track.stop())
            await audioContext?.close().catch(() => undefined)
            if (mountedRef.current) {
                setSpeechErrorKind(microphoneErrorKind(error))
                setSpeechError(describeAssistantMicrophoneError(error))
                resetRecorderPresentation()
            }
        } finally {
            startingRef.current = false
            if (mountedRef.current) setIsStarting(false)
        }
    }, [audioContextCtor, disabled, isConnected, isRecording, isTranscribing, resetRecorderPresentation, scopeKey, text])

    const submitCodexRecording = useCallback(async () => {
        if (!recorderRuntimeRef.current || isTranscribing) return
        const requestId = requestIdRef.current + 1
        requestIdRef.current = requestId
        setSpeechError(null)
        setSpeechErrorKind(null)
        setIsTranscribing(true)

        try {
            const recording = await teardownRecorder(false)
            if (!recording || requestIdRef.current !== requestId) return
            const payload = createAssistantVoicePayload(recording.chunks, recording.sampleRateHz)
            if (!payload) throw new Error('No audio was captured. Try recording again.')
            const result = await window.devscope.assistant.transcribeVoice(payload)
            if (requestIdRef.current !== requestId) return
            if (!result.success) throw new Error(result.error || 'Voice transcription failed.')
            if (!result.text.trim()) throw new Error('ChatGPT returned an empty transcription.')
            applyTranscript(result.text)
        } catch (error) {
            if (requestIdRef.current === requestId) {
                setSpeechErrorKind('runtime')
                setSpeechError(error instanceof Error ? error.message : 'Voice transcription failed.')
            }
        } finally {
            if (requestIdRef.current === requestId) {
                setIsTranscribing(false)
                resetRecorderPresentation()
            }
        }
    }, [applyTranscript, isTranscribing, resetRecorderPresentation, teardownRecorder])

    const cancelCodexRecording = useCallback(() => {
        requestIdRef.current += 1
        setIsTranscribing(false)
        void teardownRecorder(true)
    }, [teardownRecorder])

    const startRecording = useCallback(() => {
        if (engine === 'browser') {
            startBrowserRecording()
        } else {
            void startCodexRecording()
        }
    }, [engine, startBrowserRecording, startCodexRecording])

    const submitRecording = useCallback(() => {
        if (engine === 'browser') {
            stopBrowserRecording()
        } else {
            void submitCodexRecording()
        }
    }, [engine, stopBrowserRecording, submitCodexRecording])

    const cancelRecording = useCallback(() => {
        if (engine === 'browser') {
            cancelBrowserRecording()
        } else {
            cancelCodexRecording()
        }
    }, [cancelBrowserRecording, cancelCodexRecording, engine])

    const toggleRecording = useCallback(() => {
        if (isRecording) {
            submitRecording()
        } else {
            startRecording()
        }
    }, [isRecording, startRecording, submitRecording])

    useEffect(() => {
        if (engine !== 'codex' || !isRecording || durationMs < ASSISTANT_VOICE_MAX_DURATION_MS || autoSubmitRef.current) return
        autoSubmitRef.current = true
        submitRecording()
    }, [durationMs, engine, isRecording, submitRecording])

    useEffect(() => {
        if (!(disabled || !isConnected)) return
        requestIdRef.current += 1
        cancelBrowserRecording()
        cancelCodexRecording()
    }, [cancelBrowserRecording, cancelCodexRecording, disabled, isConnected])

    useEffect(() => {
        requestIdRef.current += 1
        cancelBrowserRecording()
        cancelCodexRecording()
        setSpeechError(null)
        setSpeechErrorKind(null)
    }, [cancelBrowserRecording, cancelCodexRecording, engine, scopeKey])

    useEffect(() => {
        mountedRef.current = true
        return () => {
            mountedRef.current = false
            requestIdRef.current += 1
            const recognition = recognitionRef.current
            recognitionRef.current = null
            if (recognition) {
                recognition.onresult = null
                recognition.onerror = null
                recognition.onend = null
                recognition.abort()
            }
            void teardownRecorder(false)
        }
    }, [teardownRecorder])

    return {
        isSupported,
        isStarting,
        isRecording,
        isTranscribing,
        durationMs,
        durationLabel,
        waveformLevels,
        speechError,
        speechErrorKind,
        startRecording,
        submitRecording,
        cancelRecording,
        toggleRecording,
        stopRecording: submitRecording
    }
}
