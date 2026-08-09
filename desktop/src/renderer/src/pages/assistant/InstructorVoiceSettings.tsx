import { useEffect, useRef, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { ChevronLeft, ChevronRight, LoaderCircle, Pause, Play, X } from 'lucide-react'
import {
    INSTRUCTOR_REALTIME_VOICES,
    type InstructorOutputModality,
    type InstructorRealtimeVoice
} from '@shared/assistant/contracts'
import { cn } from '@/lib/utils'
import type { InstructorVoicePreferences } from './instructor-voice-preferences'
import { InstructorVoiceOrb } from './InstructorVoiceOrb'
import { INSTRUCTOR_VOICE_PREVIEW_CONTENT } from './instructor-voice-preview-content'
import { getInstructorVoiceVisualTheme } from './instructor-voice-visuals'
import { useInstructorVoicePreview } from './useInstructorVoicePreview'
import './InstructorVoiceSettings.css'

const OUTPUT_OPTIONS: Array<{
    value: InstructorOutputModality
    label: string
}> = [
    { value: 'audio', label: 'Voice' },
    { value: 'text', label: 'Text' }
]

function displayVoiceName(voice: InstructorRealtimeVoice): string {
    return voice.charAt(0).toUpperCase() + voice.slice(1)
}

export function InstructorVoiceSettings({
    open,
    busy,
    preferences,
    onChange,
    onClose
}: {
    open: boolean
    busy: boolean
    preferences: InstructorVoicePreferences
    onChange: (preferences: InstructorVoicePreferences) => void
    onClose: () => void
}) {
    const dialogRef = useRef<HTMLElement | null>(null)
    const selectedVoiceIndex = INSTRUCTOR_REALTIME_VOICES.indexOf(preferences.voice)
    const selectedVisualTheme = getInstructorVoiceVisualTheme(preferences.voice)
    const selectedPreviewContent = INSTRUCTOR_VOICE_PREVIEW_CONTENT[preferences.voice]
    const voiceControlsDisabled = busy || preferences.outputModality !== 'audio'
    const {
        status: previewStatus,
        voice: previewVoice,
        activityLevel: previewActivityLevel,
        error: previewError,
        select: selectPreview,
        toggle: togglePreview,
        reset: resetPreview
    } = useInstructorVoicePreview()
    const selectedPreviewStatus = previewVoice === preferences.voice ? previewStatus : 'idle'
    const previewIsActive = selectedPreviewStatus === 'loading' || selectedPreviewStatus === 'playing'

    useEffect(() => {
        if (!open) return
        const originalOverflow = document.body.style.overflow
        document.body.style.overflow = 'hidden'
        window.setTimeout(() => dialogRef.current?.focus({ preventScroll: true }), 0)
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') onClose()
        }
        document.addEventListener('keydown', onKeyDown)
        return () => {
            document.body.style.overflow = originalOverflow
            document.removeEventListener('keydown', onKeyDown)
        }
    }, [onClose, open])

    useEffect(() => {
        if (!open || busy || preferences.outputModality !== 'audio') resetPreview()
    }, [busy, open, preferences.outputModality, resetPreview])

    if (!open || typeof document === 'undefined') return null

    const update = <Key extends keyof InstructorVoicePreferences>(
        key: Key,
        value: InstructorVoicePreferences[Key]
    ) => onChange({ ...preferences, [key]: value })

    const selectVoice = (voice: InstructorRealtimeVoice) => {
        update('voice', voice)
        void selectPreview(voice)
    }

    const selectVoiceOffset = (offset: number) => {
        const nextIndex = (selectedVoiceIndex + offset + INSTRUCTOR_REALTIME_VOICES.length)
            % INSTRUCTOR_REALTIME_VOICES.length
        selectVoice(INSTRUCTOR_REALTIME_VOICES[nextIndex])
    }

    return createPortal((
        <div
            className="instructor-voice-settings-backdrop"
            onMouseDown={(event) => {
                if (event.target === event.currentTarget) onClose()
            }}
        >
            <section
                ref={dialogRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby="instructor-voice-settings-title"
                tabIndex={-1}
                className="instructor-voice-settings-dialog"
                style={{ '--voice-settings-accent': selectedVisualTheme.primary } as CSSProperties}
            >
                <h2 id="instructor-voice-settings-title" className="sr-only">Voice settings</h2>
                <button
                    type="button"
                    onClick={onClose}
                    aria-label="Close voice settings"
                    className="instructor-voice-settings-close"
                >
                    <X size={19} />
                </button>

                <div className="instructor-voice-settings-layout">
                    <section
                        className={cn(
                            'instructor-voice-settings-voice-pane',
                            preferences.outputModality !== 'audio' && 'is-disabled'
                        )}
                        aria-labelledby="voice-settings-voice-title"
                    >
                        <h3 id="voice-settings-voice-title" className="instructor-voice-settings-heading">Voice</h3>

                        <div className="instructor-voice-settings-carousel">
                            <button
                                type="button"
                                disabled={voiceControlsDisabled}
                                onClick={() => selectVoiceOffset(-1)}
                                aria-label="Previous voice"
                                className="instructor-voice-settings-arrow"
                            >
                                <ChevronLeft size={20} />
                            </button>

                            <button
                                type="button"
                                disabled={voiceControlsDisabled}
                                onClick={() => void togglePreview(preferences.voice)}
                                aria-label={`${previewIsActive ? 'Pause' : 'Play'} ${displayVoiceName(preferences.voice)} voice preview`}
                                aria-pressed={previewIsActive}
                                className="instructor-voice-settings-preview"
                            >
                                <InstructorVoiceOrb
                                    voice={preferences.voice}
                                    status={previewIsActive ? 'active' : 'idle'}
                                    activityLevel={previewVoice === preferences.voice ? previewActivityLevel : 0}
                                    compact
                                />
                                <span
                                    aria-hidden="true"
                                    className={cn(
                                        'instructor-voice-settings-preview-icon',
                                        selectedPreviewStatus !== 'idle' && 'is-visible'
                                    )}
                                >
                                    {selectedPreviewStatus === 'loading'
                                        ? <LoaderCircle size={19} className="animate-spin" />
                                        : selectedPreviewStatus === 'playing'
                                            ? <Pause size={19} fill="currentColor" />
                                            : <Play size={19} fill="currentColor" />}
                                </span>
                            </button>

                            <button
                                type="button"
                                disabled={voiceControlsDisabled}
                                onClick={() => selectVoiceOffset(1)}
                                aria-label="Next voice"
                                className="instructor-voice-settings-arrow"
                            >
                                <ChevronRight size={20} />
                            </button>
                        </div>

                        <div className="instructor-voice-settings-voice-copy" aria-live="polite">
                            <h4>{displayVoiceName(preferences.voice)}</h4>
                            <p>{selectedPreviewContent.topic}</p>
                        </div>

                        <div className="instructor-voice-settings-dots" aria-label="Available voices">
                            {INSTRUCTOR_REALTIME_VOICES.map((voice) => {
                                const selected = voice === preferences.voice
                                return (
                                    <button
                                        key={voice}
                                        type="button"
                                        disabled={voiceControlsDisabled}
                                        onClick={() => selectVoice(voice)}
                                        aria-label={`Select ${displayVoiceName(voice)}`}
                                        aria-pressed={selected}
                                        title={displayVoiceName(voice)}
                                        className={cn('instructor-voice-settings-dot', selected && 'is-selected')}
                                    />
                                )
                            })}
                        </div>

                        {previewError ? (
                            <p role="alert" className="instructor-voice-settings-preview-error">{previewError}</p>
                        ) : null}

                        <div className="instructor-voice-settings-output-row">
                            <label htmlFor="voice-settings-output">Output</label>
                            <select
                                id="voice-settings-output"
                                value={preferences.outputModality}
                                disabled={busy}
                                onChange={(event) => update(
                                    'outputModality',
                                    event.target.value as InstructorOutputModality
                                )}
                            >
                                {OUTPUT_OPTIONS.map((option) => (
                                    <option key={option.value} value={option.value}>{option.label}</option>
                                ))}
                            </select>
                        </div>
                    </section>

                    <section
                        className="instructor-voice-settings-instructions-pane"
                        aria-labelledby="voice-settings-instructions-title"
                    >
                        <div className="instructor-voice-settings-instructions-heading">
                            <h3 id="voice-settings-instructions-title" className="instructor-voice-settings-heading">Instructions</h3>
                            <span>{preferences.instructions.length.toLocaleString()} / 8,000</span>
                        </div>
                        <textarea
                            id="voice-settings-instructions"
                            value={preferences.instructions}
                            disabled={busy}
                            maxLength={8_000}
                            spellCheck
                            onChange={(event) => update('instructions', event.target.value)}
                            aria-label="Voice instructions"
                        />
                    </section>
                </div>
            </section>
        </div>
    ), document.body)
}
