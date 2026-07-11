import { memo, useMemo } from 'react'
import { normalizePatchText } from '@/lib/diffRendering'
import { cn } from '@/lib/utils'

type RawPatchFallbackProps = {
    patch: string
    notice?: string | null
}

type RawPatchLineTone =
    | 'meta'
    | 'hunk'
    | 'addition'
    | 'deletion'
    | 'context'

function resolveRawPatchLineTone(line: string): RawPatchLineTone {
    if (
        line.startsWith('diff --git ')
        || line.startsWith('index ')
        || line.startsWith('--- ')
        || line.startsWith('+++ ')
        || line.startsWith('rename from ')
        || line.startsWith('rename to ')
        || line.startsWith('new file mode ')
        || line.startsWith('deleted file mode ')
        || line.startsWith('similarity index ')
        || line.startsWith('Binary files ')
    ) {
        return 'meta'
    }

    if (line.startsWith('@@')) return 'hunk'
    if (line.startsWith('+')) return 'addition'
    if (line.startsWith('-')) return 'deletion'
    return 'context'
}

const lineToneClassName: Record<RawPatchLineTone, string> = {
    meta: 'border-white/6 bg-white/[0.03] text-sparkle-text-secondary',
    hunk: 'border-sky-400/15 bg-sky-500/[0.10] text-sky-100',
    addition: 'border-emerald-400/12 bg-emerald-500/[0.10] text-emerald-100',
    deletion: 'border-red-400/12 bg-red-500/[0.10] text-red-100',
    context: 'border-transparent bg-transparent text-white/70'
}

export const RawPatchFallback = memo(function RawPatchFallback({
    patch,
    notice = null
}: RawPatchFallbackProps) {
    const lines = useMemo(() => normalizePatchText(patch).split('\n'), [patch])

    return (
        <div className="h-full overflow-auto overscroll-contain custom-scrollbar px-5 py-4 [scrollbar-gutter:stable]">
            {notice ? (
                <div className="mb-3 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-amber-200/85">
                    {notice}
                </div>
            ) : null}
            <div className="overflow-hidden rounded-2xl border border-white/10 bg-black/25 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
                <div className="overflow-x-auto overscroll-contain custom-scrollbar">
                    <div className="min-w-full">
                        {lines.map((line, index) => {
                            const tone = resolveRawPatchLineTone(line)

                            return (
                                <div
                                    key={`${index}-${line}`}
                                    className={cn(
                                        'border-b border-white/5 px-3 py-1.5 font-mono text-[12px] leading-5 last:border-b-0',
                                        lineToneClassName[tone]
                                    )}
                                >
                                    <span className="whitespace-pre">{line || ' '}</span>
                                </div>
                            )
                        })}
                    </div>
                </div>
            </div>
        </div>
    )
})
