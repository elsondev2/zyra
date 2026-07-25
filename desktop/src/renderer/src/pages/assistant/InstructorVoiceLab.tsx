import { useEffect, useRef, useState } from 'react'
import { DEFAULT_INSTRUCTOR_VOICE_INSTRUCTIONS } from '@shared/assistant/contracts'
import { ArrowLeft, Eraser, Mic, ShieldCheck, Square } from 'lucide-react'
import { Link } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { useInstructorVoiceSession } from './useInstructorVoiceSession'

const statusLabels = {
    idle: 'Ready',
    'requesting-microphone': 'Waiting for microphone',
    connecting: 'Connecting',
    active: 'Listening',
    stopping: 'Stopping',
    error: 'Connection error'
} as const

export default function InstructorVoiceLab() {
    const [instructions, setInstructions] = useState(DEFAULT_INSTRUCTOR_VOICE_INSTRUCTIONS)
    const transcriptEndRef = useRef<HTMLDivElement | null>(null)
    const { status, error, transcript, start, stop, clearTranscript } = useInstructorVoiceSession()
    const active = status === 'active' || status === 'connecting' || status === 'requesting-microphone'
    const busy = active || status === 'stopping'

    useEffect(() => {
        transcriptEndRef.current?.scrollIntoView({ block: 'end', behavior: 'smooth' })
    }, [transcript])

    return (
        <div className="flex h-full min-h-0 flex-col bg-[#171421] text-sparkle-text">
            <header className="flex h-14 shrink-0 items-center justify-between border-b border-white/[0.07] px-5">
                <div className="flex min-w-0 items-center gap-3">
                    <Link
                        to="/assistant"
                        className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-sparkle-text-muted transition-colors hover:bg-white/[0.06] hover:text-sparkle-text"
                        aria-label="Back to chat"
                        title="Back to chat"
                    >
                        <ArrowLeft size={17} />
                    </Link>
                    <div className="min-w-0">
                        <h1 className="truncate text-sm font-semibold">Instructor Voice Lab</h1>
                        <p className="truncate text-[11px] text-sparkle-text-muted">Temporary Codex realtime test</p>
                    </div>
                </div>
                <div className="flex items-center gap-2 text-[11px] text-sparkle-text-muted">
                    <span className={cn(
                        'h-2 w-2 rounded-full',
                        status === 'active' ? 'bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.65)]' :
                            status === 'error' ? 'bg-rose-400' :
                                busy ? 'animate-pulse bg-amber-300' : 'bg-white/25'
                    )} />
                    {statusLabels[status]}
                </div>
            </header>

            <main className="mx-auto grid min-h-0 w-full max-w-6xl flex-1 gap-4 overflow-y-auto p-4 md:grid-cols-[minmax(280px,0.8fr)_minmax(360px,1.2fr)] md:overflow-hidden">
                <section className="flex min-h-0 flex-col rounded-2xl border border-white/[0.08] bg-white/[0.025] p-4">
                    <div className="mb-3">
                        <h2 className="text-sm font-medium">Instructions</h2>
                        <p className="mt-1 text-xs leading-relaxed text-sparkle-text-muted">
                            Change this before starting. It becomes the instructor&apos;s realtime prompt.
                        </p>
                    </div>
                    <textarea
                        value={instructions}
                        onChange={(event) => setInstructions(event.target.value)}
                        disabled={busy}
                        maxLength={8000}
                        spellCheck
                        className="min-h-56 flex-1 resize-none rounded-xl border border-white/[0.08] bg-black/20 p-3 text-[13px] leading-relaxed text-sparkle-text outline-none transition-colors placeholder:text-sparkle-text-muted/60 focus:border-violet-400/35 disabled:opacity-60"
                        aria-label="Instructor instructions"
                    />
                    <div className="mt-2 flex items-center justify-between text-[10px] text-sparkle-text-muted/75">
                        <span>{instructions.length.toLocaleString()} / 8,000</span>
                        <span>Editable before each call</span>
                    </div>

                    <div className="mt-4 flex gap-2">
                        {!active ? (
                            <button
                                type="button"
                                disabled={status === 'stopping' || !instructions.trim()}
                                onClick={() => void start(instructions)}
                                className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-xl bg-violet-500 px-4 text-sm font-medium text-white transition-colors hover:bg-violet-400 disabled:cursor-not-allowed disabled:opacity-45"
                            >
                                <Mic size={16} />
                                Start voice
                            </button>
                        ) : (
                            <button
                                type="button"
                                onClick={() => void stop()}
                                className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-xl bg-rose-500/90 px-4 text-sm font-medium text-white transition-colors hover:bg-rose-400"
                            >
                                <Square size={14} fill="currentColor" />
                                Stop
                            </button>
                        )}
                    </div>

                    <div className="mt-4 flex gap-2 rounded-xl border border-emerald-300/[0.12] bg-emerald-300/[0.04] p-3 text-[11px] leading-relaxed text-sparkle-text-muted">
                        <ShieldCheck className="mt-0.5 shrink-0 text-emerald-300/80" size={15} />
                        <p>
                            This lab uses an ephemeral, read-only Codex thread. Leaving this page stops the microphone and its App Server process.
                        </p>
                    </div>
                </section>

                <section className="flex min-h-[360px] flex-col overflow-hidden rounded-2xl border border-white/[0.08] bg-black/15 md:min-h-0">
                    <div className="flex h-12 shrink-0 items-center justify-between border-b border-white/[0.07] px-4">
                        <div>
                            <h2 className="text-sm font-medium">Live transcript</h2>
                            <p className="text-[10px] text-sparkle-text-muted">Audio plays automatically when connected</p>
                        </div>
                        <button
                            type="button"
                            onClick={clearTranscript}
                            disabled={transcript.length === 0}
                            className="inline-flex h-7 items-center gap-1.5 rounded-lg px-2 text-[11px] text-sparkle-text-muted transition-colors hover:bg-white/[0.05] hover:text-sparkle-text disabled:opacity-30"
                        >
                            <Eraser size={13} />
                            Clear
                        </button>
                    </div>

                    <div className="min-h-0 flex-1 overflow-y-auto p-4">
                        {transcript.length === 0 ? (
                            <div className="flex h-full min-h-64 flex-col items-center justify-center text-center">
                                <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-violet-400/[0.08] text-violet-300">
                                    <Mic size={20} />
                                </div>
                                <p className="text-sm text-sparkle-text/80">Start voice, then say hello.</p>
                                <p className="mt-1 max-w-xs text-xs leading-relaxed text-sparkle-text-muted">
                                    The first connection may take a few seconds. Any account eligibility error will appear here.
                                </p>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {transcript.map((entry) => {
                                    const user = entry.role === 'user'
                                    return (
                                        <div key={entry.id} className={cn('flex', user ? 'justify-end' : 'justify-start')}>
                                            <div className={cn(
                                                'max-w-[85%] rounded-2xl px-3.5 py-2.5 text-[13px] leading-relaxed',
                                                user ? 'bg-violet-500/80 text-white' : 'border border-white/[0.07] bg-white/[0.045] text-sparkle-text'
                                            )}>
                                                <div className="mb-1 text-[9px] font-semibold uppercase tracking-[0.12em] opacity-55">
                                                    {user ? 'You' : 'Instructor'}
                                                </div>
                                                <p className={cn('whitespace-pre-wrap', !entry.final && 'opacity-80')}>{entry.text}</p>
                                            </div>
                                        </div>
                                    )
                                })}
                                <div ref={transcriptEndRef} />
                            </div>
                        )}
                    </div>

                    {error ? (
                        <div className="shrink-0 border-t border-rose-300/[0.12] bg-rose-400/[0.06] px-4 py-3 text-xs leading-relaxed text-rose-200">
                            {error}
                        </div>
                    ) : null}
                </section>
            </main>
        </div>
    )
}
