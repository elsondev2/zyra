import { useEffect, useId, useRef, useState } from 'react'
import { History, Info, LoaderCircle, RotateCcw } from 'lucide-react'
import { createPassivePortal } from '@/components/ui/native-overlay-portal'

export type VisualizationLibraryLoad = 'idle' | 'loading' | 'ready' | 'error' | 'unavailable'

type Props = {
    scope: 'thread' | 'project'
    projectPath: string | null
    load: VisualizationLibraryLoad
    error: string
    status: { skippedCount: number; indexingOlder: boolean; readOnly: boolean }
    onScopeChange: (scope: 'thread' | 'project') => void
    onRetry: () => void
    onIndexOlder: () => void
}

const iconClass = 'inline-flex size-6 shrink-0 items-center justify-center rounded text-sparkle-text-muted/65 hover:bg-[var(--surface-hover)] hover:text-sparkle-text focus-visible:outline focus-visible:outline-1 focus-visible:outline-[var(--accent-primary)]'

export function VisualizationLibraryControls({ scope, projectPath, load, error, status, onScopeChange, onRetry, onIndexOlder }: Props) {
    const anchor = useRef<HTMLButtonElement | null>(null)
    const tooltipId = useId()
    const [open, setOpen] = useState(false)
    const [position, setPosition] = useState({ left: 0, top: 0, width: 288 })
    const messages = ['The scope applies to saved visualizations. Images and links stay in this thread. Saved visuals retain their revisions for reuse in chat.']
    if (load === 'idle') messages.push('Open a chat to view saved visualizations.')
    if (load === 'loading') messages.push('Loading saved visualizations…')
    if (load === 'unavailable') messages.push('Saved visualizations are unavailable in this client. The app and runtime need matching visualization support.')
    if (load === 'error') messages.push(error || 'Could not load saved visualizations. Use Retry to try again.')
    if (load === 'ready') {
        if (status.readOnly) messages.push('The storage folder is read-only. Existing saved visuals are available; older visuals are not imported.')
        if (status.skippedCount) messages.push(`${status.skippedCount} historical visual${status.skippedCount === 1 ? '' : 's'} skipped because the source did not pass safety validation.`)
        if (status.indexingOlder) messages.push('More history is available. Use Index older visuals to continue loading it.')
    }
    const description = messages.join(' ')
    const showInfo = () => {
        const bounds = anchor.current?.getBoundingClientRect()
        if (!bounds) return
        const width = Math.min(288, window.innerWidth - 16)
        setPosition({ width, left: Math.max(8, Math.min(bounds.right - width, window.innerWidth - width - 8)), top: bounds.bottom + 6 })
        setOpen(true)
    }
    useEffect(() => {
        if (!open) return
        const close = () => setOpen(false)
        window.addEventListener('resize', close)
        window.addEventListener('scroll', close, true)
        return () => {
            window.removeEventListener('resize', close)
            window.removeEventListener('scroll', close, true)
        }
    }, [open])
    return (
        <>
            <select
                aria-label="Visualization scope"
                title="Saved visualization scope"
                value={scope}
                disabled={load === 'idle' || load === 'unavailable'}
                onChange={event => onScopeChange(event.target.value as 'thread' | 'project')}
                className="h-6 min-w-0 max-w-[110px] shrink-0 rounded border border-white/[0.08] bg-[var(--color-bg)] px-1 text-[10px] text-sparkle-text-secondary outline-none focus-visible:border-[var(--accent-primary)]/50 disabled:opacity-50"
            >
                <option value="thread">This thread</option>
                <option value="project">{projectPath ? 'This project' : 'This workspace'}</option>
            </select>
            <button
                ref={anchor}
                type="button"
                aria-label="Visualization info"
                aria-describedby={open ? tooltipId : undefined}
                className={iconClass}
                onMouseEnter={showInfo}
                onMouseLeave={() => { if (document.activeElement !== anchor.current) setOpen(false) }}
                onFocus={showInfo}
                onBlur={() => setOpen(false)}
                onClick={showInfo}
                onKeyDown={event => { if (event.key === 'Escape') setOpen(false) }}
            >
                {load === 'loading' ? <LoaderCircle size={12} className="animate-spin" aria-hidden="true" /> : <Info size={12} className={load === 'error' ? 'text-amber-400' : undefined} aria-hidden="true" />}
            </button>
            {load === 'error' && <button type="button" aria-label="Retry visualizations" title="Retry visualizations" className={iconClass} onClick={onRetry}><RotateCcw size={12} /></button>}
            {load === 'ready' && status.indexingOlder && <button type="button" aria-label="Index older visuals" title="Continue indexing older visuals" className={iconClass} onClick={onIndexOlder}><History size={12} /></button>}
            {open && createPassivePortal(
                <div id={tooltipId} role="tooltip" className="pointer-events-none fixed z-[3000] rounded-md border border-[var(--surface-panel-divider)] bg-[color-mix(in_srgb,var(--color-card)_96%,var(--color-bg))] px-2.5 py-2 text-[10px] leading-relaxed text-sparkle-text-secondary shadow-[0_10px_28px_rgba(0,0,0,0.24)]" style={position}>
                    <p className="mb-1 font-medium text-sparkle-text">Saved visualizations</p>
                    {messages.map(message => <p key={message} className="mt-1">{message}</p>)}
                </div>, document.body,
            )}
            <span className="sr-only" role={load === 'error' ? 'alert' : 'status'}>{description}</span>
        </>
    )
}
