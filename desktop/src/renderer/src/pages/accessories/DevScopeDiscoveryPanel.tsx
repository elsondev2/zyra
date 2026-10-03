import { useEffect } from 'react'
import { FolderPlus, Github, MapPin, Plus, X } from 'lucide-react'
import { NativeOverlayPortal } from '@/components/ui/native-overlay-portal'

type Props = {
    locations: string[]
    working: boolean
    onClose: () => void
    onAddLocation: () => void
    onRemoveLocation: (path: string) => void
    onAddProject: () => void
    onDiscoverGitHub?: () => void
    githubBusy?: boolean
    githubMessage?: string
}

export function DevScopeDiscoveryPanel({ locations, working, onClose, onAddLocation, onRemoveLocation, onAddProject, onDiscoverGitHub, githubBusy, githubMessage }: Props) {
    useEffect(() => {
        const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
        document.addEventListener('keydown', onKeyDown)
        return () => document.removeEventListener('keydown', onKeyDown)
    }, [onClose])
    return <NativeOverlayPortal><div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm" onClick={onClose}>
        <div role="dialog" aria-modal="true" aria-label="Discover development projects" onClick={event => event.stopPropagation()} className="w-full max-w-xl rounded-xl border border-[var(--surface-divider)] bg-[var(--surface-floating)] p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-4"><div><h2 className="text-base font-semibold text-sparkle-text">Discover projects</h2><p className="mt-1 text-xs text-sparkle-text-secondary">Choose places on this computer where your code lives.</p></div><button type="button" autoFocus onClick={onClose} aria-label="Close discovery" className="rounded-md p-1.5 text-sparkle-text-secondary hover:bg-white/10"><X size={16} /></button></div>
            <div className="mt-6"><div className="mb-2 text-xs font-semibold text-sparkle-text-secondary">Locations</div>
                {locations.length ? <div className="max-h-52 overflow-y-auto rounded-lg border border-[var(--surface-divider)]">{locations.map(path => <div key={path} className="flex min-w-0 items-center gap-2 border-b border-[var(--surface-divider)] px-3 py-2.5 last:border-b-0"><MapPin size={14} className="shrink-0 text-sparkle-text-muted" /><span className="min-w-0 flex-1 truncate font-mono text-[11px] text-sparkle-text-secondary" title={path}>{path}</span><button type="button" onClick={() => onRemoveLocation(path)} aria-label={`Remove ${path}`} className="rounded p-1 text-sparkle-text-muted hover:bg-white/10 hover:text-sparkle-text"><X size={13} /></button></div>)}</div>
                    : <p className="rounded-lg border border-dashed border-[var(--surface-divider)] px-3 py-5 text-center text-xs text-sparkle-text-muted">No project locations yet.</p>}
                <div className="mt-3 flex flex-wrap gap-2"><button type="button" onClick={onAddLocation} disabled={working} className="inline-flex items-center gap-1.5 rounded-md border border-[var(--surface-divider)] px-3 py-2 text-xs text-sparkle-text hover:bg-white/5 disabled:opacity-50"><Plus size={13} />Add location</button><button type="button" onClick={onAddProject} disabled={working} className="inline-flex items-center gap-1.5 rounded-md border border-[var(--surface-divider)] px-3 py-2 text-xs text-sparkle-text hover:bg-white/5 disabled:opacity-50"><FolderPlus size={13} />Add one project</button></div>
            </div>
            {onDiscoverGitHub ? <div className="mt-6 border-t border-[var(--surface-divider)] pt-5"><div className="text-xs font-semibold text-sparkle-text-secondary">GitHub</div><p className="mt-1 text-xs text-sparkle-text-muted">Match repositories from your authenticated GitHub CLI account to projects in these local locations.</p><button type="button" onClick={onDiscoverGitHub} disabled={githubBusy || working} className="mt-3 inline-flex items-center gap-2 rounded-md border border-[var(--surface-divider)] px-3 py-2 text-xs hover:bg-white/5 disabled:opacity-50"><Github size={14} />{githubBusy ? 'Checking GitHub…' : 'Find local GitHub projects'}</button>{githubMessage ? <p className="mt-2 text-xs text-sparkle-text-secondary">{githubMessage}</p> : null}</div> : null}
        </div>
    </div></NativeOverlayPortal>
}
