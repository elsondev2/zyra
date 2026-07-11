import { ChevronRight, Code, File, FileCode, FileText, Folder, Github } from 'lucide-react'
import { cn } from '@/lib/utils'
import { FinderItem, SectionHeader, WRAP_AND_CLAMP_2 } from '../shared/BrowseSectionPrimitives'
import { FolderBrowseProjectCard } from './FolderBrowseProjectCard'
import { FolderBrowseExplorerContent, MediaFilePreview } from './FolderBrowseExplorerContent'
import { useFolderBrowseContextMenu } from './useFolderBrowseContextMenu'
import type { EntryActionTarget } from './folderBrowseTypes'
import type { ContentLayout, FileItem, FolderItem, Project, ViewMode } from './types'

interface FolderBrowseContentProps {
    currentDirectoryPath: string
    currentDirectoryName: string
    filteredFolders: FolderItem[]
    totalFilteredFolders: number
    gitRepos: Project[]
    totalGitRepos: number
    visibleFiles: FileItem[]
    totalFilteredFiles: number
    hasMoreItems: boolean
    onLoadMoreItems: () => void
    displayedProjects: Project[]
    totalDisplayedProjects: number
    viewMode: ViewMode
    contentLayout: ContentLayout
    isCondensedLayout?: boolean
    searchQuery: string
    error: string | null
    onFolderClick: (folder: FolderItem) => void
    onProjectClick: (project: Project) => void
    onProjectRename: (project: Project) => void | Promise<void>
    onProjectDelete: (project: Project) => void | Promise<void>
    onOpenFilePreview: (file: FileItem) => void
    onOpenProjectInExplorer: (path: string) => void
    onEntryOpen: (entry: EntryActionTarget) => void | Promise<void>
    onEntryOpenWith: (entry: EntryActionTarget) => void | Promise<void>
    onEntryOpenInExplorer: (entry: EntryActionTarget) => void | Promise<void>
    onEntryCopyPath: (entry: EntryActionTarget) => void | Promise<void>
    onEntryCopy: (entry: EntryActionTarget) => void | Promise<void>
    onEntryRename: (entry: EntryActionTarget) => void | Promise<void>
    onEntryDelete: (entry: EntryActionTarget) => void | Promise<void>
    onEntryPaste: (entry: EntryActionTarget) => void | Promise<void>
    onEntryCreateFile: (entry: EntryActionTarget) => void | Promise<void>
    onEntryCreateFolder: (entry: EntryActionTarget) => void | Promise<void>
    onRefresh: () => void | Promise<void>
    hasFileClipboardItem: boolean
    formatFileSize: (bytes: number) => string
    getFileColor: (ext: string) => string
    formatRelativeTime: (timestamp?: number) => string
}

export function FolderBrowseContent({
    currentDirectoryPath,
    currentDirectoryName,
    filteredFolders,
    totalFilteredFolders,
    gitRepos,
    totalGitRepos,
    visibleFiles,
    totalFilteredFiles,
    hasMoreItems,
    onLoadMoreItems,
    displayedProjects,
    totalDisplayedProjects,
    viewMode,
    contentLayout,
    isCondensedLayout = false,
    searchQuery,
    error,
    onFolderClick,
    onProjectClick,
    onProjectRename,
    onProjectDelete,
    onOpenFilePreview,
    onOpenProjectInExplorer,
    onEntryOpen,
    onEntryOpenWith,
    onEntryOpenInExplorer,
    onEntryCopyPath,
    onEntryCopy,
    onEntryRename,
    onEntryDelete,
    onEntryPaste,
    onEntryCreateFile,
    onEntryCreateFolder,
    onRefresh,
    hasFileClipboardItem,
    formatFileSize,
    getFileColor,
    formatRelativeTime
}: FolderBrowseContentProps) {
    const { openEntryContextMenu, openEmptySpaceContextMenu, contextMenuPortal } = useFolderBrowseContextMenu({
        currentDirectoryPath,
        currentDirectoryName,
        onEntryOpen,
        onEntryOpenWith,
        onEntryOpenInExplorer,
        onEntryCopyPath,
        onEntryCopy,
        onEntryRename,
        onEntryDelete,
        onEntryPaste,
        onEntryCreateFile,
        onEntryCreateFolder,
        onRefresh,
        hasFileClipboardItem
    })

    const finderGridStyle = isCondensedLayout ? { gridTemplateColumns: 'repeat(auto-fit, minmax(92px, 108px))' } : undefined
    const explorerGridStyle = isCondensedLayout ? { gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' } : undefined
    const fileGridStyle = isCondensedLayout ? { gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' } : undefined
    const projectGridStyle = isCondensedLayout ? { gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))' } : undefined

    if (contentLayout === 'explorer') {
        return (
            <>
                <FolderBrowseExplorerContent
                    filteredFolders={filteredFolders}
                    totalFilteredFolders={totalFilteredFolders}
                    gitRepos={gitRepos}
                    totalGitRepos={totalGitRepos}
                    displayedProjects={displayedProjects}
                    totalDisplayedProjects={totalDisplayedProjects}
                    visibleFiles={visibleFiles}
                    totalFilteredFiles={totalFilteredFiles}
                    hasMoreItems={hasMoreItems}
                    onLoadMoreItems={onLoadMoreItems}
                    viewMode={viewMode}
                    isCondensedLayout={isCondensedLayout}
                    searchQuery={searchQuery}
                    onFolderClick={onFolderClick}
                    onProjectClick={onProjectClick}
                    onProjectRename={onProjectRename}
                    onProjectDelete={onProjectDelete}
                    onOpenFilePreview={onOpenFilePreview}
                    onOpenProjectInExplorer={onOpenProjectInExplorer}
                    openEntryContextMenu={openEntryContextMenu}
                    openEmptySpaceContextMenu={openEmptySpaceContextMenu}
                    formatFileSize={formatFileSize}
                    getFileColor={getFileColor}
                    formatRelativeTime={formatRelativeTime}
                />
                {contextMenuPortal}
            </>
        )
    }

    return (
        <>
            <div className="space-y-8" onContextMenu={openEmptySpaceContextMenu}>
                {filteredFolders.length > 0 && (
                    <div onContextMenu={openEmptySpaceContextMenu}>
                        <SectionHeader icon={Folder} iconClassName="text-yellow-400/70" title="Folders" count={totalFilteredFolders} />
                        <div
                            className={cn(
                                'grid gap-4 transition-[grid-template-columns,gap] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]',
                                viewMode === 'finder'
                                    ? 'grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-8 xl:grid-cols-10'
                                    : 'grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6'
                            )}
                            style={viewMode === 'finder' ? finderGridStyle : explorerGridStyle}
                            onContextMenu={openEmptySpaceContextMenu}
                        >
                            {filteredFolders.map((folder) => (
                                viewMode === 'finder' ? (
                                    <div key={folder.path} className="group mx-auto w-fit" onContextMenu={(event) => openEntryContextMenu(event, { path: folder.path, name: folder.name, type: 'directory' })}>
                                        <FinderItem icon={Folder} iconClassName="text-yellow-400" title={folder.name} onClick={() => onFolderClick(folder)} />
                                    </div>
                                ) : (
                                    <div
                                        key={folder.path}
                                        onClick={() => onFolderClick(folder)}
                                        onContextMenu={(event) => openEntryContextMenu(event, { path: folder.path, name: folder.name, type: 'directory' })}
                                        className="group relative flex cursor-pointer items-center gap-2 rounded-lg border border-white/5 bg-sparkle-card/50 p-2.5 text-left transition-all hover:border-white/20 hover:bg-white/5"
                                        title={folder.name}
                                    >
                                        <Folder size={16} className="shrink-0 text-yellow-400/70 transition-colors group-hover:text-yellow-400" />
                                        <span className={cn('text-sm leading-5 text-white/70 transition-colors group-hover:text-white', WRAP_AND_CLAMP_2)}>{folder.name}</span>
                                        <ChevronRight size={12} className="ml-auto shrink-0 text-white/20 transition-colors group-hover:text-white/60" />
                                    </div>
                                )
                            ))}
                        </div>
                    </div>
                )}

                {gitRepos.length > 0 && (
                    <div onContextMenu={openEmptySpaceContextMenu}>
                        <SectionHeader icon={Github} iconClassName="text-white/70" title="Git Repositories" count={totalGitRepos} />
                        <div
                            className={cn(
                                'grid gap-4 transition-[grid-template-columns,gap] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]',
                                viewMode === 'finder'
                                    ? 'grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-8 xl:grid-cols-10'
                                    : 'grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6'
                            )}
                            style={viewMode === 'finder' ? finderGridStyle : explorerGridStyle}
                            onContextMenu={openEmptySpaceContextMenu}
                        >
                            {gitRepos.map((repo) => (
                                viewMode === 'finder' ? (
                                    <div key={repo.path} className="group mx-auto w-fit" onContextMenu={(event) => openEntryContextMenu(event, { path: repo.path, name: repo.name, type: 'directory' })}>
                                        <FinderItem icon={Github} iconClassName="text-white" title={repo.name} subtitle="Git Repo" onClick={() => onFolderClick({ name: repo.name, path: repo.path, isProject: true })} />
                                    </div>
                                ) : (
                                    <div
                                        key={repo.path}
                                        onClick={() => onFolderClick({ name: repo.name, path: repo.path, isProject: true })}
                                        onContextMenu={(event) => openEntryContextMenu(event, { path: repo.path, name: repo.name, type: 'directory' })}
                                        className="group relative flex cursor-pointer items-center gap-2 rounded-lg border border-white/10 bg-white/5 p-2.5 text-left transition-all hover:border-white/30 hover:bg-white/10"
                                        title={repo.name}
                                    >
                                        <div className="shrink-0 rounded-md bg-white/10 p-1.5">
                                            <Github size={16} className="text-white" />
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <span className={cn('block text-sm font-medium leading-5 text-white', WRAP_AND_CLAMP_2)}>{repo.name}</span>
                                            <span className="text-[10px] uppercase tracking-wide text-white/40">Git Repo</span>
                                        </div>
                                        <ChevronRight size={12} className="ml-auto shrink-0 text-white/20 transition-colors group-hover:text-white/60" />
                                    </div>
                                )
                            ))}
                        </div>
                    </div>
                )}

                {totalFilteredFiles > 0 && (
                    <div onContextMenu={openEmptySpaceContextMenu}>
                        <SectionHeader icon={File} iconClassName="text-blue-400/70" title="Files" count={totalFilteredFiles} />
                        <div
                            className={cn(
                                'grid gap-4 transition-[grid-template-columns,gap] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]',
                                viewMode === 'finder'
                                    ? 'grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-8 xl:grid-cols-10'
                                    : 'grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5'
                            )}
                            style={viewMode === 'finder' ? finderGridStyle : fileGridStyle}
                            onContextMenu={openEmptySpaceContextMenu}
                        >
                            {visibleFiles.map((file) => {
                                const iconColor = getFileColor(file.extension)
                                const isText = file.extension === 'md' || file.extension === 'txt'
                                const isMedia = Boolean(file.previewType)
                                const entryTarget: EntryActionTarget = { path: file.path, name: file.name, type: 'file' }

                                return viewMode === 'finder' ? (
                                    <div key={file.path} className="group mx-auto w-fit" onContextMenu={(event) => openEntryContextMenu(event, entryTarget)}>
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
                                        key={file.path}
                                        onClick={() => onOpenFilePreview(file)}
                                        onContextMenu={(event) => openEntryContextMenu(event, entryTarget)}
                                        className="group relative flex cursor-pointer items-center gap-2.5 rounded-lg bg-sparkle-card/50 p-2.5 transition-all hover:border-blue-400/30 hover:bg-blue-400/5"
                                        title={file.name}
                                    >
                                        {isMedia ? (
                                            <div className="h-12 w-12 shrink-0 overflow-hidden rounded-lg border border-white/10 bg-sparkle-bg">
                                                <MediaFilePreview file={file} />
                                            </div>
                                        ) : (
                                            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg" style={{ backgroundColor: `${iconColor}15` }}>
                                                {isText ? <FileText size={16} style={{ color: iconColor }} /> : <FileCode size={16} style={{ color: iconColor }} />}
                                            </div>
                                        )}
                                        <div className="min-w-0 flex-1">
                                            <p className={cn('text-sm leading-5 text-white/80 transition-colors group-hover:text-white', WRAP_AND_CLAMP_2)}>{file.name}</p>
                                            <p className="text-[10px] text-white/30">{formatFileSize(file.size)}</p>
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    </div>
                )}

                {displayedProjects.length > 0 && (
                    <div onContextMenu={openEmptySpaceContextMenu}>
                        <SectionHeader icon={Code} iconClassName="text-sparkle-accent" title="Projects" count={totalDisplayedProjects} />
                        <div
                            className={cn(
                                'grid gap-4 transition-[grid-template-columns,gap] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]',
                                viewMode === 'finder' && 'grid-cols-3 gap-x-2 gap-y-6 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-8 xl:grid-cols-10',
                                viewMode === 'grid' && 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'
                            )}
                            style={viewMode === 'finder' ? finderGridStyle : projectGridStyle}
                        >
                            {displayedProjects.map((project) => (
                                <FolderBrowseProjectCard
                                    key={project.path}
                                    project={project}
                                    viewMode={viewMode}
                                    onProjectClick={onProjectClick}
                                    onOpenProjectInExplorer={onOpenProjectInExplorer}
                                    onProjectRename={onProjectRename}
                                    onProjectDelete={onProjectDelete}
                                    onProjectContextMenu={(event, selectedProject) => openEntryContextMenu(event, { path: selectedProject.path, name: selectedProject.name, type: 'directory' })}
                                    formatRelativeTime={formatRelativeTime}
                                />
                            ))}
                        </div>
                    </div>
                )}

                {hasMoreItems && (
                    <div className="flex justify-center">
                        <button onClick={onLoadMoreItems} className="rounded-lg border border-white/15 bg-sparkle-card/60 px-4 py-2 text-sm text-white/80 transition-colors hover:border-white/30 hover:bg-sparkle-card hover:text-white">
                            Show more items
                        </button>
                    </div>
                )}

                {totalDisplayedProjects === 0 && totalFilteredFolders === 0 && totalGitRepos === 0 && totalFilteredFiles === 0 && !error && (
                    <div className="flex flex-col items-center justify-center rounded-xl border border-sparkle-border bg-sparkle-card py-16" onContextMenu={openEmptySpaceContextMenu}>
                        <FileCode size={48} className="mb-4 text-sparkle-text-muted" />
                        <h3 className="mb-2 text-lg font-medium text-sparkle-text">
                            {searchQuery ? 'No Matching Items' : 'Empty Folder'}
                        </h3>
                        <p className="max-w-md text-center text-sparkle-text-secondary">
                            {searchQuery ? 'Try adjusting your search criteria.' : 'This folder does not contain any projects or subfolders.'}
                        </p>
                    </div>
                )}
            </div>
            {contextMenuPortal}
        </>
    )
}
