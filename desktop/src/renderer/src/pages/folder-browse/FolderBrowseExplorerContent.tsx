import type { MouseEvent as ReactMouseEvent } from 'react'
import { ChevronRight, Code, FileCode, FileText, Folder, Github, Music4, Play } from 'lucide-react'
import { cn } from '@/lib/utils'
import { getFileUrl } from '@/components/ui/file-preview/utils'
import ProjectIcon from '@/components/ui/ProjectIcon'
import { FinderItem, SectionHeader, WRAP_AND_CLAMP_2 } from '../shared/BrowseSectionPrimitives'
import { FolderBrowseProjectCard } from './FolderBrowseProjectCard'
import { getProjectTypeById, type FileItem, type FolderItem, type Project, type ViewMode } from './types'
import type { EntryActionTarget } from './folderBrowseTypes'

export function MediaFilePreview({ file, compact = false }: { file: FileItem; compact?: boolean }) {
    const frameClassName = compact ? 'h-full w-full rounded-[14px]' : 'h-full w-full rounded-lg'

    if (file.previewType === 'image') {
        return <img src={getFileUrl(file.previewThumbnailPath || file.path)} alt={file.name} className={cn(frameClassName, 'object-cover')} loading="lazy" />
    }

    if (file.previewType === 'video') {
        return (
            <div className={cn(frameClassName, 'relative overflow-hidden bg-black')}>
                <video src={getFileUrl(file.path)} muted preload="none" playsInline className="h-full w-full object-cover" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
                <div className="absolute bottom-1.5 right-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-black/65 text-white shadow-lg">
                    <Play size={11} className="translate-x-[1px]" />
                </div>
            </div>
        )
    }

    if (file.previewType === 'audio') {
        if (file.previewThumbnailPath) {
            return (
                <div className={cn(frameClassName, 'relative overflow-hidden bg-black')}>
                    <img src={getFileUrl(file.previewThumbnailPath)} alt={`${file.name} artwork`} className="h-full w-full object-cover" loading="lazy" />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/65 via-transparent to-transparent" />
                    <div className="absolute bottom-1.5 right-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-black/65 text-white shadow-lg">
                        <Music4 size={12} />
                    </div>
                </div>
            )
        }

        return (
            <div className={cn(frameClassName, 'flex items-center justify-center bg-[radial-gradient(circle_at_top,#1e293b,transparent_70%),linear-gradient(135deg,#0f172a,#111827)]')}>
                <Music4 size={compact ? 24 : 18} className="text-sky-200" />
            </div>
        )
    }

    return null
}

export function FolderBrowseExplorerContent({
    filteredFolders,
    totalFilteredFolders,
    gitRepos,
    totalGitRepos,
    displayedProjects,
    totalDisplayedProjects,
    visibleFiles,
    totalFilteredFiles,
    hasMoreItems,
    onLoadMoreItems,
    viewMode,
    isCondensedLayout,
    searchQuery,
    onFolderClick,
    onProjectClick,
    onProjectRename,
    onProjectDelete,
    onOpenFilePreview,
    onOpenProjectInExplorer,
    openEntryContextMenu,
    openEmptySpaceContextMenu,
    formatFileSize,
    getFileColor,
    formatRelativeTime
}: {
    filteredFolders: FolderItem[]
    totalFilteredFolders: number
    gitRepos: Project[]
    totalGitRepos: number
    displayedProjects: Project[]
    totalDisplayedProjects: number
    visibleFiles: FileItem[]
    totalFilteredFiles: number
    hasMoreItems: boolean
    onLoadMoreItems: () => void
    viewMode: ViewMode
    isCondensedLayout: boolean
    searchQuery: string
    onFolderClick: (folder: FolderItem) => void
    onProjectClick: (project: Project) => void
    onProjectRename: (project: Project) => void | Promise<void>
    onProjectDelete: (project: Project) => void | Promise<void>
    onOpenFilePreview: (file: FileItem) => void
    onOpenProjectInExplorer: (path: string) => void
    openEntryContextMenu: (event: ReactMouseEvent<HTMLElement>, entry: EntryActionTarget) => void
    openEmptySpaceContextMenu: (event: ReactMouseEvent<HTMLElement>) => void
    formatFileSize: (bytes: number) => string
    getFileColor: (ext: string) => string
    formatRelativeTime: (timestamp?: number) => string
}) {
    const explorerEntries = [
        ...filteredFolders.map((folder) => ({ id: `folder:${folder.path}`, kind: 'folder' as const, name: folder.name, path: folder.path, payload: folder })),
        ...gitRepos.map((repo) => ({ id: `git:${repo.path}`, kind: 'git' as const, name: repo.name, path: repo.path, payload: { name: repo.name, path: repo.path, isProject: true } as FolderItem })),
        ...displayedProjects.map((project) => ({ id: `project:${project.path}`, kind: 'project' as const, name: project.name, path: project.path, payload: project })),
        ...visibleFiles.map((file) => ({ id: `file:${file.path}`, kind: 'file' as const, name: file.name, path: file.path, payload: file }))
    ].sort((left, right) => {
        const order: Record<'folder' | 'git' | 'project' | 'file', number> = { folder: 0, git: 1, project: 2, file: 3 }
        const kindDiff = order[left.kind] - order[right.kind]
        if (kindDiff !== 0) return kindDiff
        return left.name.localeCompare(right.name)
    })

    const totalExplorerCount = totalFilteredFolders + totalGitRepos + totalDisplayedProjects + totalFilteredFiles
    const pressuredFinderGridStyle = isCondensedLayout ? { gridTemplateColumns: 'repeat(auto-fit, minmax(92px, 108px))' } : undefined
    const pressuredExplorerGridStyle = isCondensedLayout ? { gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' } : undefined
    const isFinderMode = viewMode === 'finder'

    return (
        <div className="space-y-8">
            {totalExplorerCount > 0 ? (
                <div onContextMenu={openEmptySpaceContextMenu}>
                    <SectionHeader icon={Folder} iconClassName="text-yellow-400/70" title="All Items" count={totalExplorerCount} />
                    <div
                        className={cn(
                            'grid gap-3 transition-[grid-template-columns,gap] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]',
                            isFinderMode
                                ? 'grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-8 xl:grid-cols-10'
                                : 'grid-cols-2 auto-rows-fr sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6'
                        )}
                        style={isFinderMode ? pressuredFinderGridStyle : pressuredExplorerGridStyle}
                        onContextMenu={openEmptySpaceContextMenu}
                    >
                        {explorerEntries.map((entry) => {
                            if (entry.kind === 'project') {
                                const project = entry.payload as Project
                                const entryTarget: EntryActionTarget = { path: project.path, name: project.name, type: 'directory' }
                                if (isFinderMode) {
                                    return (
                                        <FolderBrowseProjectCard
                                            key={entry.id}
                                            project={project}
                                            viewMode="finder"
                                            onProjectClick={onProjectClick}
                                            onOpenProjectInExplorer={onOpenProjectInExplorer}
                                            onProjectRename={onProjectRename}
                                            onProjectDelete={onProjectDelete}
                                            onProjectContextMenu={(event, selectedProject) => openEntryContextMenu(event, { path: selectedProject.path, name: selectedProject.name, type: 'directory' })}
                                            formatRelativeTime={formatRelativeTime}
                                        />
                                    )
                                }

                                const typeInfo = getProjectTypeById(project.type)
                                return (
                                    <div
                                        key={entry.id}
                                        onClick={() => onProjectClick(project)}
                                        onContextMenu={(event) => openEntryContextMenu(event, entryTarget)}
                                        role="button"
                                        tabIndex={0}
                                        onKeyDown={(event) => {
                                            if (event.key === 'Enter' || event.key === ' ') {
                                                event.preventDefault()
                                                onProjectClick(project)
                                            }
                                        }}
                                        className="group h-full min-h-[136px] rounded-xl border border-white/5 bg-sparkle-card p-3 text-left transition-colors hover:border-white/15"
                                    >
                                        <div className="mb-2 flex items-center justify-between gap-2">
                                            <div className="rounded-lg border border-white/5 bg-sparkle-bg p-2">
                                                <ProjectIcon projectType={project.type} framework={project.frameworks?.[0]} size={20} />
                                            </div>
                                            <span className="text-[10px] text-white/30">{formatRelativeTime(project.lastModified)}</span>
                                        </div>
                                        <p className={cn('text-sm font-semibold leading-5 text-white/85 group-hover:text-white', WRAP_AND_CLAMP_2)} title={project.name}>{project.name}</p>
                                        <p className="truncate text-[10px] text-white/40" title={typeInfo?.displayName || project.type}>{typeInfo?.displayName || project.type}</p>
                                    </div>
                                )
                            }

                            if (entry.kind === 'file') {
                                const file = entry.payload as FileItem
                                const entryTarget: EntryActionTarget = { path: file.path, name: file.name, type: 'file' }
                                const isText = file.extension === 'md' || file.extension === 'txt'
                                const isMedia = Boolean(file.previewType)
                                const iconColor = getFileColor(file.extension)
                                return isFinderMode ? (
                                    <div key={entry.id} className="group mx-auto w-fit" onContextMenu={(event) => openEntryContextMenu(event, entryTarget)}>
                                        <FinderItem
                                            icon={isText ? FileText : FileCode}
                                            iconClassName={isMedia ? 'text-white/0' : 'text-white/20'}
                                            visual={isMedia ? <MediaFilePreview file={file} compact /> : undefined}
                                            title={file.name}
                                            subtitle={formatFileSize(file.size)}
                                            tag={file.extension}
                                            tagColor={iconColor}
                                            onClick={() => onOpenFilePreview(file)}
                                        />
                                    </div>
                                ) : (
                                    <div
                                        key={entry.id}
                                        className="group relative flex h-full min-h-[136px] cursor-pointer flex-col rounded-xl border border-white/5 bg-sparkle-card p-3 text-left transition-colors hover:border-blue-400/30 hover:bg-blue-400/5"
                                        onClick={() => onOpenFilePreview(file)}
                                        onContextMenu={(event) => openEntryContextMenu(event, entryTarget)}
                                    >
                                        <div className={cn('mb-2 overflow-hidden rounded-lg border border-white/5 bg-sparkle-bg', isMedia ? 'h-24 w-full' : 'inline-flex w-fit p-2')}>
                                            {isMedia ? <MediaFilePreview file={file} /> : isText ? <FileText size={16} style={{ color: iconColor }} /> : <FileCode size={16} style={{ color: iconColor }} />}
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <p className={cn('text-sm leading-5 text-white/80 transition-colors group-hover:text-white', WRAP_AND_CLAMP_2)} title={file.name}>{file.name}</p>
                                            <p className="text-[10px] text-white/30">{formatFileSize(file.size)}</p>
                                        </div>
                                        <div className="mt-2">
                                            <span className="inline-flex items-center gap-1 rounded-md bg-sparkle-card-hover px-2 py-1 text-[11px] text-sparkle-text-secondary">
                                                <FileCode size={12} />
                                                Preview
                                            </span>
                                        </div>
                                    </div>
                                )
                            }

                            const isGit = entry.kind === 'git'
                            const folder = entry.payload as FolderItem
                            const entryTarget: EntryActionTarget = { path: folder.path, name: entry.name, type: 'directory' }

                            return isFinderMode ? (
                                <div key={entry.id} className="group mx-auto w-fit" onContextMenu={(event) => openEntryContextMenu(event, entryTarget)}>
                                    <FinderItem icon={isGit ? Github : Folder} iconClassName={isGit ? 'text-white' : 'text-yellow-400'} title={entry.name} subtitle={isGit ? 'Git Repo' : 'Folder'} onClick={() => onFolderClick(folder)} />
                                </div>
                            ) : (
                                <div
                                    key={entry.id}
                                    onClick={() => onFolderClick(folder)}
                                    onContextMenu={(event) => openEntryContextMenu(event, entryTarget)}
                                    className="group relative flex h-full min-h-[136px] cursor-pointer flex-col rounded-xl border border-white/5 bg-sparkle-card p-3 text-left transition-colors hover:border-white/15"
                                >
                                    <div className="mb-2 inline-flex w-fit rounded-lg border border-white/5 bg-sparkle-bg p-2">
                                        {isGit ? <Github size={16} className="text-white/80 transition-colors group-hover:text-white" /> : <Folder size={16} className="text-yellow-400/70 transition-colors group-hover:text-yellow-400" />}
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <p className={cn('text-sm leading-5 text-white/70 transition-colors group-hover:text-white', WRAP_AND_CLAMP_2)} title={entry.name}>{entry.name}</p>
                                        <p className="text-[10px] text-white/30">{isGit ? 'Git Repo' : 'Folder'}</p>
                                    </div>
                                    <ChevronRight size={12} className="mt-2 text-white/20 transition-colors group-hover:text-white/60" />
                                </div>
                            )
                        })}
                    </div>
                    {hasMoreItems && (
                        <div className="mt-4 flex justify-center">
                            <button onClick={onLoadMoreItems} className="rounded-lg border border-white/15 bg-sparkle-card/60 px-4 py-2 text-sm text-white/80 transition-colors hover:border-white/30 hover:bg-sparkle-card hover:text-white">
                                Show more items
                            </button>
                        </div>
                    )}
                </div>
            ) : (
                <div className="flex flex-col items-center justify-center rounded-xl border border-sparkle-border bg-sparkle-card py-16" onContextMenu={openEmptySpaceContextMenu}>
                    <FileCode size={48} className="mb-4 text-sparkle-text-muted" />
                    <h3 className="mb-2 text-lg font-medium text-sparkle-text">
                        {searchQuery ? 'No Matching Items' : 'Empty Folder'}
                    </h3>
                    <p className="max-w-md text-center text-sparkle-text-secondary">
                        {searchQuery ? 'Try adjusting your search criteria.' : 'This folder does not contain any projects, files, or subfolders.'}
                    </p>
                </div>
            )}
        </div>
    )
}
