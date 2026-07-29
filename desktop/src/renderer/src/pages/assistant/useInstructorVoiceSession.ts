import { useCallback, useEffect, useRef, useState } from 'react'
import type { AssistantRealtimeVoiceEvent } from '@shared/assistant/contracts'

type InstructorVoiceStatus = 'idle' | 'requesting-microphone' | 'connecting' | 'active' | 'stopping' | 'error'

export interface InstructorTranscriptEntry {
    id: number
    role: string
    text: string
    final: boolean
}

function waitForIceGatheringComplete(peer: RTCPeerConnection, timeoutMs = 3_000): Promise<void> {
    if (peer.iceGatheringState === 'complete') return Promise.resolve()
    return new Promise((resolve) => {
        let settled = false
        const finish = () => {
            if (settled) return
            settled = true
            clearTimeout(timer)
            peer.removeEventListener('icegatheringstatechange', handleChange)
            resolve()
        }
        const handleChange = () => {
            if (peer.iceGatheringState === 'complete') finish()
        }
        const timer = window.setTimeout(finish, timeoutMs)
        peer.addEventListener('icegatheringstatechange', handleChange)
    })
}

function appendTranscriptDelta(entries: InstructorTranscriptEntry[], role: string, delta: string): InstructorTranscriptEntry[] {
    const last = entries[entries.length - 1]
    if (last && !last.final && last.role === role) {
        return [...entries.slice(0, -1), { ...last, text: `${last.text}${delta}` }]
    }
    return [...entries, { id: Date.now() + entries.length, role, text: delta, final: false }]
}

function completeTranscript(entries: InstructorTranscriptEntry[], role: string, text: string): InstructorTranscriptEntry[] {
    const last = entries[entries.length - 1]
    if (last && !last.final && last.role === role) {
        return [...entries.slice(0, -1), { ...last, text, final: true }]
    }
    return [...entries, { id: Date.now() + entries.length, role, text, final: true }]
}

export function useInstructorVoiceSession() {
    const peerRef = useRef<RTCPeerConnection | null>(null)
    const mediaStreamRef = useRef<MediaStream | null>(null)
    const audioRef = useRef<HTMLAudioElement | null>(null)
    const mountedRef = useRef(true)
    const [status, setStatus] = useState<InstructorVoiceStatus>('idle')
    const [error, setError] = useState<string | null>(null)
    const [transcript, setTranscript] = useState<InstructorTranscriptEntry[]>([])

    const releaseLocalMedia = useCallback(() => {
        peerRef.current?.close()
        peerRef.current = null
        for (const track of mediaStreamRef.current?.getTracks() || []) track.stop()
        mediaStreamRef.current = null
        if (audioRef.current) {
            audioRef.current.pause()
            audioRef.current.srcObject = null
            audioRef.current = null
        }
    }, [])

    useEffect(() => {
        mountedRef.current = true
        const unsubscribe = window.devscope.assistant.onRealtimeVoiceEvent((event: AssistantRealtimeVoiceEvent) => {
            if (!mountedRef.current) return
            if (event.type === 'session.started') {
                setStatus('active')
                return
            }
            if (event.type === 'transcript.delta') {
                setTranscript((current) => appendTranscriptDelta(current, event.role, event.delta))
                return
            }
            if (event.type === 'transcript.done') {
                setTranscript((current) => completeTranscript(current, event.role, event.text))
                return
            }
            if (event.type === 'session.error') {
                setError(event.message)
                setStatus('error')
                releaseLocalMedia()
                return
            }
            if (event.type === 'session.closed') {
                releaseLocalMedia()
                setStatus((current) => current === 'error' ? current : 'idle')
            }
        })

        return () => {
            mountedRef.current = false
            unsubscribe()
            releaseLocalMedia()
            void window.devscope.assistant.stopRealtimeVoice().catch(() => undefined)
        }
    }, [releaseLocalMedia])

    const start = useCallback(async (instructions: string) => {
        if (status === 'connecting' || status === 'requesting-microphone' || status === 'active' || status === 'stopping') return
        setError(null)
        setTranscript([])
        releaseLocalMedia()

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
            if (!mountedRef.current) {
                for (const track of stream.getTracks()) track.stop()
                return
            }

            const peer = new RTCPeerConnection()
            const audio = new Audio()
            audio.autoplay = true
            peer.ontrack = (event) => {
                audio.srcObject = event.streams[0] || new MediaStream([event.track])
                void audio.play().catch(() => undefined)
            }
            peer.onconnectionstatechange = () => {
                if (!mountedRef.current) return
                if (peer.connectionState === 'failed' || peer.connectionState === 'disconnected') {
                    setError(`Voice connection ${peer.connectionState}.`)
                    setStatus('error')
                    releaseLocalMedia()
                }
            }
            peer.createDataChannel('oai-events')
            for (const track of stream.getAudioTracks()) peer.addTrack(track, stream)

            mediaStreamRef.current = stream
            peerRef.current = peer
            audioRef.current = audio
            setStatus('connecting')

            const offer = await peer.createOffer()
            await peer.setLocalDescription(offer)
            await waitForIceGatheringComplete(peer)
            const offerSdp = peer.localDescription?.sdp
            if (!offerSdp) throw new Error('The browser could not create a WebRTC offer.')

            const result = await window.devscope.assistant.startRealtimeVoice({
                sdp: offerSdp,
                instructions
            })
            if (!result.success) throw new Error(result.error || 'Codex realtime voice could not start.')
            if (!mountedRef.current || peerRef.current !== peer) return

            await peer.setRemoteDescription({ type: 'answer', sdp: result.sdp })
            setStatus('active')
        } catch (startError) {
            releaseLocalMedia()
            if (!mountedRef.current) return
            setError(startError instanceof Error ? startError.message : 'Voice connection failed.')
            setStatus('error')
            void window.devscope.assistant.stopRealtimeVoice().catch(() => undefined)
        }
    }, [releaseLocalMedia, status])

    const stop = useCallback(async () => {
        if (status === 'idle' || status === 'stopping') return
        setStatus('stopping')
        try {
            await window.devscope.assistant.stopRealtimeVoice()
        } finally {
            releaseLocalMedia()
            if (mountedRef.current) setStatus('idle')
        }
    }, [releaseLocalMedia, status])

    return {
        status,
        error,
        transcript,
        start,
        stop,
        clearTranscript: () => setTranscript([])
    }
}
