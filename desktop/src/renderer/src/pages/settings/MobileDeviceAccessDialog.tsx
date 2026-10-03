import { useEffect, useState } from 'react'
import { ChevronDown, Search, Smartphone } from 'lucide-react'
import type { MobileAccessApi, MobileAccessState, MobileDevice, MobileProjectChoice } from '@shared/mobile-access'
import { mobileAccessError } from '@shared/mobile-access-policy'
import { SettingsButton, SettingsDialog, SettingsSwitch } from './settings-layout'
import { SensitiveSettingValue } from './SensitiveSettingValue'
import { SettingsExpander } from './SettingsExpander'
import { AssistantProjectIcon } from '../assistant/AssistantProjectIcon'

const key = (path: string) => path.replaceAll('\\', '/').replace(/\/$/, '').toLowerCase()
export function MobileDeviceAccessDialog({ device, api, onClose, onSaved }: { device: MobileDevice; api: MobileAccessApi; onClose: () => void; onSaved: (state: MobileAccessState) => void }) {
    const [projects, setProjects] = useState<MobileProjectChoice[]>([])
    const [hidden, setHidden] = useState(device.hiddenProjects || [])
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
        if (JSON.stringify(hidden.map(key).sort()) === JSON.stringify((device.hiddenProjects || []).map(key).sort())) { onClose(); return }
        setBusy(true); setError(null)
        try { onSaved(await api.setDeviceAccess(device.id, { hiddenProjects: hidden })) }
        catch (e) { setError(mobileAccessError(e)) }
        finally { setBusy(false) }
    }
    const hiddenSet = new Set(hidden.map(key))
    const allSelected = hidden.length === 0
    const shown = projects.filter(project => (project.name + ' ' + project.folders.map(folder => folder.label).join(' ')).toLowerCase().includes(query.toLowerCase()))
    const change = (paths: string[], visible: boolean) => setHidden(old => visible ? old.filter(path => !paths.some(root => key(root) === key(path))) : [...new Set([...old, ...paths])])
    const selectAll = (selected: boolean) => setHidden(selected ? [] : [...new Set(projects.flatMap(project => project.paths))])
    return <SettingsDialog open title="Project access" description="Project visibility controls chats and their files. Commands still use your PC’s permissions, and hiding can’t erase copies already saved on this phone." descriptionMode="info" onClose={close} className="!max-w-[560px]" contentClassName="!space-y-2"
        footer={<><div className="mr-auto flex min-w-0 max-w-[180px] items-center gap-1"><Smartphone size={16} className="shrink-0 text-[var(--settings-text-secondary)]" /><div className="min-w-0 overflow-hidden"><SensitiveSettingValue value={device.name} label="Device name" /></div></div><SettingsButton variant="ghost" disabled={busy} onClick={close}>Cancel</SettingsButton><SettingsButton variant="accent" disabled={busy || loading || loadFailed} onClick={() => void save()}>{busy ? 'Saving…' : 'Save'}</SettingsButton></>}>
        <div className="flex items-center gap-2">
            <label className="flex min-w-0 flex-1 items-center gap-2 rounded-md border border-[var(--settings-border)] bg-[var(--settings-control)] px-3"><Search size={14} className="shrink-0" /><input aria-label="Find a project" placeholder="Find a project" value={query} onChange={e => setQuery(e.target.value)} className="h-9 min-w-0 flex-1 bg-transparent text-xs outline-none" /></label>
        </div>
            <div className="max-h-[calc(min(340px,42vh)_+_36px)] overflow-y-auto overscroll-contain pr-1">
                <div className="sticky top-0 z-10 flex h-9 items-center justify-between border-b border-[var(--settings-border)] bg-[var(--settings-popover)]">
                    <span className="text-xs text-[var(--settings-text-secondary)]">Select all projects</span>
                    <SettingsSwitch label="Select all projects on this device" checked={allSelected} disabled={busy || loading || loadFailed} onCheckedChange={selectAll} />
                </div>
                {loading ? <p className="py-4 text-xs text-[var(--settings-text-secondary)]">Loading projects…</p> : shown.length ? shown.map(project => {
                    const hiddenCount = project.paths.filter(path => hiddenSet.has(key(path))).length
                    const visible = hiddenCount < project.paths.length
                    const partial = hiddenCount > 0 && visible
                    const open = expanded === project.paths[0]
                    return <div key={project.paths[0]} className="border-b border-[var(--settings-border)] last:border-0">
                        <div className="flex min-h-11 items-center gap-2 py-1.5"><AssistantProjectIcon projectPath={project.iconPath || project.paths[0]} size={18} className="shrink-0" /><p className="min-w-0 flex-1 truncate text-[13px]">{project.name}</p>{partial ? <span className="text-[10px] text-[var(--settings-text-muted)]">Partial</span> : null}{project.folders.length ? <SettingsButton variant="ghost" className="!size-7 !px-0" aria-label={'Show attached folders for ' + project.name} aria-expanded={open} disabled={busy} onClick={() => setExpanded(open ? null : project.paths[0])}><ChevronDown size={14} className={`transition-transform ${open ? 'rotate-180' : ''}`} /></SettingsButton> : null}<SettingsSwitch label={'Show ' + project.name + ' on this device'} checked={visible} disabled={busy} onCheckedChange={value => change(project.paths, value)} /></div>
                        {project.folders.length ? <SettingsExpander open={open}><div className="mb-2 ml-7 space-y-2 border-l border-[var(--settings-border)] pl-3">{project.folders.map(folder => <div key={folder.path} className="flex items-center gap-3"><span className="min-w-0 flex-1 truncate text-xs text-[var(--settings-text-secondary)]">{folder.label}</span><SettingsSwitch label={'Show ' + folder.label + ' in ' + project.name + ' on this device'} checked={!hiddenSet.has(key(folder.path))} disabled={busy} onCheckedChange={value => change([folder.path], value)} /></div>)}</div></SettingsExpander> : null}
                    </div>
                }) : !loadFailed ? <p className="py-4 text-xs text-[var(--settings-text-secondary)]">{query ? 'No matching projects.' : 'No projects yet.'}</p> : null}
            </div>
        {error ? <div role="alert" className="text-xs text-[var(--status-danger)]">{error}{loadFailed ? <SettingsButton className="ml-2" onClick={() => setAttempt(value => value + 1)}>Retry</SettingsButton> : null}</div> : null}
    </SettingsDialog>
}
