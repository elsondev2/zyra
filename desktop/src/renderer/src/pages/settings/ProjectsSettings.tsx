import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
    ArrowLeft,
    CheckCircle,
    Folder,
    FolderOpen,
    Image,
    LoaderCircle,
    Plus,
    RefreshCw,
    X
} from 'lucide-react'
import ProjectIcon from '@/components/ui/ProjectIcon'
import { useSettings } from '@/lib/settings'
import { cn } from '@/lib/utils'

type IndexResult = {
    success: boolean
    count: number
    folders: number
    files: number
    error?: string
}

export default function ProjectsSettings() {
    const { settings, updateSettings } = useSettings()
    const [isIndexing, setIsIndexing] = useState(false)
    const [indexResult, setIndexResult] = useState<IndexResult | null>(null)

    const foldersToIndex = useMemo(() => (
        [settings.projectsFolder, ...(settings.additionalFolders || [])]
            .filter((folder): folder is string => typeof folder === 'string' && folder.trim().length > 0)
    ), [settings.additionalFolders, settings.projectsFolder])

    const handleSelectFolder = async () => {
        try {
            const result = await window.devscope.selectFolder()
            if (result.success && result.folderPath) {
                updateSettings({ projectsFolder: result.folderPath })
                setIndexResult(null)
            }
        } catch (err) {
            console.error('Failed to select folder:', err)
        }
    }

    const handleClearFolder = () => {
        updateSettings({ projectsFolder: '' })
        setIndexResult(null)
    }

    const handleAddAdditionalFolder = async () => {
        try {
            const result = await window.devscope.selectFolder()
            if (!result.success || !result.folderPath) return
            if (result.folderPath === settings.projectsFolder) return
            if (settings.additionalFolders?.includes(result.folderPath)) return

            updateSettings({
                additionalFolders: [...(settings.additionalFolders || []), result.folderPath]
            })
            setIndexResult(null)
        } catch (err) {
            console.error('Failed to select folder:', err)
        }
    }

    const handleRemoveAdditionalFolder = (folderPath: string) => {
        updateSettings({
            additionalFolders: (settings.additionalFolders || []).filter((folder) => folder !== folderPath)
        })
        setIndexResult(null)
    }

    const handleAddProjectIconOverride = async () => {
        try {
            const folderResult = await window.devscope.selectFolder()
            if (!folderResult.success || !folderResult.folderPath) return
            const iconResult = await window.devscope.selectProjectIconFile()
            if (!iconResult.success || !iconResult.filePath) return
            updateSettings({
                projectIconOverrides: {
                    ...settings.projectIconOverrides,
                    [folderResult.folderPath]: iconResult.filePath
                }
            })
        } catch (err) {
            console.error('Failed to choose project icon:', err)
        }
    }

    const handleRemoveProjectIconOverride = (projectPath: string) => {
        const next = { ...settings.projectIconOverrides }
        delete next[projectPath]
        updateSettings({ projectIconOverrides: next })
    }

    const handleRebuildIndex = async () => {
        setIsIndexing(true)
        setIndexResult(null)

        try {
            if (foldersToIndex.length === 0) {
                setIndexResult({
                    success: false,
                    count: 0,
                    folders: 0,
                    files: 0,
                    error: 'Add at least one folder first.'
                })
                return
            }

            const result = await window.devscope.indexAllFolders(foldersToIndex, { forceRefresh: true })
            setIndexResult({
                success: result.success,
                count: result.success ? result.indexedCount || 0 : 0,
                folders: result.success ? result.indexedFolders || 0 : foldersToIndex.length,
                files: result.success ? result.indexedFiles || 0 : 0,
                error: result.success ? undefined : (result.error || 'Indexing failed')
            })
        } catch (err: any) {
            setIndexResult({
                success: false,
                count: 0,
                folders: foldersToIndex.length,
                files: 0,
                error: err?.message || 'Indexing failed'
            })
        } finally {
            setIsIndexing(false)
        }
    }

    return (
        <div className="animate-fadeIn">
            <div className="mb-8">
                <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                        <div className="rounded-lg bg-indigo-500/10 p-2">
                            <FolderOpen className="text-indigo-400" size={24} />
                        </div>
                        <div>
                            <h1 className="text-2xl font-semibold text-sparkle-text">Projects</h1>
                            <p className="text-sparkle-text-secondary">
                                Choose the roots Zyra should scan and keep indexed.
                            </p>
                        </div>
                    </div>
                    <Link
                        to="/settings"
                        className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-sparkle-card px-4 py-2 text-sm text-sparkle-text transition-all hover:border-white/20 hover:bg-white/[0.03] hover:text-[var(--accent-primary)]"
                    >
                        <ArrowLeft size={16} />
                        Back to Settings
                    </Link>
                </div>
            </div>

            <div className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.82fr)]">
                <section className="rounded-xl border border-white/10 bg-sparkle-card p-6">
                    <div className="mb-5 flex items-start justify-between gap-4">
                        <div>
                            <h2 className="font-semibold text-sparkle-text">Scan roots</h2>
                            <p className="mt-1 text-sm text-sparkle-text-secondary">
                                Zyra indexes every configured root automatically after startup.
                            </p>
                        </div>
                        <span className="rounded-full border border-indigo-500/20 bg-indigo-500/10 px-3 py-1 text-xs font-medium text-indigo-300">
                            {foldersToIndex.length} root{foldersToIndex.length === 1 ? '' : 's'}
                        </span>
                    </div>

                    <div className="space-y-3">
                        <FolderRow
                            title="Main projects folder"
                            path={settings.projectsFolder}
                            accent="indigo"
                            emptyLabel="Select projects folder"
                            onSelect={handleSelectFolder}
                            onClear={settings.projectsFolder ? handleClearFolder : undefined}
                        />

                        <div className="space-y-2">
                            {(settings.additionalFolders || []).map((folderPath) => (
                                <FolderRow
                                    key={folderPath}
                                    title="Additional root"
                                    path={folderPath}
                                    accent="violet"
                                    onSelect={handleAddAdditionalFolder}
                                    onClear={() => handleRemoveAdditionalFolder(folderPath)}
                                />
                            ))}

                            <button
                                type="button"
                                onClick={() => { void handleAddAdditionalFolder() }}
                                className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-white/10 bg-white/[0.02] px-4 py-3 text-sm text-sparkle-text-secondary transition-all hover:border-white/20 hover:bg-white/[0.04] hover:text-sparkle-text"
                            >
                                <Plus size={16} />
                                Add another root
                            </button>
                        </div>
                    </div>
                </section>

                <section className="rounded-xl border border-white/10 bg-sparkle-card p-6">
                    <div className="mb-5">
                        <h2 className="font-semibold text-sparkle-text">Indexing</h2>
                        <p className="mt-1 text-sm text-sparkle-text-secondary">
                            The index walks nested folders deeply, stores files and folders on disk, and keeps search off the hot renderer path.
                        </p>
                    </div>

                    <div className="space-y-3">
                        <StatRow
                            label="Configured roots"
                            value={String(foldersToIndex.length)}
                        />
                        <StatRow
                            label="Startup behavior"
                            value={foldersToIndex.length > 0 ? 'Automatic' : 'Waiting for roots'}
                        />
                        <StatRow
                            label="Depth"
                            value="Deep recursive scan"
                        />
                    </div>

                    <button
                        type="button"
                        onClick={() => { void handleRebuildIndex() }}
                        disabled={isIndexing || foldersToIndex.length === 0}
                        className={cn(
                            'mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl border px-4 py-3 text-sm font-medium transition-all',
                            isIndexing || foldersToIndex.length === 0
                                ? 'cursor-not-allowed border-white/10 bg-white/[0.04] text-sparkle-text-secondary'
                                : 'border-[var(--accent-primary)]/25 bg-[var(--accent-primary)]/10 text-[var(--accent-primary)] hover:border-[var(--accent-primary)]/35 hover:bg-[var(--accent-primary)]/15'
                        )}
                    >
                        {isIndexing ? <LoaderCircle size={16} className="animate-spin" /> : <RefreshCw size={16} />}
                        {isIndexing ? 'Rebuilding index...' : 'Rebuild file index'}
                    </button>

                    {indexResult ? (
                        <div
                            className={cn(
                                'mt-4 rounded-xl border px-4 py-3 text-sm',
                                indexResult.success
                                    ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-300'
                                    : 'border-red-500/20 bg-red-500/10 text-red-300'
                            )}
                        >
                            {indexResult.success ? (
                                <div className="flex items-center gap-2">
                                    <CheckCircle size={16} className="shrink-0" />
                                    <span>
                                        Indexed {indexResult.count} project{indexResult.count === 1 ? '' : 's'}, {indexResult.files} file{indexResult.files === 1 ? '' : 's'}, and {indexResult.folders} folder{indexResult.folders === 1 ? '' : 's'}.
                                    </span>
                                </div>
                            ) : (
                                <span>{indexResult.error}</span>
                            )}
                        </div>
                    ) : null}
                </section>

                <section className="rounded-xl border border-white/10 bg-sparkle-card p-6 xl:col-span-2">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                        <div>
                            <h2 className="font-semibold text-sparkle-text">Project icon overrides</h2>
                            <p className="mt-1 max-w-2xl text-sm text-sparkle-text-secondary">
                                Automatic detection checks declared app icons, manifests, favicons, and bounded workspace roots. Add an override when the detected asset is not the one you want.
                            </p>
                        </div>
                        <button
                            type="button"
                            onClick={() => { void handleAddProjectIconOverride() }}
                            className="inline-flex items-center gap-2 rounded-xl border border-[var(--accent-primary)]/25 bg-[var(--accent-primary)]/10 px-4 py-2.5 text-sm font-medium text-[var(--accent-primary)] transition-colors hover:bg-[var(--accent-primary)]/15"
                        >
                            <Image size={15} /> Choose project and icon
                        </button>
                    </div>

                    {Object.entries(settings.projectIconOverrides).length > 0 ? (
                        <div className="mt-5 grid gap-3 lg:grid-cols-2">
                            {Object.entries(settings.projectIconOverrides).map(([projectPath, iconPath]) => (
                                <div key={projectPath} className="flex items-center gap-3 rounded-xl border border-white/[0.08] bg-white/[0.025] p-3">
                                    <ProjectIcon customIconPath={iconPath} projectType="unknown" size={34} className="shrink-0 overflow-hidden rounded-lg" />
                                    <div className="min-w-0 flex-1">
                                        <p className="truncate text-sm font-medium text-sparkle-text" title={projectPath}>{projectPath}</p>
                                        <p className="mt-0.5 truncate font-mono text-[10px] text-sparkle-text-muted" title={iconPath}>{iconPath}</p>
                                    </div>
                                    <button type="button" onClick={() => handleRemoveProjectIconOverride(projectPath)} className="rounded-lg border border-white/10 bg-black/10 p-2 text-sparkle-text-muted transition-colors hover:border-red-400/20 hover:bg-red-500/10 hover:text-red-200" title="Remove icon override">
                                        <X size={14} />
                                    </button>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="mt-5 rounded-xl border border-dashed border-white/10 bg-white/[0.02] px-4 py-5 text-center text-sm text-sparkle-text-muted">
                            No manual overrides. Detected project icons remain active.
                        </div>
                    )}
                </section>
            </div>
        </div>
    )
}

function FolderRow({
    title,
    path,
    accent,
    emptyLabel,
    onSelect,
    onClear
}: {
    title: string
    path: string
    accent: 'indigo' | 'violet'
    emptyLabel?: string
    onSelect: () => void
    onClear?: () => void
}) {
    const accentClassName = accent === 'indigo'
        ? 'text-indigo-300 bg-indigo-500/10 border-indigo-500/20'
        : 'text-violet-300 bg-violet-500/10 border-violet-500/20'

    if (!path) {
        return (
            <button
                type="button"
                onClick={() => { onSelect() }}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-white/10 bg-white/[0.02] px-4 py-4 text-sm text-sparkle-text-secondary transition-all hover:border-white/20 hover:bg-white/[0.04] hover:text-sparkle-text"
            >
                <FolderOpen size={16} />
                {emptyLabel || 'Select folder'}
            </button>
        )
    }

    return (
        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-3">
                        <Folder size={16} className="shrink-0 text-sparkle-text-secondary" />
                        <div className="min-w-0 flex items-center gap-2">
                            <span className="truncate font-mono text-sm text-sparkle-text">{path}</span>
                            <span className={cn('shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-medium', accentClassName)}>
                                {title}
                            </span>
                        </div>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        onClick={() => { onSelect() }}
                        className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-sparkle-text-secondary transition-all hover:border-white/20 hover:bg-white/[0.05] hover:text-sparkle-text"
                    >
                        Change
                    </button>
                    {onClear ? (
                        <button
                            type="button"
                            onClick={onClear}
                            className="rounded-lg border border-white/10 bg-black/15 p-2 text-sparkle-text-secondary transition-all hover:border-red-500/20 hover:bg-red-500/10 hover:text-red-300"
                            title="Remove root"
                        >
                            <X size={14} />
                        </button>
                    ) : null}
                </div>
            </div>
        </div>
    )
}

function StatRow({ label, value }: { label: string; value: string }) {
    return (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3">
            <span className="text-sm text-sparkle-text-secondary">{label}</span>
            <span className="text-sm font-medium text-sparkle-text">{value}</span>
        </div>
    )
}
