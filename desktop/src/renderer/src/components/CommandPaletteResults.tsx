import { Search } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { CommandPaletteResult } from './command-palette-types'

export function CommandPaletteResults({
    query,
    results,
    selectedIndex,
    setSelectedIndex,
    selectResult,
    loadingFiles
}: {
    query: string
    results: CommandPaletteResult[]
    selectedIndex: number
    setSelectedIndex: (value: number | ((current: number) => number)) => void
    selectResult: (result?: CommandPaletteResult) => void
    loadingFiles: boolean
}) {
    return (
        <>
            {results.length > 0 ? (
                <div className="flex-1 px-1">
                    {results.map((result, index) => {
                        const isSelected = index === selectedIndex
                        const showGroupLabel = index === 0 || results[index - 1]?.group !== result.group

                        return (
                            <div key={result.id}>
                                {showGroupLabel ? (
                                    <div className="px-3 pb-1 pt-2 text-[12px] leading-4 text-sparkle-text-muted/55">
                                        {result.group}
                                    </div>
                                ) : null}

                                <button
                                    onClick={() => selectResult(result)}
                                    onMouseEnter={() => setSelectedIndex(index)}
                                    className={cn(
                                        'group grid w-full grid-cols-[18px_minmax(0,1fr)_auto_auto] items-center gap-2.5 rounded-[10px] px-3 py-1.5 text-left outline-none transition-colors',
                                        isSelected
                                            ? 'bg-sparkle-card-hover text-sparkle-text'
                                            : 'bg-transparent text-sparkle-text-secondary hover:bg-white/[0.045] hover:text-sparkle-text'
                                    )}
                                >
                                    <span className={cn('flex h-[18px] w-[18px] items-center justify-center text-sparkle-text-muted/55', isSelected && 'text-sparkle-text-secondary')}>
                                        {result.icon || <span className="h-1.5 w-1.5 rounded-full bg-sparkle-text-muted/60" />}
                                    </span>
                                    <span className="min-w-0 truncate text-[14px] leading-5 font-normal">
                                        {result.title}
                                    </span>
                                    {result.subtitle ? (
                                        <span className="hidden max-w-[132px] truncate text-[13px] leading-5 text-sparkle-text-muted/55 sm:block">
                                            {result.subtitle}
                                        </span>
                                    ) : null}
                                    {result.badge ? (
                                        <span className="rounded-md bg-white/[0.065] px-1.5 py-0.5 text-[11px] leading-4 text-sparkle-text-muted/70">
                                            {result.badge.replace(/^\/\/\s*/, '').replace(/^\/\s*/, '')}
                                        </span>
                                    ) : null}
                                </button>
                            </div>
                        )
                    })}
                </div>
            ) : null}

            {results.length === 0 && query.trim() !== '' && !loadingFiles ? (
                <div className="flex flex-col items-center justify-center px-8 py-10 text-center">
                    <Search size={18} className="mb-2 stroke-[1.5] text-sparkle-text-muted/45" />
                    <div className="mb-1 text-[14px] text-sparkle-text">No results found</div>
                    <div className="max-w-[260px] text-[12px] text-sparkle-text-muted/60">
                        No match for "{query}". Try a chat title or action name.
                    </div>
                </div>
            ) : null}

            {loadingFiles ? (
                <div className="flex flex-col items-center justify-center px-8 py-10 text-center">
                    <div className="mb-3 h-6 w-6 animate-spin rounded-full border-2 border-sparkle-border border-t-sparkle-text-secondary" />
                    <div className="text-[13px] text-sparkle-text">Searching...</div>
                </div>
            ) : null}
        </>
    )
}
