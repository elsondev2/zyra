import { useCallback, useEffect, useRef, useState } from 'react'
import type {
    AssistantRealtimeVoiceEvent,
    AssistantSendRealtimeVoiceMessageInput,
    InstructorOutputModality,
    InstructorRealtimeVoice
} from '@shared/assistant/contracts'
import { shouldPlayInstructorAudio } from './instructor-voice-preferences'
import { calculateInstructorVoiceActivity, smoothInstructorVoiceActivity } from './instructor-voice-activity'
import { applyRealtimeTranscriptEvent, type InstructorTranscriptEntry } from './instructor-voice-transcript'

export type InstructorVoiceStatus = 'idle' | 'requesting-microphone' | 'connecting' | 'active' | 'stopping' | 'error'

type RealtimeReadiness = {
    peerConnected: boolean
    dataChannelOpen: boolean
    sessionInitialized: boolean
    outputReady: boolean
}

type InstructorVoiceStartOptions = {
    instructions: string
    voice: InstructorRealtimeVoice
    outputModality: InstructorOutputModality
}

type AudioMeter = {
    analyser: AnalyserNode
    source: MediaStreamAudioSourceNode
    samples: Uint8Array<ArrayBuffer>
}

type CanonicalVoiceBinding = {
    conversationId: string
    sessionId: string
}

const ACTIVITY_UPDATE_INTERVAL_MS = 32

function createAudioMeter(context: AudioContext, stream: MediaStream): AudioMeter {
    const analyser = context.createAnalyser()
    analyser.fftSize = 256
    analyser.smoothingTimeConstant = 0.42
    const source = context.createMediaStreamSource(stream)
    source.connect(analyser)
    return {
        analyser,
        source,
        samples: new Uint8Array(new ArrayBuffer(analyser.fftSize))
    }
}

function readAudioMeter(meter: AudioMeter | null): number {
    if (!meter) return 0
    meter.analyser.getByteTimeDomainData(meter.samples)
    return calculateInstructorVoiceActivity(meter.samples)
}

function waitForIceGatheringComplete(peer: RTCPeerConnection, timeoutMs = 10_000): Promise<void> {
    if (peer.iceGatheringState === 'complete') return Promise.resolve()
    return new Promise((resolve, reject) => {
        let settled = false
        const finish = (error?: Error) => {
            if (settled) return
            settled = true
            window.clearTimeout(timer)
            peer.removeEventListener('icegatheringstatechange', handleChange)
            if (error) reject(error)
            else resolve()
        }
        const handleChange = () => {
            if (peer.iceGatheringState === 'complete') finish()
        }
        const timer = window.setTimeout(
            () => finish(new Error('Microphone connection setup timed out. Try again.')),
            timeoutMs
        )
        peer.addEventListener('icegatheringstatechange', handleChange)
    })
}

function isCanonicalTranscriptBridgeEvent(payload: Record<string, unknown>): boolean {
    const type = typeof payload.type === 'string' ? payload.type : ''
    return type === 'turn.created'
        || type === 'turn.delta'
        || type === 'turn.done'
        || type === 'conversation.item.created'
        || type.endsWith('.transcript.delta')
        || type.endsWith('.transcript.done')
        || type.endsWith('.input_audio_transcription.delta')
        || type.endsWith('.input_audio_transcription.completed')
}

function readDataChannelError(value: unknown): string | null {
    if (!value || typeof value !== 'object') return null
    const payload = value as Record<string, unknown>
    const type = typeof payload.type === 'string' ? payload.type : ''
    const error = payload.error && typeof payload.error === 'object'
        ? payload.error as Record<string, unknown>
        : null
    const message = typeof error?.message === 'string'
        ? error.message
        : (typeof payload.message === 'string' ? payload.message : null)
    if (error || type === 'error' || type.endsWith('.error')) {
        return message || 'Codex voice reported a connection error.'
    }
    return null
}

export function useInstructorVoiceSession(binding?: CanonicalVoiceBinding) {
    const peerRef = useRef<RTCPeerConnection | null>(null)
    const dataChannelRef = useRef<RTCDataChannel | null>(null)
    const mediaStreamRef = useRef<MediaStream | null>(null)
    const audioRef = useRef<HTMLAudioElement | null>(null)
    const meterContextRef = useRef<AudioContext | null>(null)
    const inputMeterRef = useRef<AudioMeter | null>(null)
    const outputMeterRef = useRef<AudioMeter | null>(null)
    const meterFrameRef = useRef<number | null>(null)
    const activityLevelRef = useRef(0)
    const lastActivityUpdateRef = useRef(0)
    const connectionTimerRef = useRef<number | null>(null)
    const mountedRef = useRef(true)
    const generationRef = useRef(0)
    const startPendingRef = useRef(false)
    const terminalHandledRef = useRef(false)
    const activeThreadIdRef = useRef<string | null>(null)
    const adapterSessionIdRef = useRef<string | null>(null)
    const bridgeQueueRef = useRef<Promise<void>>(Promise.resolve())
    const [status, setStatus] = useState<InstructorVoiceStatus>('idle')
    const [startedAt, setStartedAt] = useState<string | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [transcript, setTranscript] = useState<InstructorTranscriptEntry[]>([])
    const [realtimeVersion, setRealtimeVersion] = useState<string | null>(null)
    const [activityLevel, setActivityLevel] = useState(0)
    const [microphoneMuted, setMicrophoneMuted] = useState(false)

    const releaseLocalMedia = useCallback(() => {
        if (connectionTimerRef.current !== null) {
            window.clearTimeout(connectionTimerRef.current)
            connectionTimerRef.current = null
        }

        if (meterFrameRef.current !== null) {
            window.cancelAnimationFrame(meterFrameRef.current)
            meterFrameRef.current = null
        }
        inputMeterRef.current?.source.disconnect()
        inputMeterRef.current?.analyser.disconnect()
        outputMeterRef.current?.source.disconnect()
        outputMeterRef.current?.analyser.disconnect()
        inputMeterRef.current = null
        outputMeterRef.current = null
        const meterContext = meterContextRef.current
        meterContextRef.current = null
        if (meterContext && meterContext.state !== 'closed') void meterContext.close().catch(() => undefined)
        activityLevelRef.current = 0
        lastActivityUpdateRef.current = 0
        if (mountedRef.current) setActivityLevel(0)

        const dataChannel = dataChannelRef.current
        dataChannelRef.current = null
        if (dataChannel) {
            dataChannel.onopen = null
            dataChannel.onmessage = null
            dataChannel.onerror = null
            dataChannel.onclose = null
            if (dataChannel.readyState !== 'closed') dataChannel.close()
        }

        const peer = peerRef.current
        peerRef.current = null
        if (peer) {
            peer.ontrack = null
            peer.onconnectionstatechange = null
            peer.close()
        }

        for (const track of mediaStreamRef.current?.getTracks() || []) track.stop()
        mediaStreamRef.current = null
        if (mountedRef.current) setMicrophoneMuted(false)

        if (audioRef.current) {
            audioRef.current.pause()
            audioRef.current.srcObject = null
            audioRef.current = null
        }
    }, [])

    const beginActivityMeter = useCallback((stream: MediaStream) => {
        if (typeof AudioContext === 'undefined') return
        try {
            const context = new AudioContext()
            meterContextRef.current = context
            inputMeterRef.current = createAudioMeter(context, stream)
            void context.resume().catch(() => undefined)

            const update = (timestamp: number) => {
                if (!mountedRef.current || meterContextRef.current !== context || context.state === 'closed') return
                const measured = Math.max(
                    readAudioMeter(inputMeterRef.current),
                    readAudioMeter(outputMeterRef.current)
                )
                const smoothed = smoothInstructorVoiceActivity(activityLevelRef.current, measured)
                activityLevelRef.current = smoothed < 0.004 ? 0 : smoothed
                if (timestamp - lastActivityUpdateRef.current >= ACTIVITY_UPDATE_INTERVAL_MS) {
                    lastActivityUpdateRef.current = timestamp
                    setActivityLevel(activityLevelRef.current)
                }
                meterFrameRef.current = window.requestAnimationFrame(update)
            }
            meterFrameRef.current = window.requestAnimationFrame(update)
        } catch {
            // Voice remains usable if visual metering is unavailable.
        }
    }, [])

    const attachOutputActivityMeter = useCallback((stream: MediaStream) => {
        const context = meterContextRef.current
        if (!context || context.state === 'closed') return
        try {
            outputMeterRef.current?.source.disconnect()
            outputMeterRef.current?.analyser.disconnect()
            outputMeterRef.current = createAudioMeter(context, stream)
        } catch {
            outputMeterRef.current = null
        }
    }, [])

    const stopRemoteSilently = useCallback(() => {
        void bridgeQueueRef.current
            .catch(() => undefined)
            .then(() => window.devscope.assistant.stopRealtimeVoice())
            .catch(() => undefined)
    }, [])

    const endWithError = useCallback((message: string) => {
        if (terminalHandledRef.current) return
        terminalHandledRef.current = true
        generationRef.current += 1
        activeThreadIdRef.current = null
        adapterSessionIdRef.current = null
        releaseLocalMedia()
        if (mountedRef.current) {
            setError(message)
            setStatus('error')
        }
        stopRemoteSilently()
    }, [releaseLocalMedia, stopRemoteSilently])

    useEffect(() => {
        mountedRef.current = true
        const unsubscribe = window.devscope.assistant.onRealtimeVoiceEvent((event: AssistantRealtimeVoiceEvent) => {
            if (!mountedRef.current || terminalHandledRef.current) return
            if (activeThreadIdRef.current && event.threadId && event.threadId !== activeThreadIdRef.current) return

            if (event.type === 'session.started') {
                if (event.realtimeVersion && event.realtimeVersion !== 'v3') {
                    endWithError(`Codex connected with unsupported voice version ${event.realtimeVersion}.`)
                    return
                }
                setRealtimeVersion(event.realtimeVersion || null)
                return
            }
            if (event.type === 'composer.response.delta') {
                const entryId = `composer-response-${event.turnId}`
                setTranscript((current) => {
                    const index = current.findIndex((entry) => entry.id === entryId)
                    if (index < 0) {
                        return [...current, {
                            id: entryId,
                            role: 'assistant',
                            text: event.delta,
                            final: false
                        }]
                    }
                    const next = current.slice()
                    next[index] = { ...next[index], text: `${next[index].text}${event.delta}` }
                    return next
                })
                return
            }
            if (event.type === 'composer.response.done') {
                const entryId = `composer-response-${event.turnId}`
                setTranscript((current) => {
                    const index = current.findIndex((entry) => entry.id === entryId)
                    const text = event.text.trim() || event.error || 'The typed voice turn ended without a response.'
                    if (index < 0) {
                        return [...current, {
                            id: entryId,
                            role: 'assistant',
                            text,
                            final: true
                        }]
                    }
                    const next = current.slice()
                    next[index] = { ...next[index], text, final: true }
                    return next
                })
                return
            }
            if (event.type === 'session.error') {
                endWithError(event.message)
                return
            }
            if (event.type === 'session.closed') {
                terminalHandledRef.current = true
                generationRef.current += 1
                activeThreadIdRef.current = null
                adapterSessionIdRef.current = null
                releaseLocalMedia()
                setStatus('idle')
            }
        })

        return () => {
            mountedRef.current = false
            terminalHandledRef.current = true
            generationRef.current += 1
            activeThreadIdRef.current = null
            adapterSessionIdRef.current = null
            unsubscribe()
            releaseLocalMedia()
            stopRemoteSilently()
        }
    }, [endWithError, releaseLocalMedia, stopRemoteSilently])

    const start = useCallback(async (options: InstructorVoiceStartOptions) => {
        if (startPendingRef.current || peerRef.current) return

        startPendingRef.current = true
        terminalHandledRef.current = false
        const generation = ++generationRef.current
        activeThreadIdRef.current = null
        adapterSessionIdRef.current = null
        bridgeQueueRef.current = Promise.resolve()
        setStartedAt(new Date().toISOString())
        setError(null)
        setRealtimeVersion(null)
        setTranscript([])
        setMicrophoneMuted(false)
        releaseLocalMedia()

        const isCurrent = () => mountedRef.current
            && generationRef.current === generation
            && !terminalHandledRef.current

        const failConnection = (message: string) => {
            if (!isCurrent()) return
            endWithError(message)
        }

        try {
            if (!navigator.mediaDevices?.getUserMedia || typeof RTCPeerConnection === 'undefined') {
                throw new Error('WebRTC microphone access is unavailable in this window.')
            }

            setStatus('requesting-microphone')
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true
                }
            })
            if (!isCurrent()) {
                for (const track of stream.getTracks()) track.stop()
                return
            }

            beginActivityMeter(stream)

            const readiness: RealtimeReadiness = {
                peerConnected: false,
                dataChannelOpen: false,
                sessionInitialized: false,
                outputReady: !shouldPlayInstructorAudio(options.outputModality)
            }
            const peer = new RTCPeerConnection()
            const dataChannel = peer.createDataChannel('oai-events')
            const audio = new Audio()
            audio.autoplay = true

            const markActiveIfReady = (): boolean => {
                if (!isCurrent()) return false
                const ready = readiness.peerConnected
                    && readiness.dataChannelOpen
                    && readiness.sessionInitialized
                    && readiness.outputReady
                if (ready) {
                    if (connectionTimerRef.current !== null) {
                        window.clearTimeout(connectionTimerRef.current)
                        connectionTimerRef.current = null
                    }
                    setStatus('active')
                }
                return ready
            }

            dataChannel.onopen = () => {
                readiness.dataChannelOpen = true
                markActiveIfReady()
            }
            dataChannel.onmessage = (event) => {
                if (!isCurrent() || typeof event.data !== 'string') return
                try {
                    const payload = JSON.parse(event.data) as Record<string, unknown>
                    const dataError = readDataChannelError(payload)
                    if (dataError) {
                        failConnection(dataError)
                        return
                    }
                    if (payload.type === 'session.started' || payload.type === 'session.updated') {
                        readiness.sessionInitialized = true
                        markActiveIfReady()
                    }
                    setTranscript((current) => applyRealtimeTranscriptEvent(current, payload))
                    const adapterSessionId = adapterSessionIdRef.current
                    if (binding && adapterSessionId && isCanonicalTranscriptBridgeEvent(payload)) {
                        // Invoke IPC immediately so any later navigation request is
                        // ordered after this provider event in Electron. The aggregate
                        // promise remains only as the local Stop/unmount drain barrier.
                        const ingest = window.devscope.assistant.ingestRealtimeVoiceEvent({
                            adapterSessionId,
                            payload
                        }).then((result) => {
                            if (!result.success) throw new Error(result.error || 'Voice transcript bridge failed.')
                        })
                        const bridge = Promise.all([bridgeQueueRef.current, ingest]).then(() => undefined)
                        bridgeQueueRef.current = bridge
                        void bridge.catch((bridgeError) => failConnection(
                            bridgeError instanceof Error ? bridgeError.message : 'Voice transcript bridge failed.'
                        ))
                    }
                } catch {
                    // Ignore unrelated non-JSON realtime payloads.
                }
            }
            dataChannel.onerror = () => failConnection('The Codex voice data connection failed.')
            dataChannel.onclose = () => {
                if (isCurrent()) failConnection('The Codex voice data connection closed.')
            }

            peer.ontrack = (event) => {
                if (!isCurrent()) return
                const remoteStream = event.streams[0] || new MediaStream([event.track])
                attachOutputActivityMeter(remoteStream)
                if (!shouldPlayInstructorAudio(options.outputModality)) {
                    readiness.outputReady = true
                    markActiveIfReady()
                    return
                }
                audio.srcObject = remoteStream
                void audio.play()
                    .then(() => {
                        readiness.outputReady = true
                        markActiveIfReady()
                    })
                    .catch(() => failConnection('Zyra connected, but could not play the instructor audio.'))
            }
            peer.onconnectionstatechange = () => {
                if (!isCurrent()) return
                if (peer.connectionState === 'connected') {
                    readiness.peerConnected = true
                    markActiveIfReady()
                } else if (peer.connectionState === 'failed') {
                    failConnection('The Codex voice connection failed.')
                }
            }
            for (const track of stream.getAudioTracks()) peer.addTrack(track, stream)

            mediaStreamRef.current = stream
            peerRef.current = peer
            dataChannelRef.current = dataChannel
            audioRef.current = audio
            setStatus('connecting')

            const offer = await peer.createOffer()
            await peer.setLocalDescription(offer)
            await waitForIceGatheringComplete(peer)
            if (!isCurrent()) return

            const offerSdp = peer.localDescription?.sdp
            if (!offerSdp) throw new Error('The browser could not create a WebRTC offer.')

            const result = await window.devscope.assistant.startRealtimeVoice({
                conversationId: binding?.conversationId,
                sessionId: binding?.sessionId,
                transcriptBridgeVersion: binding ? 1 : undefined,
                sdp: offerSdp,
                instructions: options.instructions,
                voice: options.voice,
                outputModality: options.outputModality
            })
            if (!isCurrent()) {
                stopRemoteSilently()
                return
            }
            if (!result.success) throw new Error(result.error || 'Codex realtime voice could not start.')
            if (result.realtimeVersion !== 'v3') {
                throw new Error(`Codex connected with unsupported voice version ${result.realtimeVersion || 'unknown'}.`)
            }

            activeThreadIdRef.current = result.threadId
            adapterSessionIdRef.current = result.adapterSessionId || null
            readiness.sessionInitialized = true
            setRealtimeVersion(result.realtimeVersion)
            await peer.setRemoteDescription({ type: 'answer', sdp: result.sdp })
            if (!isCurrent()) return

            if (!markActiveIfReady() && connectionTimerRef.current === null) {
                connectionTimerRef.current = window.setTimeout(
                    () => failConnection('Codex voice connected, but media did not become ready.'),
                    30_000
                )
            }
        } catch (startError) {
            if (isCurrent()) {
                endWithError(startError instanceof Error ? startError.message : 'Voice connection failed.')
            }
        } finally {
            startPendingRef.current = false
        }
    }, [attachOutputActivityMeter, beginActivityMeter, binding, endWithError, releaseLocalMedia, stopRemoteSilently])

    const toggleMicrophone = useCallback(() => {
        const stream = mediaStreamRef.current
        if (!stream) return
        const nextMuted = !microphoneMuted
        for (const track of stream.getAudioTracks()) track.enabled = !nextMuted
        setMicrophoneMuted(nextMuted)
    }, [microphoneMuted])

    const sendMessage = useCallback(async (input: AssistantSendRealtimeVoiceMessageInput) => {
        if (status !== 'active') {
            return { success: false as const, error: 'Wait for the voice session to finish connecting.' }
        }

        const clientMessageId = `voice-typed-${crypto.randomUUID()}`
        const clientMessageCreatedAt = new Date().toISOString()
        const localEntryId = `local-composer-${clientMessageId}`
        const imageCount = input.images?.length || 0
        setTranscript((current) => [...current, {
            id: localEntryId,
            role: 'user',
            text: input.text?.trim() || `Shared ${imageCount === 1 ? 'an image' : `${imageCount} images`}.`,
            final: true,
            images: input.images?.map((image, index) => ({
                id: `${localEntryId}:${index}`,
                name: image.name || `Image ${index + 1}`,
                dataUrl: image.dataUrl
            }))
        }])

        try {
            const result = await window.devscope.assistant.sendRealtimeVoiceMessage({
                ...input,
                clientMessageId,
                clientMessageCreatedAt
            })
            if (result.success) return { success: true as const }
            setTranscript((current) => current.filter((entry) => entry.id !== localEntryId))
            return { success: false as const, error: result.error || 'The voice message could not be sent.' }
        } catch (sendError) {
            setTranscript((current) => current.filter((entry) => entry.id !== localEntryId))
            return {
                success: false as const,
                error: sendError instanceof Error ? sendError.message : 'The voice message could not be sent.'
            }
        }
    }, [status])

    const stop = useCallback(async () => {
        if (status === 'idle' || status === 'stopping') return

        terminalHandledRef.current = true
        generationRef.current += 1
        activeThreadIdRef.current = null
        adapterSessionIdRef.current = null
        setStatus('stopping')
        releaseLocalMedia()

        try {
            const bridgeError = await bridgeQueueRef.current.then(() => null).catch((error) => error)
            const result = await window.devscope.assistant.stopRealtimeVoice()
            if (!result.success) throw new Error(result.error || 'Codex voice could not stop cleanly.')
            if (bridgeError) throw bridgeError
            if (mountedRef.current) setStatus('idle')
        } catch (stopError) {
            if (!mountedRef.current) return
            setError(stopError instanceof Error ? stopError.message : 'Voice session could not stop cleanly.')
            setStatus('error')
        }
    }, [releaseLocalMedia, status])

    return {
        status,
        startedAt,
        error,
        transcript,
        realtimeVersion,
        activityLevel,
        microphoneMuted,
        start,
        stop,
        sendMessage,
        toggleMicrophone,
        clearTranscript: () => setTranscript([])
    }
}
