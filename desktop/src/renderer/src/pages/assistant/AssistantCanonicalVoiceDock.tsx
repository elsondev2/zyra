import { AudioLines, LoaderCircle, Mic, MicOff, Send, X } from 'lucide-react'
import { useCallback, useMemo, useState, type CSSProperties, type FormEvent } from 'react'
import { cn } from '@/lib/utils'
import type { InstructorVoicePreferences } from './instructor-voice-preferences'
import type { useInstructorVoiceSession } from './useInstructorVoiceSession'

type VoiceSession = ReturnType<typeof useInstructorVoiceSession>

export function AssistantCanonicalVoiceDock({
    voice,
    preferences,
    onStop
}: {
    voice: VoiceSession
    preferences: InstructorVoicePreferences
    onStop: () => void
}) {
    const [text, setText] = useState('')
    const [sending, setSending] = useState(false)
    const [sendError, setSendError] = useState<string | null>(null)
    const active = voice.status === 'active'
    const connecting = voice.status === 'requesting-microphone' || voice.status === 'connecting'
    const latest = useMemo(
        () => [...voice.transcript].reverse().find((entry) => entry.text.trim()) || null,
        [voice.transcript]
    )

    const submit = useCallback(async (event?: FormEvent) => {
        event?.preventDefault()
        const message = text.trim()
        if (!active || !message || sending) return
        setSending(true)
        setSendError(null)
        try {
            const result = await voice.sendMessage({ text: message })
            if (!result.success) {
                setSendError(result.error)
                return
            }
            setText('')
        } finally {
            setSending(false)
        }
    }, [active, sending, text, voice])

    return (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-50 px-4 pb-4 pt-8">
            <form
                onSubmit={submit}
                className="pointer-events-auto mx-auto w-full max-w-[760px] rounded-[20px] border border-sparkle-border-secondary bg-sparkle-card-elevated/95 p-2 shadow-[0_18px_46px_rgba(0,0,0,0.3)] backdrop-blur-xl"
                style={{ '--canonical-voice-accent': preferences.voice === 'cove' ? '#77d6ff' : '#a7f3d0' } as CSSProperties}
            >
                <div className="flex min-h-9 items-center gap-2 px-2">
                    <span className={cn(
                        'inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-[color:var(--canonical-voice-accent)]/10 text-[color:var(--canonical-voice-accent)]',
                        active && 'animate-pulse'
                    )}>
                        {connecting ? <LoaderCircle size={14} className="animate-spin" /> : <AudioLines size={14} />}
                    </span>
                    <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 text-[10px] font-semibold text-sparkle-text">
                            <span>{active ? 'Voice is listening' : connecting ? 'Connecting Voice' : 'Voice stopped'}</span>
                            {active ? <span className="font-normal capitalize text-sparkle-text-muted">· {preferences.voice}</span> : null}
                        </div>
                        <p className={cn(
                            'truncate text-[10px] text-sparkle-text-muted',
                            (voice.error || sendError) && 'text-rose-300'
                        )}>
                            {voice.error || sendError || latest?.text || 'Speech is saved into this chat as each turn completes.'}
                        </p>
                    </div>
                    {active ? (
                        <button
                            type="button"
                            onClick={voice.toggleMicrophone}
                            className={cn(
                                'inline-flex size-8 items-center justify-center rounded-full text-sparkle-text-muted transition-colors hover:bg-sparkle-accent hover:text-sparkle-text',
                                voice.microphoneMuted && 'bg-rose-400/10 text-rose-300'
                            )}
                            aria-label={voice.microphoneMuted ? 'Unmute microphone' : 'Mute microphone'}
                            title={voice.microphoneMuted ? 'Unmute microphone' : 'Mute microphone'}
                        >
                            {voice.microphoneMuted ? <MicOff size={14} /> : <Mic size={14} />}
                        </button>
                    ) : null}
                    <button
                        type="button"
                        onClick={onStop}
                        className="inline-flex size-8 items-center justify-center rounded-full bg-rose-400/10 text-rose-300 transition-colors hover:bg-rose-400/20"
                        aria-label="End Voice"
                        title="End Voice"
                    >
                        <X size={15} />
                    </button>
                </div>

                {active ? (
                    <div className="mt-1 flex h-10 items-center gap-1 rounded-[14px] border border-sparkle-border bg-sparkle-bg/45 px-2">
                        <Mic size={13} className="shrink-0 text-[color:var(--canonical-voice-accent)]" />
                        <input
                            value={text}
                            onChange={(event) => setText(event.target.value)}
                            disabled={sending}
                            placeholder="Type into this Voice conversation"
                            className="min-w-0 flex-1 bg-transparent px-1 text-[11px] text-sparkle-text outline-none placeholder:text-sparkle-text-muted/70"
                            aria-label="Type into Voice"
                        />
                        <button
                            type="submit"
                            disabled={!text.trim() || sending}
                            className="inline-flex size-7 items-center justify-center rounded-full bg-[color:var(--canonical-voice-accent)] text-[#09101b] transition-opacity disabled:opacity-30"
                            aria-label="Send to Voice"
                        >
                            {sending ? <LoaderCircle size={13} className="animate-spin" /> : <Send size={13} />}
                        </button>
                    </div>
                ) : null}
            </form>
        </div>
    )
}
