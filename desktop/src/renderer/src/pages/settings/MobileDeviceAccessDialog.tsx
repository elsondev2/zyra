import { useEffect, useState } from 'react'
import { Folder, Search, SlidersHorizontal, Smartphone } from 'lucide-react'
import type { MobileAccessApi, MobileAccessState, MobileDevice, MobileProjectChoice } from '@shared/mobile-access'
import { mobileAccessError } from '@shared/mobile-access-policy'
import { SettingsButton, SettingsDialog, SettingsSegmented, SettingsSwitch } from './settings-layout'

const key = (path: string) => path.replaceAll('\\', '/').replace(/\/$/, '').toLowerCase()
export function MobileDeviceAccessDialog({ device, api, onClose, onSaved }: { device: MobileDevice; api: MobileAccessApi; onClose: () => void; onSaved: (state: MobileAccessState) => void }) {
    const [projects, setProjects] = useState<MobileProjectChoice[]>([])
    const [hidden, setHidden] = useState(device.hiddenProjects || [])
    const [mode, setMode] = useState<'all' | 'custom'>(hidden.length ? 'custom' : 'all')
    const [advanced, setAdvanced] = useState(false)
    const [expanded, setExpanded] = useState<string | null>(null)
    const [query, setQuery] = useState('')
    const [loading, setLoading] = useState(true)
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [loadFailed, setLoadFailed] = useState(false)
    const [attempt, setAttempt] = useState(0)
    useEffect(() => {
        let alive = true
        setLoading(true); setLoadFailed(false); setError(null)
        void api.getProjects().then(next => { if (alive) setProjects(next) }).catch(e => { if (alive) { setError(mobileAccessError(e)); setLoadFailed(true) } }).finally(() => { if (alive) setLoading(false) })
        return () => { alive = false }
    }, [api, attempt])
    const close = () => { if (!busy) onClose() }
    const save = async () => {
        const next = mode === 'all' ? [] : hidden
        if (JSON.stringify(next.map(key).sort()) === JSON.stringify((device.hiddenProjects || []).map(key).sort())) { onClose(); return }
        setBusy(true); setError(null)
        try { onSaved(await api.setDeviceAccess(device.id, { hiddenProjects: mode === 'all' ? [] : hidden })) }
        catch (e) { setError(mobileAccessError(e)) }
        finally { setBusy(false) }
    }
    const hiddenSet = new Set(hidden.map(key))
    const shown = projects.filter(project => (project.name + (advanced ? ' ' + project.paths.join(' ') : '')).toLowerCase().includes(query.toLowerCase()))
    const change = (paths: string[], visible: boolean) => setHidden(old => visible ? old.filter(path => !paths.some(root => key(root) === key(path))) : [...new Set([...old, ...paths])])
    return <SettingsDialog open title="Project access" onClose={close} className="!max-w-[560px]" contentClassName="!space-y-4"
        footer={<><SettingsButton variant="ghost" disabled={busy} onClick={close}>Cancel</SettingsButton><SettingsButton variant="accent" disabled={busy || loading || loadFailed} onClick={() => void save()}>{busy ? 'Saving…' : 'Save for this device'}</SettingsButton></>}>
        <div className="flex items-center gap-3"><Smartphone size={19} className="shrink-0" /><div className="min-w-0"><p className="truncate text-sm font-medium">{device.name}</p><p className="mt-0.5 text-xs text-[var(--settings-text-secondary)]">These choices apply only to this device.</p></div></div>
        <div className="flex flex-wrap items-center justify-between gap-2"><SettingsSegmented label="Project access mode" value={mode} onChange={setMode} disabled={busy} options={[{ value: 'all', label: 'All projects' }, { value: 'custom', label: 'Choose projects' }]} /><SettingsButton variant="ghost" aria-pressed={advanced} disabled={busy} onClick={() => setAdvanced(value => !value)}><SlidersHorizontal size={13} />{advanced ? 'Basic view' : 'Advanced'}</SettingsButton></div>
        {mode === 'all' ? <p className="py-2 text-xs leading-5 text-[var(--settings-text-secondary)]">All current and past chats are available. New projects are included automatically.</p> : <div className="space-y-2">
            <label className="flex items-center gap-2 rounded-md border border-[var(--settings-border)] bg-[var(--settings-control)] px-3"><Search size={14} /><input aria-label="Find a project" placeholder="Find a project" value={query} onChange={e => setQuery(e.target.value)} className="h-9 min-w-0 flex-1 bg-transparent text-xs outline-none" /></label>
            <div className="max-h-[min(340px,42vh)] overflow-y-auto overscroll-contain pr-1">
                {loading ? <p className="py-4 text-xs text-[var(--settings-text-secondary)]">Loading projects…</p> : shown.length ? shown.map(project => {
                    const visible = !project.paths.some(path => hiddenSet.has(key(path)))
                    const partial = !visible && project.paths.some(path => !hiddenSet.has(key(path)))
                    const open = expanded === project.paths[0]
                    const duplicate = projects.filter(other => other.name === project.name).length > 1
                    return <div key={project.paths[0]} className="border-b border-[var(--settings-border)] last:border-0">
                        <div className="flex min-h-14 items-center gap-3 py-2"><Folder size={15} className="shrink-0 text-[var(--settings-text-secondary)]" /><div className="min-w-0 flex-1"><p className="truncate text-[13px]">{project.name}</p>{duplicate || advanced ? <p className="mt-0.5 truncate text-[11px] text-[var(--settings-text-muted)]" title={project.paths[0]}>{project.paths[0]}</p> : null}{partial ? <p className="text-[11px] text-[var(--settings-text-muted)]">Some folders visible</p> : null}</div><SettingsButton variant="ghost" aria-label={'Folder scope for ' + project.name} aria-expanded={open} disabled={busy} onClick={() => setExpanded(open ? null : project.paths[0])}><SlidersHorizontal size={13} /></SettingsButton><SettingsSwitch label={'Show ' + project.name + ' on ' + device.name} checked={visible} disabled={busy} onCheckedChange={value => change(project.paths, value)} /></div>
                        {open ? <div className="mb-3 ml-7 space-y-3 border-l border-[var(--settings-border)] pl-3"><p className="text-[11px] text-[var(--settings-text-secondary)]">Chats in these folders</p>{project.paths.map(path => <div key={path} className="flex items-center gap-3"><span className="min-w-0 flex-1 break-all text-[11px] leading-4 text-[var(--settings-text-secondary)]">{path}</span><SettingsSwitch label={'Show chats in ' + path} checked={!hiddenSet.has(key(path))} disabled={busy} onCheckedChange={value => change([path], value)} /></div>)}</div> : null}
                    </div>
                }) : !loadFailed ? <p className="py-4 text-xs text-[var(--settings-text-secondary)]">{query ? 'No matching projects.' : 'New projects appear automatically.'}</p> : null}
            </div>
            <p className="text-[11px] leading-4 text-[var(--settings-text-muted)]">New projects stay visible until you hide them.</p>
        </div>}
        {advanced ? <p className="border-t border-[var(--settings-border)] pt-3 text-xs leading-5 text-[var(--settings-text-secondary)]">Project visibility controls chats and their files. Terminal commands still run with your PC’s permissions. Hiding a project cannot erase copies already saved on this device.</p> : null}
        {error ? <div role="alert" className="text-xs text-[var(--status-danger)]">{error}{loadFailed ? <SettingsButton className="ml-2" onClick={() => setAttempt(value => value + 1)}>Retry</SettingsButton> : null}</div> : null}
    </SettingsDialog>
}
