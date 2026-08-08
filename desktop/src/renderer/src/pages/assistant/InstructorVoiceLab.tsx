import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react'
import { ArrowLeft, MessageSquareText, SlidersHorizontal } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { InstructorVoiceComposer, type InstructorVoiceComposerImage } from './InstructorVoiceComposer'
import { InstructorVoiceConversation } from './InstructorVoiceConversation'
import { InstructorVoiceLiveTranscript } from './InstructorVoiceLiveTranscript'
import { InstructorVoiceOrb } from './InstructorVoiceOrb'
import { InstructorVoiceSettings } from './InstructorVoiceSettings'
import {
    readInstructorVoicePreferences,
    writeInstructorVoicePreferences,
    type InstructorVoicePreferences
} from './instructor-voice-preferences'
import { getInstructorVoiceVisualTheme } from './instructor-voice-visuals'
import { useInstructorVoiceSession } from './useInstructorVoiceSession'
import './InstructorVoiceLab.css'

const statusLabels = {
    idle: 'Ready',
    'requesting-microphone': 'Microphone access',
    connecting: 'Connecting',
    active: 'Listening',
    stopping: 'Stopping',
    error: 'Session stopped'
} as const

export default function InstructorVoiceLab() {
    const navigate = useNavigate()
    const [preferences, setPreferences] = useState<InstructorVoicePreferences>(readInstructorVoicePreferences)
    const [settingsOpen, setSettingsOpen] = useState(false)
    const [chatOpen, setChatOpen] = useState(false)
    const {
        status,
        error,
        transcript,
        activityLevel,
        microphoneMuted,
        start,
        stop,
        sendMessage,
        toggleMicrophone
    } = useInstructorVoiceSession()
    const active = status === 'active' || status === 'connecting' || status === 'requesting-microphone'
    const stopping = status === 'stopping'
    const busy = active || stopping
    const visualTheme = getInstructorVoiceVisualTheme(preferences.voice)
    const latestTranscript = useMemo(
        () => [...transcript].reverse().find((entry) => entry.text.trim().length > 0) || null,
        [transcript]
    )

    useEffect(() => {
        writeInstructorVoicePreferences(preferences)
    }, [preferences])

    const closeSettings = useCallback(() => setSettingsOpen(false), [])

    const leaveVoice = useCallback(async () => {
        if (status !== 'idle') await stop()
        navigate('/assistant')
    }, [navigate, status, stop])

    const startSession = useCallback(() => {
        if (active || stopping) return
        void start(preferences)
    }, [active, preferences, start, stopping])

    const stopSession = useCallback(() => {
        if (!active || stopping) return
        void stop()
    }, [active, stop, stopping])

    const sendComposerMessage = useCallback((text: string, images: InstructorVoiceComposerImage[]) => (
        sendMessage({
            text,
            images: images.map((image) => ({
                name: image.name,
                mimeType: image.mimeType,
                dataUrl: image.dataUrl
            }))
        })
    ), [sendMessage])

    return (
        <div className="relative flex h-full min-h-0 flex-col overflow-hidden bg-sparkle-bg text-sparkle-text">
            <header className="relative z-40 grid h-[72px] shrink-0 grid-cols-[88px_minmax(0,1fr)_88px] items-center px-3 sm:px-5">
                <div className="flex items-center">
                    <button
                        type="button"
                        onClick={() => void leaveVoice()}
                        aria-label="Back to chat"
                        title="Back to chat"
                        className="inline-flex h-9 w-9 items-center justify-center rounded-md text-sparkle-text-secondary transition-colors hover:bg-sparkle-accent hover:text-sparkle-text"
                    >
                        <ArrowLeft size={17} />
                    </button>
                </div>

                <div className="min-w-0 text-center">
                    <h1 className="truncate text-[13px] font-semibold tracking-[-0.01em] text-sparkle-text">Zyra Voice</h1>
                    <div className="mt-0.5 flex h-3 items-center justify-center gap-1.5 text-[9px] leading-none text-sparkle-text-secondary">
                        {status === 'idle' ? (
                            <span className="truncate">Powered by ChatGPT Voice</span>
                        ) : (
                            <>
                                <span
                                    aria-hidden="true"
                                    className={cn(
                                        'block h-1 w-1 shrink-0 rounded-full transition-colors',
                                        status === 'active'
                                            ? 'bg-[var(--voice-primary)]'
                                            : status === 'error'
                                                ? 'bg-rose-400'
                                                : 'animate-pulse bg-[var(--voice-primary)]'
                                    )}
                                    style={{ '--voice-primary': visualTheme.primary } as CSSProperties}
                                />
                                <span className="inline-flex h-3 items-center">{statusLabels[status]}</span>
                                {status === 'active' ? (
                                    <>
                                        <span className="inline-flex h-3 items-center text-sparkle-text-muted">·</span>
                                        <span className="inline-flex h-3 items-center capitalize">{preferences.voice}</span>
                                    </>
                                ) : null}
                            </>
                        )}
                    </div>
                </div>

                <div className="flex items-center justify-end">
                    <button
                        type="button"
                        onClick={() => setChatOpen((current) => !current)}
                        aria-label={chatOpen ? 'Close conversation' : 'Open conversation'}
                        title="Conversation"
                        aria-pressed={chatOpen}
                        className={cn(
                            'relative inline-flex h-9 w-9 items-center justify-center rounded-md transition-colors',
                            chatOpen
                                ? 'bg-sparkle-accent text-sparkle-text'
                                : 'text-sparkle-text-secondary hover:bg-sparkle-accent hover:text-sparkle-text'
                        )}
                    >
                        <MessageSquareText size={16} />
                        {transcript.length > 0 && !chatOpen ? (
                            <span
                                aria-hidden="true"
                                className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full border border-sparkle-bg bg-[var(--voice-primary)]"
                                style={{ '--voice-primary': visualTheme.primary } as CSSProperties}
                            />
                        ) : null}
                    </button>
                    <button
                        type="button"
                        onClick={() => setSettingsOpen(true)}
                        aria-label="Open voice settings"
                        title="Voice settings"
                        className="inline-flex h-9 w-9 items-center justify-center rounded-md text-sparkle-text-secondary transition-colors hover:bg-sparkle-accent hover:text-sparkle-text"
                    >
                        <SlidersHorizontal size={16} />
                    </button>
                </div>
            </header>

            <div className="relative flex min-h-0 flex-1 flex-col">
                <main className="instructor-voice-main relative z-10 min-h-0 flex-1 overflow-hidden px-5 sm:px-8">
                    <InstructorVoiceConversation
                        open={chatOpen}
                        transcript={transcript}
                        accentColor={visualTheme.primary}
                    />

                    <div className={cn('instructor-voice-stage', chatOpen && 'is-chat-open')}>
                        <InstructorVoiceOrb
                            voice={preferences.voice}
                            status={status}
                            activityLevel={activityLevel}
                            compact={chatOpen}
                            animateLayout
                        />

                        <div className={cn(
                            'instructor-voice-stage-transcript',
                            chatOpen && 'is-chat-open'
                        )}>
                            <InstructorVoiceLiveTranscript
                                entry={latestTranscript}
                                error={error}
                            />
                        </div>
                    </div>
                </main>

                <footer className="relative z-30 flex min-h-[88px] shrink-0 items-end justify-center px-4 pb-4 pt-2 sm:px-6">
                    <InstructorVoiceComposer
                        status={status}
                        microphoneMuted={microphoneMuted}
                        accentColor={visualTheme.primary}
                        instructionsAvailable={Boolean(preferences.instructions.trim())}
                        onStart={startSession}
                        onStop={stopSession}
                        onToggleMicrophone={toggleMicrophone}
                        onSend={sendComposerMessage}
                    />
                </footer>
            </div>

            <InstructorVoiceSettings
                open={settingsOpen}
                busy={busy}
                preferences={preferences}
                onChange={setPreferences}
                onClose={closeSettings}
            />
        </div>
    )
}
