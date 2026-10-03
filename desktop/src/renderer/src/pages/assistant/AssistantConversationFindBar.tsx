import { useEffect, useRef } from 'react'
import { ArrowDown, ArrowUp, Search, X } from 'lucide-react'
import { addOverlayEventListener } from '@/components/ui/native-overlay-portal'

export function AssistantConversationFindBar({
    query,
    onQueryChange,
    matchCount,
    currentIndex,
    onNext,
    onPrevious,
    onClose
}: {
    query: string
    onQueryChange: (value: string) => void
    matchCount: number
    currentIndex: number
    onNext: () => void
    onPrevious: () => void
    onClose: () => void
}) {
    const inputRef = useRef<HTMLInputElement | null>(null)
    useEffect(() => {
        inputRef.current?.focus()
        inputRef.current?.select()
        return addOverlayEventListener('keydown', event => {
            if (event.key === 'Escape') {
                event.preventDefault()
                onClose()
            }
        }, true)
    }, [onClose])
    return <div className="absolute right-3 top-3 z-30 flex items-center gap-1.5 rounded-lg border border-white/[0.1] bg-[var(--color-card)]/95 px-2 py-1.5 shadow-xl backdrop-blur" role="search" aria-label="Find in chat">
        <Search className="size-3.5 shrink-0 text-sparkle-text-muted/60" aria-hidden="true" />
        <input
            ref={inputRef}
            value={query}
            onChange={event => onQueryChange(event.target.value)}
            onKeyDown={event => {
                if (event.key === 'Enter') {
                    event.preventDefault()
                    event.shiftKey ? onPrevious() : onNext()
                }
            }}
            placeholder="Find in chat"
            aria-label="Find in chat"
            className="w-48 bg-transparent text-xs text-sparkle-text outline-none placeholder:text-sparkle-text-muted/50"
        />
        <span className="min-w-[3.5rem] text-center text-[10px] tabular-nums text-sparkle-text-muted/60" aria-live="polite">{matchCount ? `${currentIndex + 1} / ${matchCount}` : 'No matches'}</span>
        <button type="button" onClick={onPrevious} disabled={!matchCount} className="inline-flex size-6 items-center justify-center rounded text-sparkle-text-muted hover:bg-white/[0.06] hover:text-sparkle-text disabled:opacity-30" title="Previous match (Shift+Enter)" aria-label="Previous match"><ArrowUp className="size-3.5" /></button>
        <button type="button" onClick={onNext} disabled={!matchCount} className="inline-flex size-6 items-center justify-center rounded text-sparkle-text-muted hover:bg-white/[0.06] hover:text-sparkle-text disabled:opacity-30" title="Next match (Enter)" aria-label="Next match"><ArrowDown className="size-3.5" /></button>
        <button type="button" onClick={onClose} className="inline-flex size-6 items-center justify-center rounded text-sparkle-text-muted hover:bg-white/[0.06] hover:text-sparkle-text" title="Close find (Escape)" aria-label="Close find"><X className="size-3.5" /></button>
    </div>
}
