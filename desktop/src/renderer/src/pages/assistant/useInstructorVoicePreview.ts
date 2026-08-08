import { useCallback, useEffect, useRef, useState } from 'react'
import type { InstructorRealtimeVoice } from '@shared/assistant/contracts'
import arborPreviewUrl from '@/assets/voice-previews/arbor.ogg'
import breezePreviewUrl from '@/assets/voice-previews/breeze.ogg'
import covePreviewUrl from '@/assets/voice-previews/cove.ogg'
import emberPreviewUrl from '@/assets/voice-previews/ember.ogg'
import juniperPreviewUrl from '@/assets/voice-previews/juniper.ogg'
import maplePreviewUrl from '@/assets/voice-previews/maple.ogg'
import solPreviewUrl from '@/assets/voice-previews/sol.ogg'
import sprucePreviewUrl from '@/assets/voice-previews/spruce.ogg'
import valePreviewUrl from '@/assets/voice-previews/vale.ogg'
import { calculateInstructorVoiceActivity, smoothInstructorVoiceActivity } from './instructor-voice-activity'

const PREVIEW_VOLUME = 0.76
const PREVIEW_FADE_IN_MS = 420
const PREVIEW_FADE_OUT_SECONDS = 0.7

const VOICE_PREVIEW_URLS: Record<InstructorRealtimeVoice, string> = {
    arbor: arborPreviewUrl,
    breeze: breezePreviewUrl,
    cove: covePreviewUrl,
    ember: emberPreviewUrl,
    juniper: juniperPreviewUrl,
    maple: maplePreviewUrl,
    sol: solPreviewUrl,
    spruce: sprucePreviewUrl,
    vale: valePreviewUrl
}

export type InstructorVoicePreviewStatus = 'idle' | 'loading' | 'playing' | 'paused' | 'error'

export function useInstructorVoicePreview() {
    const mountedRef = useRef(true)
    const generationRef = useRef(0)
    const audioRef = useRef<HTMLAudioElement | null>(null)
    const contextRef = useRef<AudioContext | null>(null)
    const sourceRef = useRef<MediaElementAudioSourceNode | null>(null)
    const analyserRef = useRef<AnalyserNode | null>(null)
    const samplesRef = useRef<Uint8Array<ArrayBuffer> | null>(null)
    const meterFrameRef = useRef<number | null>(null)
    const activityRef = useRef(0)
    const lastActivityUpdateRef = useRef(0)
    const playbackStartedAtRef = useRef(0)
    const pausedRef = useRef(false)
    const voiceRef = useRef<InstructorRealtimeVoice | null>(null)
    const autoplayRef = useRef(true)
    const [voice, setVoice] = useState<InstructorRealtimeVoice | null>(null)
    const [status, setStatus] = useState<InstructorVoicePreviewStatus>('idle')
    const [activityLevel, setActivityLevel] = useState(0)
    const [error, setError] = useState<string | null>(null)
    const [autoplayEnabled, setAutoplayEnabled] = useState(true)

    const setAutoplay = useCallback((enabled: boolean) => {
        autoplayRef.current = enabled
        if (mountedRef.current) setAutoplayEnabled(enabled)
    }, [])

    const releaseMeter = useCallback(() => {
        if (meterFrameRef.current !== null) {
            window.cancelAnimationFrame(meterFrameRef.current)
            meterFrameRef.current = null
        }
        sourceRef.current?.disconnect()
        analyserRef.current?.disconnect()
        sourceRef.current = null
        analyserRef.current = null
        samplesRef.current = null
        const context = contextRef.current
        contextRef.current = null
        if (context && context.state !== 'closed') void context.close().catch(() => undefined)
        activityRef.current = 0
        lastActivityUpdateRef.current = 0
        if (mountedRef.current) setActivityLevel(0)
    }, [])

    const releaseAudio = useCallback(() => {
        generationRef.current += 1
        releaseMeter()
        const audio = audioRef.current
        audioRef.current = null
        if (!audio) return
        audio.onplaying = null
        audio.onended = null
        audio.onerror = null
        audio.pause()
        audio.removeAttribute('src')
        audio.load()
    }, [releaseMeter])

    const beginMeter = useCallback((audio: HTMLAudioElement, generation: number): boolean => {
        if (typeof AudioContext === 'undefined') return false
        try {
            const context = new AudioContext()
            const source = context.createMediaElementSource(audio)
            const analyser = context.createAnalyser()
            analyser.fftSize = 256
            analyser.smoothingTimeConstant = 0.5
            source.connect(analyser)
            analyser.connect(context.destination)
            contextRef.current = context
            sourceRef.current = source
            analyserRef.current = analyser
            samplesRef.current = new Uint8Array(new ArrayBuffer(analyser.fftSize))
            void context.resume().catch(() => undefined)

            const update = (timestamp: number) => {
                if (!mountedRef.current || generationRef.current !== generation || analyserRef.current !== analyser) return
                const samples = samplesRef.current
                if (!samples) return
                analyser.getByteTimeDomainData(samples)
                const measured = calculateInstructorVoiceActivity(samples)
                const smoothed = smoothInstructorVoiceActivity(activityRef.current, measured)
                activityRef.current = smoothed < 0.004 ? 0 : smoothed
                const fadeIn = Math.min(1, Math.max(0, (timestamp - playbackStartedAtRef.current) / PREVIEW_FADE_IN_MS))
                const remainingSeconds = Number.isFinite(audio.duration)
                    ? Math.max(0, audio.duration - audio.currentTime)
                    : PREVIEW_FADE_OUT_SECONDS
                const fadeOut = Math.min(1, remainingSeconds / PREVIEW_FADE_OUT_SECONDS)
                audio.volume = PREVIEW_VOLUME * Math.min(fadeIn, fadeOut)
                if (timestamp - lastActivityUpdateRef.current >= 32) {
                    lastActivityUpdateRef.current = timestamp
                    setActivityLevel(activityRef.current)
                }
                meterFrameRef.current = window.requestAnimationFrame(update)
            }
            meterFrameRef.current = window.requestAnimationFrame(update)
            return true
        } catch {
            // Preview playback remains available without visual metering.
            return false
        }
    }, [])

    const play = useCallback(async (nextVoice: InstructorRealtimeVoice, explicit: boolean) => {
        if (explicit) setAutoplay(true)

        const existingAudio = audioRef.current
        if (voiceRef.current === nextVoice && status === 'paused' && existingAudio) {
            const generation = generationRef.current
            pausedRef.current = false
            playbackStartedAtRef.current = performance.now()
            existingAudio.volume = 0
            setError(null)
            setStatus('loading')
            void contextRef.current?.resume().catch(() => undefined)
            try {
                await existingAudio.play()
                if (mountedRef.current && generationRef.current === generation && !pausedRef.current) setStatus('playing')
            } catch {
                if (mountedRef.current && generationRef.current === generation) {
                    setStatus('error')
                    setError('This voice preview could not be played.')
                }
            }
            return
        }

        releaseAudio()
        const generation = generationRef.current
        const audio = new Audio(VOICE_PREVIEW_URLS[nextVoice])
        pausedRef.current = false
        audio.preload = 'auto'
        audio.volume = 0
        audioRef.current = audio
        voiceRef.current = nextVoice
        setVoice(nextVoice)
        setError(null)
        setStatus('loading')
        playbackStartedAtRef.current = performance.now()
        const metering = beginMeter(audio, generation)
        if (!metering) audio.volume = PREVIEW_VOLUME

        const isCurrent = () => mountedRef.current
            && generationRef.current === generation
            && audioRef.current === audio
            && !pausedRef.current

        audio.onplaying = () => {
            if (isCurrent()) setStatus('playing')
        }
        audio.onended = () => {
            if (!isCurrent()) return
            releaseMeter()
            setStatus('idle')
        }
        audio.onerror = () => {
            if (!isCurrent()) return
            releaseMeter()
            setStatus('error')
            setError('This voice preview could not be played.')
        }

        try {
            await audio.play()
            if (isCurrent()) setStatus('playing')
        } catch {
            if (!isCurrent()) return
            releaseMeter()
            setStatus('error')
            setError('This voice preview could not be played.')
        }
    }, [beginMeter, releaseAudio, releaseMeter, setAutoplay, status])

    const pause = useCallback(() => {
        const audio = audioRef.current
        if (!audio) return
        pausedRef.current = true
        audio.pause()
        audio.volume = 0
        activityRef.current = 0
        setActivityLevel(0)
        setStatus('paused')
        setAutoplay(false)
    }, [setAutoplay])

    const toggle = useCallback((selectedVoice: InstructorRealtimeVoice) => {
        if (
            voiceRef.current === selectedVoice
            && (status === 'playing' || status === 'loading')
        ) {
            pause()
            return
        }
        void play(selectedVoice, true)
    }, [pause, play, status])

    const select = useCallback((selectedVoice: InstructorRealtimeVoice) => {
        voiceRef.current = selectedVoice
        setVoice(selectedVoice)
        setError(null)
        if (autoplayRef.current) {
            void play(selectedVoice, false)
            return
        }
        releaseAudio()
        voiceRef.current = selectedVoice
        setVoice(selectedVoice)
        setStatus('paused')
    }, [play, releaseAudio])

    const reset = useCallback(() => {
        releaseAudio()
        pausedRef.current = false
        voiceRef.current = null
        setVoice(null)
        setStatus('idle')
        setError(null)
        setAutoplay(true)
    }, [releaseAudio, setAutoplay])

    useEffect(() => {
        mountedRef.current = true
        return () => {
            mountedRef.current = false
            releaseAudio()
        }
    }, [releaseAudio])

    return {
        voice,
        status,
        activityLevel,
        error,
        autoplayEnabled,
        select,
        toggle,
        reset
    }
}
