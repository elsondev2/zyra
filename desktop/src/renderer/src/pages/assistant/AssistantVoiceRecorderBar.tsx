import { memo, useEffect, useRef, useState } from 'react'
import { Loader2, Square, X } from 'lucide-react'
import { cn } from '@/lib/utils'

const BAR_WIDTH_PX = 2
const BAR_GAP_PX = 2
const BAR_MIN_HEIGHT_PX = 2
const BAR_MAX_HEIGHT_PX = 18

function VoiceWaveform({ levels, className }: {
    levels: readonly number[]
    className?: string
}) {
    return (
        <div
            className={cn('flex h-full min-w-0 items-center', className)}
            style={{ gap: `${BAR_GAP_PX}px` }}
            aria-hidden="true"
        >
            {levels.map((level, index) => {
                const clamped = Math.max(0, Math.min(1, level))
                const height = clamped === 0
                    ? 1
                    : Math.round(BAR_MIN_HEIGHT_PX + clamped * (BAR_MAX_HEIGHT_PX - BAR_MIN_HEIGHT_PX))
                return (
                    <span
                        key={`${levels.length - index}-${index}`}
                        className="shrink-0 rounded-[1px] bg-[var(--color-text-secondary)] opacity-80"
                        style={{
                            width: `${BAR_WIDTH_PX}px`,
                            height: `${height}px`
                        }}
                    />
                )
            })}
        </div>
    )
}

export const AssistantVoiceRecorderBar = memo(function AssistantVoiceRecorderBar({
    disabled,
    durationLabel,
    isTranscribing,
    waveformLevels,
    onCancel,
    onSubmit
}: {
    disabled?: boolean
    durationLabel: string
    isTranscribing: boolean
    waveformLevels: readonly number[]
    onCancel: () => void
    onSubmit: () => void
}) {
    const trackRef = useRef<HTMLDivElement | null>(null)
    const [visibleBarCount, setVisibleBarCount] = useState(96)

    useEffect(() => {
        const node = trackRef.current
        if (!node) return
        const measure = () => {
            if (node.clientWidth > 0) {
                setVisibleBarCount(Math.max(8, Math.floor(node.clientWidth / (BAR_WIDTH_PX + BAR_GAP_PX))))
            }
        }
        measure()
        if (typeof ResizeObserver === 'undefined') return
        const observer = new ResizeObserver(measure)
        observer.observe(node)
        return () => observer.disconnect()
    }, [])

    const visibleLevels = waveformLevels.slice(-visibleBarCount)
    const waveformSamples = [
        ...Array<number>(Math.max(0, visibleBarCount - visibleLevels.length)).fill(0),
        ...visibleLevels
    ]

    return (
        <div
            className="flex h-10 min-w-0 flex-1 items-center gap-2 rounded-full bg-white/[0.025] px-1"
            aria-label={isTranscribing ? 'Voice note transcription' : 'Voice note recorder'}
            data-state={isTranscribing ? 'transcribing' : 'recording'}
        >
            <button
                type="button"
                onClick={onCancel}
                disabled={Boolean(disabled && !isTranscribing)}
                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sparkle-text-muted transition-[background-color,color,transform] duration-200 hover:scale-[1.04] hover:bg-white/[0.07] hover:text-sparkle-text active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 motion-reduce:transform-none motion-reduce:transition-none"
                title={isTranscribing ? 'Cancel transcription' : 'Cancel voice note'}
                aria-label={isTranscribing ? 'Cancel transcription' : 'Cancel voice note'}
            >
                <X size={14} />
            </button>

            <div ref={trackRef} className="relative h-6 min-w-0 flex-1 overflow-hidden">
                <div
                    className={cn(
                        'absolute inset-0 flex items-center transition-[opacity,transform] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transform-none motion-reduce:transition-none',
                        isTranscribing ? 'pointer-events-none -translate-y-1 opacity-0' : 'translate-y-0 opacity-100'
                    )}
                    aria-hidden={isTranscribing}
                >
                    <div className="pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2 border-t border-dashed border-white/10" aria-hidden="true" />
                    <VoiceWaveform levels={waveformSamples} className="ml-auto" />
                </div>

                <div
                    className={cn(
                        'absolute inset-0 flex min-w-0 items-center gap-2 text-[11px] font-medium text-sparkle-text-secondary transition-[opacity,transform] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transform-none motion-reduce:transition-none',
                        isTranscribing ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-1 opacity-0'
                    )}
                    aria-hidden={!isTranscribing}
                    aria-live="polite"
                >
                    <Loader2 size={13} className="shrink-0 animate-spin text-[var(--accent-primary)] motion-reduce:animate-none" />
                    <span className="min-w-0 truncate">Transcribing with ChatGPT…</span>
                </div>
            </div>

            <span className={cn(
                'min-w-[2.5rem] shrink-0 text-right text-[10px] font-medium tabular-nums tracking-[0.02em] transition-colors duration-200 motion-reduce:transition-none',
                isTranscribing ? 'text-sparkle-text-secondary' : 'text-sparkle-text-muted'
            )}>
                {durationLabel}
            </span>

            <div className={cn(
                'shrink-0 transition-[width,margin,opacity,transform] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transform-none motion-reduce:transition-none',
                isTranscribing ? '-ml-2 w-0 scale-75 opacity-0' : 'ml-0 w-8 scale-100 opacity-100'
            )}>
                <button
                    type="button"
                    onClick={onSubmit}
                    disabled={disabled || isTranscribing}
                    tabIndex={isTranscribing ? -1 : 0}
                    aria-hidden={isTranscribing}
                    className={cn(
                        'inline-flex h-8 w-8 items-center justify-center rounded-full border border-[var(--accent-primary)] bg-[var(--accent-primary)] text-[var(--accent-contrast)] transition-colors duration-200',
                        'hover:bg-[color-mix(in_srgb,var(--accent-primary)_88%,var(--color-text))] active:bg-[color-mix(in_srgb,var(--accent-primary)_80%,var(--color-text))] disabled:cursor-not-allowed disabled:opacity-45 motion-reduce:transition-none'
                    )}
                    title="Stop and transcribe voice note"
                    aria-label="Stop and transcribe voice note"
                >
                    <Square size={10} fill="currentColor" strokeWidth={1.8} />
                </button>
            </div>
        </div>
    )
})
