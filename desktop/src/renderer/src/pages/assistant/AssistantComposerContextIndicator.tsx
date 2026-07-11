import { memo } from 'react'
import type { AssistantTurnUsage } from '@shared/assistant/contracts'
import { cn } from '@/lib/utils'
import { formatCompactMetric } from './AssistantPageHelpers'

function getContextTone(percent: number | null): {
    ringColor: string
    textClass: string
    glowClass: string
} {
    if (percent == null) {
        return {
            ringColor: 'rgba(148, 163, 184, 0.85)',
            textClass: 'text-sparkle-text-secondary',
            glowClass: 'shadow-[0_0_0_1px_rgba(255,255,255,0.05)]'
        }
    }
    if (percent >= 90) {
        return {
            ringColor: 'rgba(248, 113, 113, 0.95)',
            textClass: 'text-red-300',
            glowClass: 'shadow-[0_0_0_1px_rgba(248,113,113,0.18)]'
        }
    }
    if (percent >= 70) {
        return {
            ringColor: 'rgba(251, 191, 36, 0.95)',
            textClass: 'text-amber-300',
            glowClass: 'shadow-[0_0_0_1px_rgba(251,191,36,0.16)]'
        }
    }
    return {
        ringColor: 'rgba(52, 211, 153, 0.95)',
        textClass: 'text-emerald-300',
        glowClass: 'shadow-[0_0_0_1px_rgba(52,211,153,0.16)]'
    }
}

export const AssistantComposerContextIndicator = memo(function AssistantComposerContextIndicator({
    usage
}: {
    usage?: AssistantTurnUsage | null
}) {
    const usedTokens = usage?.totalTokens ?? null
    const contextWindowTokens = usage?.modelContextWindow ?? null
    const hasContextWindow = contextWindowTokens != null && Number.isFinite(contextWindowTokens) && contextWindowTokens > 0
    const rawPercent = hasContextWindow && usedTokens != null && Number.isFinite(usedTokens)
        ? (usedTokens / contextWindowTokens) * 100
        : null
    const displayPercent = rawPercent != null ? Math.max(0, Math.min(100, Math.round(rawPercent))) : null
    const visualPercent = rawPercent != null ? Math.max(0, Math.min(100, rawPercent)) : 0
    const tone = getContextTone(displayPercent)
    const centerLabel = displayPercent != null ? `${displayPercent}` : '--'
    const usageLabel = usedTokens != null && contextWindowTokens != null
        ? `${formatCompactMetric(usedTokens)} / ${formatCompactMetric(contextWindowTokens)} tokens used`
        : hasContextWindow
            ? `Window size: ${formatCompactMetric(contextWindowTokens)} tokens`
            : 'Usage reports after the first completed turn'

    return (
        <div className="group/context relative shrink-0">
            <button
                type="button"
                className={cn(
                    'inline-flex h-[30px] w-[30px] items-center justify-center rounded-full border border-transparent bg-white/[0.025] text-sparkle-text-secondary transition-colors hover:bg-white/[0.045] hover:text-sparkle-text focus:outline-none focus-visible:bg-white/[0.045]',
                    tone.glowClass
                )}
                title={displayPercent != null ? `Context window ${displayPercent}% full` : 'Context window usage unavailable'}
                aria-label={displayPercent != null ? `Context window ${displayPercent}% full` : 'Context window usage unavailable'}
            >
                <span
                    className="relative flex h-[18px] w-[18px] items-center justify-center rounded-full"
                    style={{
                        background: `conic-gradient(${tone.ringColor} 0deg ${visualPercent * 3.6}deg, rgba(255,255,255,0.09) ${visualPercent * 3.6}deg 360deg)`
                    }}
                >
                    <span className="absolute inset-[2.5px] rounded-full bg-sparkle-card shadow-[inset_0_0_0_1px_rgba(255,255,255,0.05)]" />
                    <span className={cn('relative z-10 text-[7px] font-semibold tabular-nums', tone.textClass)}>
                        {centerLabel}
                    </span>
                </span>
            </button>

            <div className="pointer-events-none absolute bottom-full right-0 z-[170] mb-1.5 w-[176px] translate-y-0.5 opacity-0 transition-all duration-150 group-hover/context:pointer-events-auto group-hover/context:translate-y-0 group-hover/context:opacity-100 group-focus-within/context:pointer-events-auto group-focus-within/context:translate-y-0 group-focus-within/context:opacity-100">
                <div className="overflow-hidden rounded-[15px] border border-white/10 bg-sparkle-card/98 px-2.5 py-2 text-left shadow-[0_18px_36px_rgba(0,0,0,0.42)] backdrop-blur-xl">
                    <div className="space-y-0.5">
                        <p className={cn('text-[13px] font-semibold leading-4 tracking-[-0.01em]', tone.textClass)}>
                            {displayPercent != null ? `${displayPercent}% full` : 'Waiting for usage'}
                        </p>
                        <p className="text-[10px] font-medium leading-3.5 text-sparkle-text">{usageLabel}</p>
                    </div>
                    <p className="mt-1.5 text-[9px] font-medium leading-3.5 text-sparkle-text-secondary">
                        Auto-compacts context
                    </p>
                </div>
            </div>
        </div>
    )
})
