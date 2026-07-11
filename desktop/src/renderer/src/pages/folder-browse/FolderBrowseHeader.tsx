import { useEffect, useMemo, useRef, useState } from 'react'
import type { MouseEvent as ReactMouseEvent } from 'react'
import { ArrowLeft, ArrowUp, Check, Code, Copy, FileJson, FilePlus, FileText, Folder, FolderGit2, FolderPlus, Plus, RefreshCw, Settings } from 'lucide-react'
import { cn } from '@/lib/utils'
import { FileActionsMenu } from '@/components/ui/FileActionsMenu'
import { OpenWithProjectButton } from '@/components/ui/OpenWithProjectButton'
import { buildRootRelativeBreadcrumbSegments } from './folderBrowsePageUtils'

type RootStats = {
    projects: number
    frameworks: number
    types: number
}

type BreadcrumbDropdownItem = {
    name: string
    path: string
    isProject?: boolean
}

const headerIconButtonClass =
    '!inline-flex !h-10 !w-10 !items-center !justify-center !rounded-xl !border-0 !bg-transparent !text-white/40 transition-colors hover:!bg-white/5 hover:!text-white'

interface FolderBrowseHeaderProps {
    folderName: string
    decodedPath: string
    displayRootPath?: string | null
    totalProjects: number
    isProjectsRootView?: boolean
    rootStats?: RootStats
    isCurrentFolderGitRepo: boolean
    loading: boolean
    onBack: () => void
    onNavigateUp: () => void
    canNavigateUp: boolean
    onNavigateToPath: (path: string) => void
    onViewAsProject: () => void
    preferredShell: 'powershell' | 'cmd'
    onCopyPath: () => void
    copiedPath: boolean
    onOpenStats?: (key: 'projects' | 'frameworks' | 'types') => void
    onOpenProjectsSettings?: () => void
    onRefresh: () => void
    onCreateFile: (presetExtension?: string) => void
    onCreateFolder: () => void
    onCloneRepository: () => void
}

export function FolderBrowseHeader({
    decodedPath,
    displayRootPath,
    isProjectsRootView = false,
    isCurrentFolderGitRepo,
    loading,
    onBack,
    onNavigateUp,
    canNavigateUp,
    onNavigateToPath,
    onViewAsProject,
    preferredShell,
    onCopyPath,
    copiedPath,
    onOpenProjectsSettings,
    onRefresh,
    onCreateFile,
    onCreateFolder,
    onCloneRepository
}: FolderBrowseHeaderProps) {
    const breadcrumbSegments = useMemo(
        () => buildRootRelativeBreadcrumbSegments(decodedPath, displayRootPath),
        [decodedPath, displayRootPath]
    )
    const [openBreadcrumbPath, setOpenBreadcrumbPath] = useState<string | null>(null)
    const [breadcrumbChildrenByPath, setBreadcrumbChildrenByPath] = useState<Record<string, BreadcrumbDropdownItem[]>>({})
    const [loadingBreadcrumbPath, setLoadingBreadcrumbPath] = useState<string | null>(null)
    const breadcrumbMenuRef = useRef<HTMLDivElement | null>(null)
    const breadcrumbMenuOpen = Boolean(openBreadcrumbPath)
    const openBreadcrumbItems = openBreadcrumbPath
        ? (breadcrumbChildrenByPath[openBreadcrumbPath] || [])
        : []

    useEffect(() => {
        if (!openBreadcrumbPath) return
        const handlePointerDown = (event: PointerEvent) => {
            if (breadcrumbMenuRef.current?.contains(event.target as Node)) return
            setOpenBreadcrumbPath(null)
        }
        window.addEventListener('pointerdown', handlePointerDown)
        return () => window.removeEventListener('pointerdown', handlePointerDown)
    }, [openBreadcrumbPath])

    useEffect(() => {
        setOpenBreadcrumbPath(null)
    }, [decodedPath])

    const openBreadcrumbMenu = async (path: string) => {
        setOpenBreadcrumbPath(path)
        if (breadcrumbChildrenByPath[path]) return

        setLoadingBreadcrumbPath(path)
        try {
            const result = await window.devscope.scanProjects(path)
            if (!result.success) {
                setBreadcrumbChildrenByPath((current) => ({ ...current, [path]: [] }))
                return
            }

            const children = [
                ...(result.folders || []).map((folder) => ({
                    name: folder.name,
                    path: folder.path,
                    isProject: false
                })),
                ...(result.projects || []).map((project) => ({
                    name: project.name,
                    path: project.path,
                    isProject: true
                }))
            ].sort((left, right) => {
                if (left.isProject !== right.isProject) return left.isProject ? 1 : -1
                return left.name.localeCompare(right.name)
            })

            setBreadcrumbChildrenByPath((current) => ({ ...current, [path]: children }))
        } catch {
            setBreadcrumbChildrenByPath((current) => ({ ...current, [path]: [] }))
        } finally {
            setLoadingBreadcrumbPath((current) => current === path ? null : current)
        }
    }

    const handleBreadcrumbClick = (path: string) => {
        onNavigateToPath(path)
    }

    const handleBreadcrumbMenuRequest = (path: string, event: ReactMouseEvent) => {
        event.preventDefault()
        event.stopPropagation()
        void openBreadcrumbMenu(path)
    }

    return (
        <div className={cn(
            'flex flex-col transition-[margin,gap] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]',
            'mb-2 gap-3'
        )}>
            <div className={cn(
                'flex min-w-0 items-center gap-3 transition-[gap] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]'
            )}>
                <div className={cn(
                    'group flex min-w-0 flex-1 items-center gap-2 overflow-hidden rounded-xl border border-white/5 bg-white/[0.02] px-3 py-2 transition-[background-color] duration-200 hover:bg-white/[0.04]'
                )}>
                    <button
                        onClick={onBack}
                        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-white/45 transition-colors hover:bg-white/10 hover:text-white"
                        title="Back"
                    >
                        <ArrowLeft size={15} />
                    </button>
                    <button
                        onClick={onNavigateUp}
                        disabled={!canNavigateUp}
                        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-white/45 transition-colors hover:bg-white/10 hover:text-white disabled:pointer-events-none disabled:opacity-30"
                        title="Go to parent folder"
                    >
                        <ArrowUp size={15} />
                    </button>
                    <div className="h-5 w-px shrink-0 bg-white/[0.08]" />
                    <div
                        ref={breadcrumbMenuRef}
                        className="relative min-w-0 flex-1"
                    >
                        <div className="flex min-w-0 items-center overflow-hidden font-mono text-xs text-white/45 transition-colors group-hover:text-white/65">
                            {breadcrumbSegments.map((segment, index) => (
                                <span key={segment.path} className="flex min-w-0 items-center">
                                    {index > 0 && <span className="mx-1 text-white/20">\</span>}
                                    <button
                                        type="button"
                                        onClick={() => handleBreadcrumbClick(segment.path)}
                                        onDoubleClick={(event) => handleBreadcrumbMenuRequest(segment.path, event)}
                                        onContextMenu={(event) => handleBreadcrumbMenuRequest(segment.path, event)}
                                        aria-expanded={openBreadcrumbPath === segment.path}
                                        className={cn(
                                            'min-w-0 truncate rounded-md px-1.5 py-1 text-left transition-colors hover:bg-white/10 hover:text-white',
                                            index === breadcrumbSegments.length - 1 && 'text-white/65'
                                        )}
                                    >
                                        {segment.label}
                                    </button>
                                </span>
                            ))}
                        </div>
                        <div
                            aria-hidden={!breadcrumbMenuOpen}
                            className={cn(
                                'absolute left-0 top-[calc(100%+0.45rem)] z-50 w-[min(360px,80vw)] origin-top overflow-hidden rounded-xl bg-[#18181c] shadow-2xl shadow-black/40 ring-1 ring-white/10',
                                'transition-[opacity,transform,visibility] duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none',
                                breadcrumbMenuOpen
                                    ? 'visible translate-y-0 scale-100 opacity-100'
                                    : 'invisible pointer-events-none -translate-y-1 scale-[0.985] opacity-0'
                            )}
                        >
                                <div className="max-h-72 overflow-y-auto py-1.5">
                                    {breadcrumbMenuOpen && loadingBreadcrumbPath === openBreadcrumbPath && (
                                        <div className="px-3 py-2 text-xs text-white/40">Loading</div>
                                    )}
                                    {breadcrumbMenuOpen && loadingBreadcrumbPath !== openBreadcrumbPath && openBreadcrumbItems.length === 0 && (
                                        <div className="px-3 py-2 text-xs text-white/40">No folders</div>
                                    )}
                                    {openBreadcrumbItems.map((child) => (
                                        <button
                                            key={child.path}
                                            type="button"
                                            onClick={() => {
                                                setOpenBreadcrumbPath(null)
                                                onNavigateToPath(child.path)
                                            }}
                                            className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-white/65 transition-colors hover:bg-white/[0.06] hover:text-white"
                                        >
                                            <Folder size={13} className={child.isProject ? 'text-sky-300' : 'text-yellow-300'} />
                                            <span className="min-w-0 flex-1 truncate">{child.name}</span>
                                            {child.isProject && (
                                                <span className="rounded bg-sky-500/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-sky-200">
                                                    project
                                                </span>
                                            )}
                                        </button>
                                    ))}
                                </div>
                        </div>
                    </div>
                    <button
                        onClick={onCopyPath}
                        className={cn(
                            "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-transparent transition-colors",
                            copiedPath
                                ? "border-green-500/20 bg-green-500/10 text-green-400"
                                : "text-white/40 hover:border-white/5 hover:bg-white/10 hover:text-white"
                        )}
                        title={copiedPath ? "Copied path" : "Copy path"}
                    >
                        {copiedPath ? <Check size={14} /> : <Copy size={14} />}
                    </button>
                </div>

                {/* Primary Actions */}
                <div className={cn(
                    'flex shrink-0 items-center gap-2'
                )}>
                    {isProjectsRootView && onOpenProjectsSettings && (
                        <button
                            onClick={onOpenProjectsSettings}
                            className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/75 transition-colors hover:bg-white/10 hover:text-white"
                            title="Projects settings"
                        >
                            <Settings size={16} />
                        </button>
                    )}
                    <div className={cn('flex items-center gap-1.5', isProjectsRootView && 'ml-1')}>
                        <button
                            onClick={onRefresh}
                            disabled={loading}
                            className={cn(headerIconButtonClass, 'disabled:!opacity-50')}
                            title="Refresh"
                        >
                            <RefreshCw size={16} className={cn(loading && 'animate-spin')} />
                        </button>
                        <FileActionsMenu
                            title="Create"
                            buttonClassName={headerIconButtonClass}
                            triggerIcon={<Plus size={16} className="mx-auto" />}
                            items={[
                                {
                                    id: 'new-file-type',
                                    label: 'New File (Choose Type...)',
                                    icon: <FilePlus size={13} />,
                                    onSelect: () => onCreateFile()
                                },
                                {
                                    id: 'clone-repository',
                                    label: 'Clone Repository...',
                                    icon: <FolderGit2 size={13} />,
                                    onSelect: onCloneRepository
                                },
                                {
                                    id: 'new-md-file',
                                    label: 'Markdown (.md)',
                                    icon: <FileText size={13} />,
                                    onSelect: () => onCreateFile('md')
                                },
                                {
                                    id: 'new-json-file',
                                    label: 'JSON (.json)',
                                    icon: <FileJson size={13} />,
                                    onSelect: () => onCreateFile('json')
                                },
                                {
                                    id: 'new-ts-file',
                                    label: 'TypeScript (.ts)',
                                    icon: <Code size={13} />,
                                    onSelect: () => onCreateFile('ts')
                                },
                                {
                                    id: 'new-txt-file',
                                    label: 'Text (.txt)',
                                    icon: <FileText size={13} />,
                                    onSelect: () => onCreateFile('txt')
                                },
                                {
                                    id: 'new-folder',
                                    label: 'New Folder',
                                    icon: <FolderPlus size={13} />,
                                    onSelect: onCreateFolder
                                }
                            ]}
                        />
                    </div>

                    <div className="h-8 w-[1px] bg-white/10 mx-1 hidden sm:block" />

                    {isCurrentFolderGitRepo && (
                        <button
                            onClick={onViewAsProject}
                            className={cn(
                                'flex items-center gap-2 rounded-xl bg-sky-500 text-white font-bold transition-colors shadow-lg shadow-sky-500/20 hover:bg-sky-400',
                                'px-4 py-2.5 text-sm'
                            )}
                            title="View as Project"
                        >
                            <Code size={18} />
                            <span className="hidden 2xl:inline">View as Project</span>
                        </button>
                    )}
                    <OpenWithProjectButton
                        projectPath={decodedPath || null}
                        preferredShell={preferredShell}
                        menuWidthMode="trigger"
                        menuPresentation="inline"
                    />
                </div>
            </div>

        </div>
    )

}
