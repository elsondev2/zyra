import { useEffect, useRef, useState } from 'react'
import { LayoutGrid, List, RefreshCw, Search, SlidersHorizontal } from 'lucide-react'
import type { ProjectSortOrder } from './devscopePortfolioPaths'

export type SearchField = 'both' | 'name' | 'path'

type Props = {
    query: string
    onQueryChange: (value: string) => void
    searchField: SearchField
    onSearchFieldChange: (value: SearchField) => void
    sortOrder: ProjectSortOrder
    onSortOrderChange: (value: ProjectSortOrder) => void
    view: 'list' | 'cards'
    onViewChange: (value: 'list' | 'cards') => void
    refreshing: boolean
    onRefresh: () => void
}

export function DevScopePortfolioToolbar(props: Props) {
    const [searchOptionsOpen, setSearchOptionsOpen] = useState(false)
    const searchRef = useRef<HTMLDivElement>(null)
    const inputRef = useRef<HTMLInputElement>(null)

    useEffect(() => {
        if (!searchOptionsOpen) return
        const outside = (event: PointerEvent) => {
            if (!searchRef.current?.contains(event.target as Node)) setSearchOptionsOpen(false)
        }
        const escape = (event: KeyboardEvent) => {
            if (event.key === 'Escape') setSearchOptionsOpen(false)
        }
        document.addEventListener('pointerdown', outside)
        document.addEventListener('keydown', escape)
        return () => {
            document.removeEventListener('pointerdown', outside)
            document.removeEventListener('keydown', escape)
        }
    }, [searchOptionsOpen])

    return <div className="pt-6">
        <div ref={searchRef} className="relative flex w-full items-center gap-2 border-b border-[var(--surface-divider)] pb-2 transition-colors focus-within:border-[var(--accent-primary)]">
            <Search size={15} className="shrink-0 text-sparkle-text-muted" />
            <input
                ref={inputRef}
                aria-label="Search projects"
                value={props.query}
                onChange={event => props.onQueryChange(event.target.value)}
                placeholder={props.searchField === 'name' ? 'Search project names' : props.searchField === 'path' ? 'Search project paths' : 'Search projects or paths'}
                className="min-w-0 flex-1 bg-transparent py-0.5 text-sm text-sparkle-text outline-none placeholder:text-sparkle-text-muted"
            />
            <button
                type="button"
                aria-label="Search fields"
                aria-expanded={searchOptionsOpen}
                title="Search names or paths"
                onClick={() => setSearchOptionsOpen(value => !value)}
                className="rounded p-1 text-sparkle-text-muted hover:bg-white/5 hover:text-sparkle-text"
            ><SlidersHorizontal size={14} /></button>
            {searchOptionsOpen ? <div role="menu" aria-label="Search fields" className="absolute right-0 top-full z-30 mt-1 w-40 rounded-lg border border-[var(--surface-divider)] bg-[var(--surface-floating)] p-1 shadow-xl">
                {([['both', 'Names and paths'], ['name', 'Names only'], ['path', 'Paths only']] as const).map(([value, label]) =>
                    <button key={value} type="button" role="menuitemradio" aria-checked={props.searchField === value}
                        onClick={() => { props.onSearchFieldChange(value); setSearchOptionsOpen(false); inputRef.current?.focus() }}
                        className="flex w-full items-center justify-between rounded px-2.5 py-2 text-left text-xs hover:bg-white/10">
                        <span>{label}</span>{props.searchField === value ? <span aria-hidden="true">✓</span> : null}
                    </button>)}
            </div> : null}
        </div>
        <div className="mt-3 flex min-h-9 w-full items-center justify-between gap-2">
            <select aria-label="Sort projects" value={props.sortOrder} onChange={event => props.onSortOrderChange(event.target.value as ProjectSortOrder)}
                className="max-w-40 cursor-pointer border-0 border-b border-transparent bg-transparent px-1 py-1.5 text-xs text-sparkle-text-secondary outline-none hover:border-[var(--surface-divider)] focus:border-[var(--accent-primary)]">
                <option value="recent">Latest activity</option>
                <option value="oldest">Oldest activity</option>
                <option value="name">Name A–Z</option>
            </select>
            <div className="flex items-center gap-2">
                <div className="inline-flex items-center">
                    <button type="button" aria-label="List view" aria-pressed={props.view === 'list'} onClick={() => props.onViewChange('list')}
                        className={`rounded p-1.5 ${props.view === 'list' ? 'bg-white/10 text-sparkle-text' : 'text-sparkle-text-muted hover:text-sparkle-text'}`}><List size={15} /></button>
                    <button type="button" aria-label="Card view" aria-pressed={props.view === 'cards'} onClick={() => props.onViewChange('cards')}
                        className={`rounded p-1.5 ${props.view === 'cards' ? 'bg-white/10 text-sparkle-text' : 'text-sparkle-text-muted hover:text-sparkle-text'}`}><LayoutGrid size={15} /></button>
                </div>
                <span aria-hidden="true" className="h-4 w-px bg-[var(--surface-divider)]" />
                <button type="button" onClick={props.onRefresh} disabled={props.refreshing} title="Refresh projects and Git" aria-label="Refresh projects and Git"
                    className="rounded p-1.5 text-sparkle-text-muted hover:bg-white/5 hover:text-sparkle-text disabled:opacity-50">
                    <RefreshCw size={14} className={props.refreshing ? 'animate-spin' : ''} />
                </button>
            </div>
        </div>
    </div>
}
