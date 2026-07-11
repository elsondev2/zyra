import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type RefObject, type SetStateAction } from 'react'
import type { AssistantTranscriptionEngine } from '@/lib/settings'

type AssistantSpeechErrorKind =
    | 'permission'
    | 'capture'
    | 'network'
    | 'runtime'
    | 'no-speech'
    | 'unknown'

type BrowserSpeechRecognitionAlternative = {
    transcript: string
}

type BrowserSpeechRecognitionResult = {
    isFinal: boolean
    length: number
    [index: number]: BrowserSpeechRecognitionAlternative
}

type BrowserSpeechRecognitionEvent = {
    resultIndex: number
    results: ArrayLike<BrowserSpeechRecognitionResult>
}

type BrowserSpeechRecognitionErrorEvent = {
    error: string
}

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
}

const getSpeechRecognitionCtor = () => {
    if (typeof window === 'undefined') return null
    const recognitionWindow = window as SpeechRecognitionWindow
    return recognitionWindow.SpeechRecognition || recognitionWindow.webkitSpeechRecognition || null
}

const appendSpeechToDraft = (baseText: string, spokenText: string) => {
    const normalizedSpokenText = spokenText.trim()
    if (!normalizedSpokenText) return baseText
    if (!baseText.trim()) return normalizedSpokenText
    return /\s$/.test(baseText) ? `${baseText}${normalizedSpokenText}` : `${baseText} ${normalizedSpokenText}`
}

const normalizeSpeechError = (error: string): { kind: AssistantSpeechErrorKind; message: string | null } => {
    switch (error) {
        case 'not-allowed':
        case 'service-not-allowed':
            return { kind: 'permission', message: 'Microphone permission was denied.' }
        case 'audio-capture':
            return { kind: 'capture', message: 'No microphone was found.' }
        case 'network':
            return { kind: 'network', message: 'Voice input needs the runtime speech service. Check your connection and try again.' }
        case 'no-speech':
            return { kind: 'no-speech', message: null }
        default:
            return { kind: 'unknown', message: 'Voice input failed.' }
    }
}

const mergeFloat32Chunks = (chunks: Float32Array[]) => {
    const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0)
    const merged = new Float32Array(totalLength)
    let offset = 0
    for (const chunk of chunks) {
        merged.set(chunk, offset)
        offset += chunk.length
    }
    return merged
}

const downsampleBuffer = (buffer: Float32Array, sampleRate: number, targetSampleRate: number) => {
    if (targetSampleRate === sampleRate) return buffer
    const sampleRateRatio = sampleRate / targetSampleRate
    const newLength = Math.round(buffer.length / sampleRateRatio)
    const result = new Float32Array(newLength)
    let offsetResult = 0
    let offsetBuffer = 0
    while (offsetResult < result.length) {
        const nextOffsetBuffer = Math.round((offsetResult + 1) * sampleRateRatio)
        let accum = 0
        let count = 0
        for (let index = offsetBuffer; index < nextOffsetBuffer && index < buffer.length; index += 1) {
            accum += buffer[index]
            count += 1
        }
        result[offsetResult] = count > 0 ? accum / count : 0
        offsetResult += 1
        offsetBuffer = nextOffsetBuffer
    }
    return result
}

const encodeWav = (samples: Float32Array, sampleRate: number) => {
    const buffer = new ArrayBuffer(44 + samples.length * 2)
    const view = new DataView(buffer)
    const writeString = (offset: number, value: string) => {
        for (let index = 0; index < value.length; index += 1) {
            view.setUint8(offset + index, value.charCodeAt(index))
        }
    }

    writeString(0, 'RIFF')
    view.setUint32(4, 36 + samples.length * 2, true)
    writeString(8, 'WAVE')
    writeString(12, 'fmt ')
    view.setUint32(16, 16, true)
    view.setUint16(20, 1, true)
    view.setUint16(22, 1, true)
    view.setUint32(24, sampleRate, true)
    view.setUint32(28, sampleRate * 2, true)
    view.setUint16(32, 2, true)
    view.setUint16(34, 16, true)
    writeString(36, 'data')
    view.setUint32(40, samples.length * 2, true)

    let offset = 44
    for (let index = 0; index < samples.length; index += 1) {
        const clamped = Math.max(-1, Math.min(1, samples[index]))
        view.setInt16(offset, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true)
        offset += 2
    }

    return buffer
}

export function useAssistantSpeechInput({
    text,
    setText,
    setComposerCursor,
    textareaRef,
    disabled,
    isConnected,
    engine
}: {
    text: string
    setText: Dispatch<SetStateAction<string>>
    setComposerCursor: Dispatch<SetStateAction<number>>
    textareaRef: RefObject<HTMLTextAreaElement | null>
    disabled: boolean
    isConnected: boolean
    engine: AssistantTranscriptionEngine
}) {
    const speechRecognitionCtor = useMemo(() => getSpeechRecognitionCtor(), [])
    const recognitionRef = useRef<BrowserSpeechRecognition | null>(null)
    const textAtStartRef = useRef('')
    const finalTranscriptRef = useRef('')
    const localAudioContextRef = useRef<AudioContext | null>(null)
    const localMediaStreamRef = useRef<MediaStream | null>(null)
    const localSourceRef = useRef<MediaStreamAudioSourceNode | null>(null)
    const localProcessorRef = useRef<ScriptProcessorNode | null>(null)
    const localGainRef = useRef<GainNode | null>(null)
    const localChunksRef = useRef<Float32Array[]>([])
    const localSampleRateRef = useRef(44100)
    const localLiveIntervalRef = useRef<number | null>(null)
    const localLastTranscribedSampleCountRef = useRef(0)
    const localTranscriptionSequenceRef = useRef(0)
    const localLiveTranscriptionInFlightRef = useRef(false)
    const [isRecording, setIsRecording] = useState(false)
    const [isTranscribing, setIsTranscribing] = useState(false)
    const [speechError, setSpeechError] = useState<string | null>(null)
    const [speechErrorKind, setSpeechErrorKind] = useState<AssistantSpeechErrorKind | null>(null)

    const isSupported = useMemo(() => {
        if (engine === 'browser') return Boolean(speechRecognitionCtor)
        return typeof navigator !== 'undefined'
            && Boolean(navigator.mediaDevices?.getUserMedia)
            && typeof window !== 'undefined'
            && Boolean(window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext)
    }, [engine, speechRecognitionCtor])

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

    const cleanupLocalRecording = useCallback(async () => {
        if (localLiveIntervalRef.current != null) {
            window.clearInterval(localLiveIntervalRef.current)
            localLiveIntervalRef.current = null
        }
        try {
            localProcessorRef.current?.disconnect()
            localSourceRef.current?.disconnect()
            localGainRef.current?.disconnect()
        } catch {}

        localMediaStreamRef.current?.getTracks().forEach((track) => track.stop())

        if (localAudioContextRef.current) {
            await localAudioContextRef.current.close().catch(() => undefined)
        }

        localProcessorRef.current = null
        localSourceRef.current = null
        localGainRef.current = null
        localMediaStreamRef.current = null
        localAudioContextRef.current = null
    }, [])

    const transcribeLocalSnapshot = useCallback(async (chunks: Float32Array[], sampleRate: number, options?: { final?: boolean }) => {
        if (!chunks.length) return
        const requestId = ++localTranscriptionSequenceRef.current
        if (!options?.final) {
            localLiveTranscriptionInFlightRef.current = true
        } else {
            setIsTranscribing(true)
        }

        try {
            const merged = mergeFloat32Chunks(chunks)
            const downsampled = downsampleBuffer(merged, sampleRate, 16000)
            const audioBuffer = encodeWav(downsampled, 16000)
            const result = await window.devscope.assistant.transcribeAudioWithLocalModel({ audioBuffer })
            if (!result.success) {
                throw new Error(result.error || 'Local transcription failed.')
            }
            if (requestId === localTranscriptionSequenceRef.current && result.text.trim()) {
                applyTranscript(result.text)
            }
        } catch (error) {
            if (options?.final || requestId === localTranscriptionSequenceRef.current) {
                setSpeechError(error instanceof Error ? error.message : 'Local transcription failed.')
            }
        } finally {
            if (!options?.final) {
                localLiveTranscriptionInFlightRef.current = false
            } else {
                setIsTranscribing(false)
            }
        }
    }, [applyTranscript])

    const stopBrowserRecording = useCallback(() => {
        recognitionRef.current?.stop()
        setIsRecording(false)
    }, [])

    const stopLocalRecording = useCallback(async () => {
        setIsRecording(false)
        const contextSampleRate = localSampleRateRef.current || 44100
        const chunksSnapshot = localChunksRef.current.slice()
        localChunksRef.current = []
        localLastTranscribedSampleCountRef.current = 0
        await cleanupLocalRecording()

        if (!chunksSnapshot.length) return
        await transcribeLocalSnapshot(chunksSnapshot, contextSampleRate, { final: true })
    }, [cleanupLocalRecording, transcribeLocalSnapshot])

    const stopRecording = useCallback(async () => {
        if (engine === 'browser') {
            stopBrowserRecording()
            return
        }
        await stopLocalRecording()
    }, [engine, stopBrowserRecording, stopLocalRecording])

    const startBrowserRecording = useCallback(() => {
        if (!speechRecognitionCtor || disabled || !isConnected || isRecording || isTranscribing) return
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
            const nextTranscript = [finalTranscriptRef.current.trim(), interimTranscript.trim()].filter(Boolean).join(' ').trim()
            applyTranscript(nextTranscript)
        }

        recognition.onerror = (event) => {
            const normalizedError = normalizeSpeechError(String(event.error || ''))
            setSpeechErrorKind(normalizedError.kind)
            if (normalizedError.message) setSpeechError(normalizedError.message)
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
            setSpeechError('Voice input is unavailable in this runtime.')
        }
    }, [applyTranscript, disabled, isConnected, isRecording, isTranscribing, speechRecognitionCtor, text])

    const startLocalRecording = useCallback(async () => {
        if (disabled || !isConnected || isRecording || isTranscribing) return
        if (!navigator.mediaDevices?.getUserMedia) {
            setSpeechErrorKind('runtime')
            setSpeechError('Microphone capture is unavailable in this runtime.')
            return
        }

        setSpeechError(null)
        setSpeechErrorKind(null)
        textAtStartRef.current = text
        localChunksRef.current = []
        localLastTranscribedSampleCountRef.current = 0

        const AudioContextCtor = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
        if (!AudioContextCtor) {
            setSpeechErrorKind('runtime')
            setSpeechError('Audio capture is unavailable in this runtime.')
            return
        }

        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
            const audioContext = new AudioContextCtor()
            const source = audioContext.createMediaStreamSource(stream)
            const processor = audioContext.createScriptProcessor(4096, 1, 1)
            const gainNode = audioContext.createGain()
            gainNode.gain.value = 0

            processor.onaudioprocess = (event) => {
                const channelData = event.inputBuffer.getChannelData(0)
                localChunksRef.current.push(new Float32Array(channelData))
            }

            source.connect(processor)
            processor.connect(gainNode)
            gainNode.connect(audioContext.destination)

            localMediaStreamRef.current = stream
            localAudioContextRef.current = audioContext
            localSampleRateRef.current = audioContext.sampleRate
            localSourceRef.current = source
            localProcessorRef.current = processor
            localGainRef.current = gainNode
            setIsRecording(true)
            localLiveIntervalRef.current = window.setInterval(() => {
                const sampleCount = localChunksRef.current.reduce((sum, chunk) => sum + chunk.length, 0)
                const minimumNewSamples = Math.round(localSampleRateRef.current * 1.2)
                if (sampleCount < minimumNewSamples) return
                if (sampleCount - localLastTranscribedSampleCountRef.current < minimumNewSamples) return
                if (localLiveTranscriptionInFlightRef.current) return
                localLastTranscribedSampleCountRef.current = sampleCount
                void transcribeLocalSnapshot(localChunksRef.current.slice(), localSampleRateRef.current)
            }, 1400)
        } catch (error) {
            await cleanupLocalRecording()
            setSpeechErrorKind('runtime')
            setSpeechError(error instanceof Error ? error.message : 'Failed to start local recording.')
        }
    }, [cleanupLocalRecording, disabled, isConnected, isRecording, isTranscribing, text, transcribeLocalSnapshot])

    const toggleRecording = useCallback(() => {
        if (isRecording) {
            void stopRecording()
            return
        }
        if (engine === 'browser') {
            startBrowserRecording()
            return
        }
        void startLocalRecording()
    }, [engine, isRecording, startBrowserRecording, startLocalRecording, stopRecording])

    useEffect(() => {
        if (!(disabled || !isConnected)) return
        if (engine === 'browser') {
            recognitionRef.current?.abort()
            recognitionRef.current = null
            setIsRecording(false)
            return
        }
        if (isRecording) {
            void stopLocalRecording()
        }
    }, [disabled, engine, isConnected, isRecording, stopLocalRecording])

    useEffect(() => () => {
        recognitionRef.current?.abort()
        recognitionRef.current = null
        void cleanupLocalRecording()
    }, [cleanupLocalRecording])

    return {
        isSupported,
        isRecording,
        isTranscribing,
        speechError,
        speechErrorKind,
        toggleRecording,
        stopRecording
    }
}
