import { useLayoutEffect, useRef } from 'react'
import { cn } from '@/lib/utils'
import type { InstructorTranscriptEntry } from './instructor-voice-transcript'
import './InstructorVoiceLiveTranscript.css'

export function InstructorVoiceLiveTranscript({
    entry,
    error
}: {
    entry: InstructorTranscriptEntry | null
    error: string | null
}) {
    const viewportRef = useRef<HTMLDivElement | null>(null)

    useLayoutEffect(() => {
        const viewport = viewportRef.current
        if (!viewport) return
        viewport.scrollTop = viewport.scrollHeight
    }, [entry?.id, entry?.text])

    return (
        <div
            className="instructor-voice-live-transcript"
            aria-live="polite"
            aria-relevant="additions text"
        >
            {error ? (
                <p role="alert" className="instructor-voice-live-transcript-error">
                    {error}
                </p>
            ) : entry ? (
                <div
                    key={entry.id}
                    ref={viewportRef}
                    className="instructor-voice-live-transcript-viewport"
                >
                    <p
                        className={cn(
                            'instructor-voice-live-transcript-copy',
                            entry.role === 'user' ? 'is-user' : 'is-assistant',
                            !entry.final && 'is-streaming'
                        )}
                    >
                        <span className="sr-only">{entry.role === 'user' ? 'You' : 'Zyra'}: </span>
                        {entry.text}
                    </p>
                </div>
            ) : null}
        </div>
    )
}
