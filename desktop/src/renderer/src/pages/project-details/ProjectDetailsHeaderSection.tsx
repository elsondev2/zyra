import { useMemo, useState } from 'react'
import {
    ArrowLeft, FolderOpen, Terminal, ExternalLink,
    RefreshCw, Copy, Check, BookOpen, Package,
    GitBranch, GitPullRequest, Folder
} from 'lucide-react'
import { OpenWithProjectButton } from '@/components/ui/OpenWithProjectButton'
import { cn } from '@/lib/utils'
import ProjectIcon, { FrameworkBadge } from '@/components/ui/ProjectIcon'
import { DiffStats } from './DiffStats'
import { getDiffCounts } from './workingChangesUtils'
import { formatRootRelativePath, resolveNavigationRoot } from '../folder-browse/folderBrowsePageUtils'

interface ProjectDetailsHeaderSectionProps {
    [key: string]: any
}

export function ProjectDetailsHeaderSection(props: ProjectDetailsHeaderSectionProps) {
    const [openWithMenuOpen, setOpenWithMenuOpen] = useState(false)
    const {
        themeColor,
        project,
        projectDetailsLoading,
        currentBranch,
        isProjectLive,
        activePorts,
        handleCopyPath,
        copiedPath,
        handleOpenInExplorer,
        goBack,
        isCondensedLayout,
        activeTab,
        setActiveTab,
        fileTree,
        loadingFiles,
        loadingGit,
        changedFiles,
        stagedFiles,
        unstagedFiles,
        unpushedCommits,
        onBrowseFolder,
        onShowScriptsModal,
        onShowDependenciesModal,
        onOpenWithAssistant,
        settings,
        loadProjectDetails,
        scriptCount,
        dependencyCount
    } = props
    const frameworks = Array.isArray(project.frameworks) ? project.frameworks.filter(Boolean) : []
    const primaryFramework = frameworks[0] ?? null
    const secondaryFrameworkCount = Math.max(0, frameworks.length - 1)
    const primaryPortLabel = activePorts.length > 0 ? `:${activePorts[0]}` : ''
    const projectDisplayRoot = useMemo(() => {
        const roots = [
            settings?.projectsFolder,
            ...(Array.isArray(settings?.additionalFolders) ? settings.additionalFolders : [])
        ].filter((path): path is string => typeof path === 'string' && path.trim().length > 0)
        return resolveNavigationRoot(project.path, roots)
    }, [project.path, settings?.additionalFolders, settings?.projectsFolder])
    const displayProjectPath = useMemo(
        () => formatRootRelativePath(project.path, projectDisplayRoot),
        [project.path, projectDisplayRoot]
    )
    const workingChangesDiff = useMemo(() => {
        const staged = (stagedFiles || []).reduce((totals: { additions: number; deletions: number }, file: any) => {
            const counts = getDiffCounts(file, 'staged')
            totals.additions += counts.additions
            totals.deletions += counts.deletions
            return totals
        }, { additions: 0, deletions: 0 })
        const unstaged = (unstagedFiles || []).reduce((totals: { additions: number; deletions: number }, file: any) => {
            const counts = getDiffCounts(file, 'unstaged')
            totals.additions += counts.additions
            totals.deletions += counts.deletions
            return totals
        }, { additions: 0, deletions: 0 })
        const workingFiles = [...(stagedFiles || []), ...(unstagedFiles || [])]

        return {
            additions: staged.additions + unstaged.additions,
            deletions: staged.deletions + unstaged.deletions,
            loading: workingFiles.some((file: any) => file.statsLoaded !== true)
        }
    }, [stagedFiles, unstagedFiles])

    return (
        <>
            <div className={cn(
                'relative rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.03] to-transparent transition-[margin] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]',
                openWithMenuOpen ? 'z-30' : 'z-0',
                isCondensedLayout ? 'mb-3' : 'mb-4'
            )}>
                <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-2xl">
                    <div
                        className="absolute -top-20 -right-20 h-40 w-40 rounded-full opacity-20 blur-3xl"
                        style={{ background: themeColor }}
                    />
                </div>

                <div className={cn(
                    'relative flex flex-col gap-3 transition-[gap,padding] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] sm:flex-row sm:items-start sm:justify-between',
                    isCondensedLayout ? 'p-4' : 'p-5'
                )}>
                    <div className="flex min-w-0 flex-1 items-start gap-4">
                        <div
                            className={cn(
                                'shrink-0 rounded-xl flex items-center justify-center border border-white/10',
                                isCondensedLayout ? 'h-12 w-12' : 'h-14 w-14'
                            )}
                            style={{ background: `${themeColor}15` }}
                        >
                            <ProjectIcon
                                projectType={project.type}
                                framework={project.frameworks?.[0]}
                                customIconPath={project.projectIconPath}
                                size={isCondensedLayout ? 28 : 32}
                            />
                        </div>

                        <div className="min-w-0 flex-1">
                            <div className="mb-1 flex min-w-0 items-center gap-2 overflow-hidden">
                                <h1 className={cn(
                                    'min-w-0 shrink truncate font-bold text-white',
                                    isCondensedLayout ? 'text-lg' : 'text-xl'
                                )}>
                                    {project.displayName}
                                </h1>
                                {project.version && (
                                    <span className="inline-flex shrink-0 rounded bg-white/5 px-2 py-0.5 text-xs font-mono text-white/40">
                                        v{project.version}
                                    </span>
                                )}
                                {isProjectLive && (
                                    <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-green-500/20 bg-green-500/10 px-2.5 py-0.5 text-[10px] font-semibold text-green-400">
                                        <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
                                        <span>Live</span>
                                        {primaryPortLabel ? <span className="text-green-300/90">{primaryPortLabel}</span> : null}
                                    </span>
                                )}
                            </div>
                            <div className={cn(
                                'flex flex-wrap items-center gap-2 text-white/50',
                                isCondensedLayout ? 'text-xs' : 'text-sm'
                            )}>
                                <span
                                    className="shrink-0 rounded px-2 py-0.5 text-xs font-medium"
                                    style={{ background: `${themeColor}20`, color: themeColor }}
                                >
                                    {project.typeInfo?.displayName || project.type}
                                </span>
                                {primaryFramework && (
                                    <>
                                        <FrameworkBadge framework={primaryFramework} size="sm" className="hidden shrink-0 sm:inline-flex" />
                                        <FrameworkBadge framework={primaryFramework} size="sm" showLabel={false} className="shrink-0 sm:hidden" />
                                    </>
                                )}
                                {secondaryFrameworkCount > 0 && (
                                    <span className="hidden shrink-0 rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[10px] font-medium text-white/45 sm:inline-flex">
                                        +{secondaryFrameworkCount}
                                    </span>
                                )}
                                {currentBranch && (
                                    <>
                                        <span className="hidden max-w-full items-center gap-1 rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[10px] font-medium text-white/60 md:inline-flex">
                                            <GitBranch size={10} className="shrink-0 text-white/38" />
                                            <span className="max-w-[160px] truncate font-mono text-white/68" title={currentBranch}>
                                                {currentBranch}
                                            </span>
                                        </span>
                                        <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[10px] font-medium text-white/60 md:hidden">
                                            <GitBranch size={10} className="shrink-0 text-white/38" />
                                            <span className="max-w-[92px] truncate font-mono text-white/68" title={currentBranch}>
                                                {currentBranch}
                                            </span>
                                        </span>
                                    </>
                                )}
                                {projectDetailsLoading && (
                                    <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.14em] text-white/55">
                                        <RefreshCw size={10} className="animate-spin" />
                                        <span className="hidden sm:inline">Loading</span>
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>

                    <div className={cn(
                        'flex shrink-0 items-center self-start',
                        isCondensedLayout ? 'gap-2' : 'gap-3 sm:pl-4'
                    )}>
                        <button
                            onClick={onBrowseFolder}
                            className={cn(
                                'flex items-center justify-center gap-2 rounded-lg bg-[var(--accent-primary)] text-sm font-medium text-white transition-colors hover:bg-[var(--accent-primary)]/80',
                                isCondensedLayout ? 'h-10 w-10 xl:w-auto xl:px-3 xl:py-2.5' : 'h-11 w-11 lg:w-auto lg:px-4 lg:py-2.5'
                            )}
                            title="Browse as Folder"
                        >
                            <Folder size={16} />
                            <span className={cn(isCondensedLayout ? 'hidden xl:inline' : 'hidden lg:inline')}>Browse Folder</span>
                        </button>

                        <button
                            onClick={loadProjectDetails}
                            className={cn(
                                'flex items-center justify-center rounded-xl border border-white/10 bg-sparkle-card text-white/40 shadow-sm transition-colors hover:border-white/20 hover:text-white shrink-0',
                                isCondensedLayout ? 'h-10 w-10' : 'h-11 w-11'
                            )}
                            title={projectDetailsLoading ? 'Refreshing project details' : 'Refresh'}
                        >
                            <RefreshCw size={isCondensedLayout ? 15 : 16} className={cn(projectDetailsLoading && 'animate-spin')} />
                        </button>
                    </div>
                </div>

                <div className={cn(
                    'relative flex items-center gap-2 overflow-visible border-t border-white/5 bg-black/20 transition-[padding] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]',
                    isCondensedLayout ? 'px-4 py-2.5' : 'px-5 py-3'
                )}>
                    <div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
                        <FolderOpen size={14} className="shrink-0 text-white/30" />
                        <span
                            className="block min-w-0 flex-1 truncate text-xs font-mono text-white/40"
                            style={{ direction: 'rtl', textAlign: 'left' }}
                        >
                            {displayProjectPath}
                        </span>
                    </div>
                    <div className={cn(
                        'relative ml-auto flex shrink-0 items-center gap-1 pl-2',
                        openWithMenuOpen ? 'z-[110]' : 'z-10'
                    )}>
                        <OpenWithProjectButton
                            projectPath={project?.path || null}
                            preferredShell={settings.defaultShell}
                            menuWidthMode="trigger"
                            menuPresentation="inline"
                            menuOpen={openWithMenuOpen}
                            onMenuOpenChange={setOpenWithMenuOpen}
                            contextActions={[{
                                id: 'assistant',
                                label: 'Assistant',
                                icon: 'assistant',
                                onSelect: onOpenWithAssistant
                            }]}
                        />
                        <button
                            onClick={handleCopyPath}
                            className={cn(
                                'p-1.5 rounded-md text-white/40 transition-colors hover:bg-white/10 hover:text-white',
                                copiedPath && 'text-green-400 hover:text-green-400'
                            )}
                            title="Copy path"
                        >
                            {copiedPath ? <Check size={14} /> : <Copy size={14} />}
                        </button>
                        <button
                            onClick={handleOpenInExplorer}
                            className="p-1.5 rounded-md text-white/40 transition-colors hover:bg-white/10 hover:text-white"
                            title="Open in Explorer"
                        >
                            <ExternalLink size={14} />
                        </button>
                    </div>
                </div>
            </div>

            <div className={cn(
                'sticky z-20 -mx-6 border-b border-white/5 bg-sparkle-bg/95 px-6 backdrop-blur-xl transition-[padding,margin] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]',
                isCondensedLayout ? '-top-4 mb-5 pb-3 pt-3' : '-top-6 mb-6 pb-4 pt-4'
            )}>
                <div className={cn(
                    'flex flex-col gap-3 transition-[gap] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]',
                    isCondensedLayout ? 'xl:flex-row xl:items-center' : 'lg:flex-row lg:items-center'
                )}>
                    <div className={cn(
                        'flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center',
                        isCondensedLayout ? 'min-w-0 xl:flex-1' : 'flex-1'
                    )}>
                        <button
                            onClick={goBack}
                            className={cn(
                                'flex items-center justify-center rounded-xl border border-white/10 bg-sparkle-card text-white/50 shadow-sm transition-colors hover:border-white/20 hover:text-white shrink-0',
                                isCondensedLayout ? 'h-10 w-10' : 'h-11 w-11'
                            )}
                            title="Go Back"
                        >
                            <ArrowLeft size={isCondensedLayout ? 16 : 18} />
                        </button>

                        <div className={cn(
                            'flex min-w-0 items-center overflow-x-auto rounded-xl border border-white/10 bg-sparkle-card shadow-sm [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
                            isCondensedLayout ? 'h-10 flex-1 p-1' : 'h-11 flex-1 p-1'
                        )}>
                            <button
                                onClick={() => setActiveTab('readme')}
                                className={cn(
                                    'flex h-full min-w-[58px] flex-1 shrink-0 items-center justify-center gap-2 rounded-lg font-medium transition-colors sm:min-w-[96px]',
                                    isCondensedLayout ? 'text-[13px]' : 'text-sm',
                                    activeTab === 'readme' ? 'bg-white/10 text-white' : 'text-white/40 hover:text-white hover:bg-white/5'
                                )}
                            >
                                <BookOpen size={isCondensedLayout ? 14 : 15} />
                                <span className="hidden sm:inline">README</span>
                            </button>
                            <button
                                onClick={() => setActiveTab('files')}
                                className={cn(
                                    'flex h-full min-w-[58px] flex-1 shrink-0 items-center justify-center gap-2 rounded-lg font-medium transition-colors sm:min-w-[96px]',
                                    isCondensedLayout ? 'text-[13px]' : 'text-sm',
                                    activeTab === 'files' ? 'bg-white/10 text-white' : 'text-white/40 hover:text-white hover:bg-white/5'
                                )}
                            >
                                <FolderOpen size={isCondensedLayout ? 14 : 15} />
                                <span className="hidden sm:inline">Files</span>
                            </button>
                            <button
                                onClick={() => setActiveTab('git')}
                                className={cn(
                                    'flex h-full min-w-[58px] flex-1 shrink-0 items-center justify-center gap-2 rounded-lg font-medium transition-colors sm:min-w-[96px]',
                                    isCondensedLayout ? 'text-[13px]' : 'text-sm',
                                    activeTab === 'git' ? 'bg-white/10 text-white' : 'text-white/40 hover:text-white hover:bg-white/5'
                                )}
                            >
                                <GitBranch size={isCondensedLayout ? 14 : 15} />
                                <span className="hidden sm:inline">Git</span>
                                {changedFiles.length > 0 && (
                                    <span className="rounded-full bg-[#E2C08D]/20 px-1.5 py-0.5 text-[#E2C08D]">
                                        <DiffStats
                                            additions={workingChangesDiff.additions}
                                            deletions={workingChangesDiff.deletions}
                                            loading={workingChangesDiff.loading}
                                            compact
                                            showBar={false}
                                        />
                                    </span>
                                )}
                                {unpushedCommits.length > 0 && (
                                    <span className="hidden items-center gap-1 rounded-full border border-blue-400/30 bg-blue-500/20 px-1.5 py-0.5 text-[10px] text-blue-300 md:inline-flex">
                                        <GitPullRequest size={10} />
                                        {unpushedCommits.length}
                                    </span>
                                )}
                            </button>
                        </div>
                    </div>

                    {isCondensedLayout && (
                        <div className="flex w-full flex-wrap items-center justify-end gap-2 sm:w-auto">
                            <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-sparkle-card p-1 shadow-sm">
                                <button
                                    onClick={onShowScriptsModal}
                                    className="relative flex h-8 w-8 items-center justify-center rounded-lg text-white/55 transition-colors hover:bg-white/5 hover:text-white"
                                    title="Open scripts"
                                >
                                    <Terminal size={14} />
                                    {scriptCount > 0 && (
                                        <span className="absolute -right-1 -top-1 min-w-[18px] rounded-full bg-white/10 px-1 py-0.5 text-center text-[10px] text-white/55">
                                            {scriptCount}
                                        </span>
                                    )}
                                </button>

                                <div className="h-5 w-px bg-white/8" />

                                <button
                                    onClick={onShowDependenciesModal}
                                    className="relative flex h-8 w-8 items-center justify-center rounded-lg text-white/55 transition-colors hover:bg-white/5 hover:text-white"
                                    title="Open dependencies"
                                >
                                    <Package size={14} />
                                    {dependencyCount > 0 && (
                                        <span className="absolute -right-1 -top-1 min-w-[18px] rounded-full bg-white/10 px-1 py-0.5 text-center text-[10px] text-white/55">
                                            {dependencyCount}
                                        </span>
                                    )}
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </>
    )
}
