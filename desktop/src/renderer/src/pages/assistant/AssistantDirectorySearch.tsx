import { useEffect, useId, useRef, useState } from 'react'
import { Search, X } from 'lucide-react'

/** Shared expanding search field for fleet directories. */
export function AssistantDirectorySearch({ entity, query, onChange, disabled = false }: {
    entity: 'agents' | 'workflows'; query: string; onChange: (value: string) => void; disabled?: boolean
}) {
    const [open, setOpen] = useState(false)
    const inputRef = useRef<HTMLInputElement | null>(null)
    const triggerRef = useRef<HTMLButtonElement | null>(null)
    const id = useId()
    const expanded = open || Boolean(query)
    useEffect(() => { if (open) inputRef.current?.focus() }, [open])
    const close = () => { onChange(''); setOpen(false); triggerRef.current?.focus() }
    return <div className="assistant-agent-directory__search-tools">
        <div className="assistant-agent-directory__search" data-expanded={expanded}
            onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget) && !query) setOpen(false) }}>
            <button ref={triggerRef} type="button" className="assistant-agent-directory__search-trigger" aria-label={`Search ${entity}`}
                aria-expanded={expanded} aria-controls={id} title={`Search ${entity}`} disabled={disabled}
                onClick={() => { setOpen(true); inputRef.current?.focus() }}><Search size={15} /></button>
            <input ref={inputRef} id={id} type="search" aria-label={`Search ${entity}`} placeholder="Search…" value={query}
                tabIndex={expanded ? 0 : -1} aria-hidden={!expanded} disabled={disabled || !expanded}
                onChange={event => onChange(event.target.value)} onKeyDown={event => { if (event.key === 'Escape') close() }} />
            <button type="button" className="assistant-agent-directory__search-close" aria-label={`Clear ${entity} search`}
                tabIndex={expanded ? 0 : -1} aria-hidden={!expanded} onClick={close}><X size={13} /></button>
        </div>
    </div>
}
