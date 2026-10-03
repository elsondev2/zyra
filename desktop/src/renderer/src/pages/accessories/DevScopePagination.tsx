import { ChevronLeft, ChevronRight } from 'lucide-react'

type Props = {
    page: number
    pageSize: number
    total: number
    onPageChange: (page: number) => void
    onPageSizeChange: (pageSize: number) => void
}

export function DevScopePagination({ page, pageSize, total, onPageChange, onPageSizeChange }: Props) {
    if (total === 0) return null
    const pages = Math.max(1, Math.ceil(total / pageSize))
    const current = Math.min(page, pages)
    const start = (current - 1) * pageSize + 1
    const end = Math.min(current * pageSize, total)
    return <nav aria-label="Project pages" className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--surface-divider)] pt-4 text-xs text-sparkle-text-muted">
        <span>{start}–{end} of {total} projects</span>
        <div className="flex items-center gap-2">
            <label htmlFor="devscope-page-size">Per page</label>
            <select id="devscope-page-size" value={pageSize} onChange={event => onPageSizeChange(Number(event.target.value))} className="rounded-md border border-[var(--surface-divider)] bg-[var(--surface-floating)] px-2 py-1.5 text-sparkle-text-secondary outline-none">
                <option value={12}>12</option><option value={24}>24</option><option value={48}>48</option>
            </select>
            <button type="button" onClick={() => onPageChange(current - 1)} disabled={current <= 1} aria-label="Previous page" className="rounded-md border border-[var(--surface-divider)] p-1.5 text-sparkle-text-secondary hover:bg-white/5 disabled:opacity-40"><ChevronLeft size={14} /></button>
            <span className="min-w-16 text-center text-sparkle-text-secondary">{current} / {pages}</span>
            <button type="button" onClick={() => onPageChange(current + 1)} disabled={current >= pages} aria-label="Next page" className="rounded-md border border-[var(--surface-divider)] p-1.5 text-sparkle-text-secondary hover:bg-white/5 disabled:opacity-40"><ChevronRight size={14} /></button>
        </div>
    </nav>
}
