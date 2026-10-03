import { useMemo, useState } from 'react'
import { Archive, FolderOpen, FolderPlus, Image, MoreHorizontal, Plus, RotateCcw, X } from 'lucide-react'
import { FileActionsMenu } from '@/components/ui/FileActionsMenu'
import type { AssistantProject, AssistantProjectCatalog, AssistantProjectMigrationCandidate } from '@shared/assistant/contracts'
import { AssistantProjectIcon } from '../assistant/AssistantProjectIcon'
import { getAssistantProjectIconSourcePath } from '../assistant/assistant-project-choices'
import { SettingsActionsMenu } from './SettingsActionsMenu'
import { SettingsListPagination } from './SettingsListPagination'
import { paginateSettingsItems } from './settings-list-page'
import { SettingsButton, SettingsDialog, SettingsInput, SettingsNotice, SettingsSection, SettingsSelect } from './settings-layout'

const catalogActionButtonClass = '!h-8 !w-8 !text-[var(--settings-text-secondary)] hover:!bg-[var(--settings-row-hover)] hover:!text-[var(--settings-text)] focus-visible:ring-1 focus-visible:ring-[var(--accent-primary)] disabled:cursor-not-allowed disabled:opacity-45'

type CatalogProps = {
    catalog: AssistantProjectCatalog
    loading: boolean
    error: string | null
    creating: boolean
    onCreate: () => Promise<void>
    onOpenHome: (project: AssistantProject) => Promise<unknown>
    onAddFolder: (projectId: string, access: 'read-only' | 'read-write') => Promise<unknown>
    onRemoveFolder: (projectId: string, folderId: string) => Promise<unknown>
    onArchive: (projectId: string, archived: boolean) => Promise<unknown>
    onImport: (candidate: AssistantProjectMigrationCandidate) => Promise<unknown>
    onDismiss: (candidateId: string) => Promise<unknown>
    hasCustomIcon: (project: AssistantProject) => boolean
    onChangeIcon: (project: AssistantProject) => Promise<unknown>
    onRemoveIcon: (project: AssistantProject) => Promise<unknown>
    onConfigureDiscovery: () => void
}

export function ProjectSettingsCatalog(props: CatalogProps) {
    const [view, setView] = useState<'active' | 'detected' | 'archived'>('active')
    const [query, setQuery] = useState('')
    const [requestedPage, setPage] = useState(0)
    const [selectedId, setSelectedId] = useState<string | null>(null)
    const [busy, setBusy] = useState(false)
    const [actionError, setActionError] = useState<string | null>(null)
    const selected = props.catalog.projects.find(project => project.id === selectedId) || null
    const filtered = useMemo(() => {
        const records: Array<AssistantProject | AssistantProjectMigrationCandidate> = view === 'detected'
            ? props.catalog.candidates.filter(candidate => candidate.status === 'pending')
            : props.catalog.projects.filter(project => Boolean(project.archived) === (view === 'archived'))
        const term = query.trim().toLowerCase()
        return term ? records.filter(record => ('folders' in record
            ? `${record.name} ${record.homePath} ${record.folders.map(folder => folder.path).join(' ')}`
            : `${record.suggestedName} ${record.path}`).toLowerCase().includes(term)) : records
    }, [props.catalog, query, view])
    const page = paginateSettingsItems(filtered, requestedPage)
    const run = async (action: () => Promise<unknown>) => {
        if (busy) return
        setBusy(true); setActionError(null)
        try { await action() } catch (error) { setActionError(error instanceof Error ? error.message : 'Project action failed.') }
        finally { setBusy(false) }
    }
    return <>
        <SettingsSection title="Project catalog" hideHeader className="flex min-h-0 flex-1 flex-col [content-visibility:visible]" bodyClassName="flex min-h-0 flex-1 flex-col !rounded-none !border-0 !bg-transparent !shadow-none">
            <div className="flex shrink-0 flex-wrap items-center gap-2 pb-4">
                <SettingsInput value={query} onChange={event => { setQuery(event.target.value); setPage(0) }} placeholder="Search projects" aria-label="Search project catalog" className="min-w-0 flex-1 basis-full sm:basis-0 sm:w-auto" />
                <SettingsSelect value={view} onChange={event => { setView(event.target.value as typeof view); setPage(0) }} aria-label="Project catalog view" className="!min-w-0 !w-32"><option value="active">Active ({props.catalog.projects.filter(project => !project.archived).length})</option><option value="detected">Detected ({props.catalog.candidates.filter(candidate => candidate.status === 'pending').length})</option><option value="archived">Archived ({props.catalog.projects.filter(project => project.archived).length})</option></SettingsSelect>
                <SettingsButton onClick={() => void run(props.onCreate)} disabled={props.creating || busy}><Plus size={13} />New project</SettingsButton>
            </div>
            {props.error || actionError ? <SettingsNotice tone="error">{props.error || actionError}</SettingsNotice> : null}
            {props.loading ? <SettingsNotice>Refreshing projects…</SettingsNotice> : null}
            {view === 'detected' ? <div className="flex items-center justify-between gap-3 border-b border-[var(--settings-row-divider)] px-4 py-2.5"><span className="text-[11px] text-[var(--settings-text-secondary)]">Projects found in your chosen folders</span><SettingsButton variant="ghost" onClick={props.onConfigureDiscovery}>Choose folders</SettingsButton></div> : null}
            <div className="min-h-0 flex-1 overflow-y-auto [scrollbar-gutter:stable]">
                <ul aria-label="Projects" className="divide-y divide-[var(--settings-row-divider)]">
                    {page.items.map(record => 'folders' in record ? (
                        <li key={record.id} className="group flex min-w-0 items-center gap-3 px-1 py-3">
                            <button type="button" onClick={() => setSelectedId(record.id)} aria-label={`View folders for ${record.name}`} className="flex min-w-0 flex-1 items-center gap-3 rounded-sm text-left outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent-primary)]">
                                <span className="flex size-8 shrink-0 items-center justify-center">
                                    <AssistantProjectIcon projectPath={getAssistantProjectIconSourcePath(record)} size={24} />
                                </span>
                                <span className="min-w-0 flex-1">
                                    <span className="block truncate text-[13px] font-medium text-[var(--settings-text)] group-hover:text-[var(--accent-primary)]" title={record.name}>{record.name}</span>
                                    <span className="mt-0.5 block truncate text-[11px] text-[var(--settings-text-secondary)]" title={record.folders.map(folder => folder.path).join('\n')}>
                                        {record.folders[0]?.path || 'Project home'}
                                    </span>
                                </span>
                            </button>
                            <div className="flex shrink-0 items-center gap-3">
                                {record.folders.length > 1 ? <span className="hidden text-[11px] text-[var(--settings-text-muted)] sm:inline">{record.folders.length} folders</span> : null}
                                {record.folders.some(folder => !folder.available) ? <span className="text-[10px] text-[var(--status-warning)]">Folder unavailable</span> : null}
                                <FileActionsMenu title={`Manage ${record.name}`} disabled={busy} density="compact" menuWidth={224} triggerIcon={<MoreHorizontal size={16} />} buttonClassName={catalogActionButtonClass} openButtonClassName="!bg-[var(--settings-row-hover)] !text-[var(--settings-text)]" items={[
                                    { id: 'folders', label: 'View folders', icon: <FolderOpen size={13} />, onSelect: () => setSelectedId(record.id) },
                                    { id: 'home', label: 'Open project home', icon: <FolderOpen size={13} />, onSelect: () => run(() => props.onOpenHome(record)) },
                                    ...(!record.archived ? [
                                        { id: 'add', label: 'Add folder', icon: <FolderPlus size={13} />, onSelect: () => run(() => props.onAddFolder(record.id, 'read-write')) },
                                        { id: 'add-read-only', label: 'Add read-only folder', icon: <FolderPlus size={13} />, onSelect: () => run(() => props.onAddFolder(record.id, 'read-only')) }
                                    ] : []),
                                    { id: 'change-icon', label: props.hasCustomIcon(record) ? 'Change custom icon' : 'Set custom icon', icon: <Image size={13} />, separatorBefore: true, onSelect: () => run(() => props.onChangeIcon(record)) },
                                    ...(props.hasCustomIcon(record) ? [{ id: 'remove-icon', label: 'Remove custom icon', icon: <X size={13} />, onSelect: () => run(() => props.onRemoveIcon(record)) }] : []),
                                    { id: 'archive', label: record.archived ? 'Restore project' : 'Archive project', icon: record.archived ? <RotateCcw size={13} /> : <Archive size={13} />, separatorBefore: true, onSelect: () => run(() => props.onArchive(record.id, !record.archived)) }
                                ]} />
                            </div>
                        </li>
                    ) : (
                        <li key={record.id} className="flex min-w-0 flex-wrap items-center gap-3 px-1 py-3 sm:flex-nowrap">
                            <span className="flex size-8 shrink-0 items-center justify-center">
                                <AssistantProjectIcon projectPath={record.path} size={24} />
                            </span>
                            <div className="min-w-0 flex-1">
                                <h3 className="truncate text-[13px] font-medium text-[var(--settings-text)]" title={record.suggestedName}>{record.suggestedName}</h3>
                                <p className="mt-0.5 truncate text-[11px] text-[var(--settings-text-secondary)]" title={record.path}>{record.path}</p>
                            </div>
                            <SettingsButton disabled={busy} onClick={() => void run(() => props.onImport(record))}>Review & import</SettingsButton>
                            <FileActionsMenu title={`Actions for ${record.suggestedName}`} disabled={busy} density="compact" menuWidth={224} triggerIcon={<MoreHorizontal size={16} />} buttonClassName={catalogActionButtonClass} items={[{ id: 'dismiss', label: 'Dismiss suggestion', icon: <X size={13} />, onSelect: () => run(() => props.onDismiss(record.id)) }]} />
                        </li>
                    ))}
                </ul>
                {!props.loading && !props.error && page.total === 0 ? <SettingsNotice>{query ? 'No matching projects.' : view === 'active' ? 'No active projects.' : view === 'archived' ? 'No archived projects.' : 'No detected folders to review.'}</SettingsNotice> : null}
            </div>
            <SettingsListPagination {...page} onPageChange={setPage} />
        </SettingsSection>
        <SettingsDialog open={selected !== null} title={selected ? `${selected.name} folders` : 'Project folders'} description="Folder access controls the scope of work in this Project." onClose={() => setSelectedId(null)}
            className="max-w-[640px]" footer={<SettingsButton onClick={() => setSelectedId(null)}>Done</SettingsButton>}>
            {props.error || actionError ? <SettingsNotice tone="error">{props.error || actionError}</SettingsNotice> : null}
            {selected ? <>
                <div className="flex items-center justify-between gap-3">
                    <span className="text-[12px] text-[var(--settings-text-secondary)]">{selected.folders.length} folders</span>
                    {!selected.archived ? <SettingsActionsMenu label="Add folder" disabled={busy} items={[
                        { id: 'write', label: 'Read and write', onSelect: () => run(() => props.onAddFolder(selected.id, 'read-write')) },
                        { id: 'read', label: 'Read only', onSelect: () => run(() => props.onAddFolder(selected.id, 'read-only')) }
                    ]} /> : null}
                </div>
                <div className="max-h-80 overflow-y-auto [scrollbar-gutter:stable] divide-y divide-[var(--settings-row-divider)]">
                    {selected.folders.map(folder => <div key={folder.associationId} className="flex items-center gap-3 py-3">
                        <div className="min-w-0 flex-1">
                            <div className="text-[12px] font-medium">{folder.label}<span className="ml-2 text-[10px] font-normal text-[var(--settings-text-muted)]">{folder.access === 'read-only' ? 'Read only' : 'Read and write'}{!folder.available ? ' · Unavailable' : ''}</span></div>
                            <code title={folder.path} className="mt-1 block truncate text-[11px] text-[var(--settings-text-secondary)]">{folder.path}</code>
                        </div>
                        <SettingsButton variant="ghost" disabled={busy || selected.archived} onClick={() => void run(() => props.onRemoveFolder(selected.id, folder.folderId))}>Detach</SettingsButton>
                    </div>)}
                    {selected.folders.length === 0 ? <SettingsNotice>This Project uses its home folder until you associate another folder.</SettingsNotice> : null}
                </div>
            </> : null}
        </SettingsDialog>
    </>
}
