import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AudioLines, ChevronLeft, ChevronRight, LoaderCircle, Pause, Play } from 'lucide-react'
import { INSTRUCTOR_REALTIME_VOICES } from '@shared/assistant/contracts'
import { VoiceTranscriptionSettings } from './VoiceTranscriptionSettings'
import { VoiceHistorySettings } from './VoiceHistorySettings'
import {
    readInstructorVoicePreferences,
    writeInstructorVoicePreferences,
    type InstructorVoicePreferences
} from '../assistant/instructor-voice-preferences'
import { SettingsPageTabs } from './SettingsPageTabs'
import { createSettingsRowTargetId } from './settings-search'
import { InstructorVoiceOrb } from '../assistant/InstructorVoiceOrb'
import { getInstructorVoiceVisualTheme } from '../assistant/instructor-voice-visuals'
import { INSTRUCTOR_VOICE_PREVIEW_CONTENT } from '../assistant/instructor-voice-preview-content'
import { useInstructorVoicePreview } from '../assistant/useInstructorVoicePreview'
import {
    SettingsButton,
    SettingsDialog,
    SettingsPageContainer,
    SettingsRow,
    SettingsSection,
    SettingsSegmented,
    SettingsStatusPill,
    SettingsTextarea
} from './settings-layout'

export type VoiceSettingsView = 'dictation' | 'conversation' | 'history'

export default function VoiceSettings({ view = 'dictation' }: { view?: VoiceSettingsView }) {
    return (
        <SettingsPageContainer title="Voice" navigation={<SettingsPageTabs family="voice" />}>
            {view === 'dictation' ? <VoiceTranscriptionSettings /> : null}
            {view === 'history' ? <VoiceHistorySettings /> : null}
            {view === 'conversation' ? <VoiceConversationSettings /> : null}
        </SettingsPageContainer>
    )
}

function VoiceConversationSettings() {
    const navigate = useNavigate()
    const [preferences, setPreferences] = useState<InstructorVoicePreferences>(() => readInstructorVoicePreferences())
    const [chatGptConnected, setChatGptConnected] = useState<boolean | null>(null)
    const [connectionError, setConnectionError] = useState<string | null>(null)
    const [instructionsOpen, setInstructionsOpen] = useState(false)
    const [instructionsDraft, setInstructionsDraft] = useState(preferences.instructions)
    const preview = useInstructorVoicePreview()
    const voiceIndex = INSTRUCTOR_REALTIME_VOICES.indexOf(preferences.voice)
    const previewIsActive = preview.voice === preferences.voice && (preview.status === 'playing' || preview.status === 'loading')

    const refreshChatGptConnection = useCallback(async () => {
        try {
            const result = await window.devscope.onboarding.getConnectionsStatus()
            if (!result.success) throw new Error(result.error || 'Could not check the ChatGPT connection.')
            setChatGptConnected(result.status.chatgpt.verified)
            setConnectionError(null)
        } catch (error) {
            setChatGptConnected(false)
            setConnectionError(error instanceof Error ? error.message : 'Could not check the ChatGPT connection.')
        }
    }, [])

    useEffect(() => {
        void refreshChatGptConnection()
        const unsubscribe = window.devscope.onboarding.onChanged(() => { void refreshChatGptConnection() })
        const refreshOnFocus = () => { if (document.visibilityState === 'visible') void refreshChatGptConnection() }
        document.addEventListener('visibilitychange', refreshOnFocus)
        return () => {
            unsubscribe()
            document.removeEventListener('visibilitychange', refreshOnFocus)
        }
    }, [refreshChatGptConnection])

    useEffect(() => { preview.setAutoplay(false) }, [preview.setAutoplay])
    useEffect(() => {
        if (chatGptConnected !== true) {
            preview.reset()
            preview.setAutoplay(false)
        }
    }, [chatGptConnected, preview.reset, preview.setAutoplay])
    useEffect(() => {
        if (preview.voice && preview.voice !== preferences.voice) {
            preview.reset()
            preview.setAutoplay(false)
        }
        if (preferences.outputModality !== 'audio') {
            preview.reset()
            preview.setAutoplay(false)
        }
    }, [preferences.outputModality, preferences.voice, preview.reset, preview.setAutoplay, preview.voice])

    const updatePreferences = (patch: Partial<InstructorVoicePreferences>) => {
        const next = { ...preferences, ...patch }
        setPreferences(next)
        writeInstructorVoicePreferences(next)
    }

    return (
        <>
            <SettingsSection title="ChatGPT Voice" headerAction={<SettingsStatusPill label={connectionError ? 'Unavailable' : chatGptConnected === null ? 'Checking' : chatGptConnected ? 'Connected' : 'Not connected'} tone={chatGptConnected ? 'ready' : chatGptConnected === null && !connectionError ? 'muted' : 'warning'} title={connectionError || undefined} />}>
                {chatGptConnected ? (
                    <>
                        <div data-settings-search-target={createSettingsRowTargetId('Instructor Voice Lab', 'Voice')} tabIndex={-1} className="m-3 flex flex-col items-center gap-4 rounded-xl border border-[var(--settings-border)] bg-[var(--settings-control)] px-4 py-5 sm:flex-row sm:justify-center sm:gap-7">
                            <button type="button" aria-label="Previous voice" title="Previous voice" onClick={() => updatePreferences({ voice: INSTRUCTOR_REALTIME_VOICES[(voiceIndex - 1 + INSTRUCTOR_REALTIME_VOICES.length) % INSTRUCTOR_REALTIME_VOICES.length]! })} className="inline-flex size-8 shrink-0 items-center justify-center rounded-full text-[var(--settings-text-secondary)] transition-colors hover:bg-[var(--settings-control-hover)] hover:text-[var(--settings-text)]"><ChevronLeft size={17} /></button>
                            <button type="button" aria-label={`${previewIsActive ? 'Pause' : 'Play'} ${preferences.voice} voice preview`} aria-pressed={previewIsActive} onClick={() => preview.toggle(preferences.voice)} className="group relative grid size-[88px] shrink-0 place-items-center overflow-hidden rounded-full border border-[var(--settings-border)] bg-[var(--settings-section)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent-primary)]">
                                <span aria-hidden="true" className="absolute left-1/2 top-1/2 origin-center -translate-x-1/2 -translate-y-1/2 scale-[0.55]"><InstructorVoiceOrb voice={preferences.voice} status={previewIsActive ? 'active' : 'idle'} activityLevel={preview.voice === preferences.voice ? preview.activityLevel : 0} compact /></span>
                                <span aria-hidden="true" className="relative z-10 grid size-7 place-items-center rounded-full bg-black/35 text-white shadow-sm opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 transition-opacity duration-300 ease-in-out motion-reduce:transition-none">{preview.status === 'loading' && preview.voice === preferences.voice ? <LoaderCircle size={15} className="animate-spin motion-reduce:animate-none" /> : previewIsActive ? <Pause size={14} fill="currentColor" /> : <Play size={14} fill="currentColor" />}</span>
                            </button>
                            <button type="button" aria-label="Next voice" title="Next voice" onClick={() => updatePreferences({ voice: INSTRUCTOR_REALTIME_VOICES[(voiceIndex + 1) % INSTRUCTOR_REALTIME_VOICES.length]! })} className="inline-flex size-8 shrink-0 items-center justify-center rounded-full text-[var(--settings-text-secondary)] transition-colors hover:bg-[var(--settings-control-hover)] hover:text-[var(--settings-text)]"><ChevronRight size={17} /></button>
                            <div className="min-w-0 space-y-2 text-center sm:min-w-48 sm:text-left">
                                <div aria-live="polite"><h3 className="text-[14px] font-medium text-[var(--settings-text)]">{preferences.voice.charAt(0).toUpperCase() + preferences.voice.slice(1)}</h3><p className="text-[11px] text-[var(--settings-text-secondary)]">{INSTRUCTOR_VOICE_PREVIEW_CONTENT[preferences.voice].topic}</p></div>
                                <div role="group" className="flex items-center justify-center gap-1 sm:justify-start" aria-label="Available voices">
                                    {INSTRUCTOR_REALTIME_VOICES.map((voice) => {
                                        const selected = voice === preferences.voice
                                        const color = getInstructorVoiceVisualTheme(voice).primary
                                        return <button key={voice} type="button" onClick={() => updatePreferences({ voice })} aria-label={`Select ${voice}`} aria-pressed={selected} title={voice} className="group grid size-4 shrink-0 place-items-center rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-primary)]">
                                            <span aria-hidden="true" style={{ backgroundColor: color, boxShadow: selected ? `0 0 0 3px ${color}33, 0 0 10px ${color}88` : undefined }} className={`size-2.5 rounded-full transition-[opacity,transform,box-shadow] duration-200 ease-out motion-reduce:transition-none ${selected ? 'scale-110 opacity-100' : 'opacity-70 group-hover:opacity-100 group-focus-visible:opacity-100'}`} />
                                        </button>
                                    })}
                                </div>
                                {preview.error && preview.voice === preferences.voice ? <p role="alert" className="text-[10px] text-[var(--status-danger)]">{preview.error}</p> : null}
                            </div>
                        </div>
                        <div data-settings-search-target={createSettingsRowTargetId('Instructor Voice Lab', 'Output')} tabIndex={-1}>
                            <SettingsRow title="Output" description="Play spoken responses or keep the session text-only." control={<SettingsSegmented value={preferences.outputModality} options={[{ value: 'audio', label: 'Audio' }, { value: 'text', label: 'Text' }]} onChange={(outputModality) => updatePreferences({ outputModality })} label="Voice Lab output" />} />
                        </div>
                        <SettingsRow
                            title="Instructions"
                            description="Set instructions for new Voice Lab sessions."
                            info="Existing sessions keep their current instructions."
                            status={preferences.instructions.trim() ? 'Custom guidance saved' : 'No standing guidance'}
                            statusTone={preferences.instructions.trim() ? 'ready' : 'muted'}
                            control={<SettingsButton onClick={() => { setInstructionsDraft(preferences.instructions); setInstructionsOpen(true) }}>Edit</SettingsButton>}
                        />
                    </>
                ) : (
                    <div className="px-4 py-5 text-[12px] text-[var(--settings-text-secondary)]">{connectionError ? 'ChatGPT connection status is unavailable.' : chatGptConnected === null ? 'Checking ChatGPT connection…' : 'Connect a ChatGPT account to use voice conversation.'}</div>
                )}
            </SettingsSection>

            <div className="flex items-center justify-between gap-4 px-1 text-[11px]">
                <Link to="/settings/providers" className="text-[var(--settings-text-muted)] transition-colors hover:text-[var(--settings-text)]">ChatGPT connections</Link>
                <SettingsButton variant="ghost" onClick={() => navigate('/assistant/instructor')}><AudioLines size={13} />Open Voice Lab</SettingsButton>
            </div>

            <SettingsDialog
                open={instructionsOpen}
                title="Edit Voice Lab instructions"
                description="These instructions apply when a new Voice Lab session starts."
                onClose={() => setInstructionsOpen(false)}
                footer={(
                    <>
                        <SettingsButton variant="ghost" onClick={() => setInstructionsOpen(false)}>Cancel</SettingsButton>
                        <SettingsButton variant="accent" onClick={() => { updatePreferences({ instructions: instructionsDraft }); setInstructionsOpen(false) }}>Save instructions</SettingsButton>
                    </>
                )}
            >
                <SettingsTextarea autoFocus value={instructionsDraft} maxLength={8000} rows={9} onChange={(event) => setInstructionsDraft(event.target.value)} placeholder="Describe how the instructor should respond." aria-label="Voice Lab instructions" />
                <div className="text-right text-[10px] tabular-nums text-[var(--settings-text-muted)]">{instructionsDraft.length.toLocaleString()} / 8,000</div>
            </SettingsDialog>
        </>
    )
}
