import { Clock, ExternalLink, FolderOpen, Pencil, Trash2 } from 'lucide-react'
import type { MouseEvent as ReactMouseEvent } from 'react'
import ProjectIcon, { FrameworkBadge } from '@/components/ui/ProjectIcon'
import { cn } from '@/lib/utils'
import { getProjectTypeById, type Project, type ViewMode } from './types'
import { WRAP_AND_CLAMP_2 } from '../shared/BrowseSectionPrimitives'
import { FileActionsMenu } from '@/components/ui/FileActionsMenu'

interface FolderBrowseProjectCardProps {
    project: Project
    viewMode: ViewMode
    onProjectClick: (project: Project) => void
    onOpenProjectInExplorer: (path: string) => void
    onProjectRename: (project: Project) => void | Promise<void>
    onProjectDelete: (project: Project) => void | Promise<void>
    onProjectContextMenu?: (event: ReactMouseEvent<HTMLDivElement>, project: Project) => void
    formatRelativeTime: (timestamp?: number) => string
}

export function FolderBrowseProjectCard({
    project,
    viewMode,
    onProjectClick,
    onOpenProjectInExplorer,
    onProjectRename,
    onProjectDelete,
    onProjectContextMenu,
    formatRelativeTime
}: FolderBrowseProjectCardProps) {
    const typeInfo = getProjectTypeById(project.type)
    const themeColor = typeInfo?.themeColor || '#525252'

    return (
        <div
            onClick={() => onProjectClick(project)}
            onContextMenu={(event) => onProjectContextMenu?.(event, project)}
            className={cn(
                'group relative cursor-pointer overflow-hidden border border-white/5 transition-all duration-300',
                'hover:-translate-y-1 hover:border-white/10',
                viewMode === 'finder'
                    ? 'flex flex-col items-center rounded-xl bg-sparkle-card p-4 text-center'
                    : 'flex flex-col gap-4 rounded-2xl bg-sparkle-card p-5'
            )}
        >
            <div
                className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-500 group-hover:opacity-100"
                style={{
                    boxShadow: `inset 0 0 0 1px ${themeColor}40`,
                    background: `linear-gradient(to bottom right, ${themeColor}05, transparent)`
                }}
            />

            {viewMode === 'finder' ? (
                <>
                    <div className="absolute top-2 right-2 z-20">
                        <FileActionsMenu
                            buttonClassName="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity bg-black/20"
                            items={[
                                { id: 'open', label: 'Open', icon: <FolderOpen size={13} />, onSelect: () => onProjectClick(project) },
                                { id: 'explorer', label: 'Open in Explorer', icon: <ExternalLink size={13} />, onSelect: () => onOpenProjectInExplorer(project.path) },
                                { id: 'rename', label: 'Rename Project', icon: <Pencil size={13} />, onSelect: () => onProjectRename(project) },
                                { id: 'delete', label: 'Delete Project', icon: <Trash2 size={13} />, danger: true, onSelect: () => onProjectDelete(project) }
                            ]}
                        />
                    </div>
                    <div className="relative mb-3 flex h-16 w-16 items-center justify-center rounded-2xl border border-white/5 bg-sparkle-bg shadow-inner group-hover:border-white/20">
                        <ProjectIcon
                            projectType={project.type}
                            framework={project.frameworks?.[0]}
                            customIconPath={project.projectIconPath}
                            size={40}
                        />
                        {project.type === 'electron' && (
                            <div className="absolute -bottom-1 -right-1 rounded border border-white/10 bg-sparkle-bg p-1 shadow-lg">
                                <ProjectIcon projectType="electron" size={12} />
                            </div>
                        )}
                    </div>
                    <span className={cn('min-h-8 w-full text-xs font-bold leading-4 text-white', WRAP_AND_CLAMP_2)} title={project.name}>
                        {project.name}
                    </span>
                    <span className="w-full truncate text-[10px] text-white/40" title={typeInfo?.displayName || project.type}>{typeInfo?.displayName || project.type}</span>
                </>
            ) : (
                <>
                    <div className="relative z-10 flex w-full items-start justify-between">
                        <div className="rounded-xl border border-white/5 bg-sparkle-bg p-3 shadow-inner">
                            <ProjectIcon
                                projectType={project.type}
                                framework={project.frameworks?.[0]}
                                customIconPath={project.projectIconPath}
                                size={32}
                            />
                        </div>
                        <FileActionsMenu
                            buttonClassName="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity"
                            items={[
                                { id: 'open', label: 'Open', icon: <FolderOpen size={13} />, onSelect: () => onProjectClick(project) },
                                { id: 'explorer', label: 'Open in Explorer', icon: <ExternalLink size={13} />, onSelect: () => onOpenProjectInExplorer(project.path) },
                                { id: 'rename', label: 'Rename Project', icon: <Pencil size={13} />, onSelect: () => onProjectRename(project) },
                                { id: 'delete', label: 'Delete Project', icon: <Trash2 size={13} />, danger: true, onSelect: () => onProjectDelete(project) }
                            ]}
                        />
                    </div>

                    <div className="relative z-10 flex-1">
                        <h3 className={cn('mb-1 text-lg font-bold leading-6 text-white transition-colors group-hover:text-white/90', WRAP_AND_CLAMP_2)} title={project.name}>
                            {project.name}
                        </h3>
                        <p className="mb-3 truncate text-xs text-white/40" title={typeInfo?.displayName || project.type}>{typeInfo?.displayName || project.type}</p>

                        {project.frameworks && project.frameworks.length > 0 && (
                            <div className="mb-3 flex flex-wrap gap-1.5">
                                {project.frameworks.slice(0, 3).map((framework) => (
                                    <FrameworkBadge
                                        key={framework}
                                        framework={framework}
                                        size="sm"
                                        showLabel={false}
                                    />
                                ))}
                            </div>
                        )}
                    </div>

                    <div className="relative z-10 flex items-center justify-between gap-2">
                        <button
                            onClick={(event) => {
                                event.stopPropagation()
                                onOpenProjectInExplorer(project.path)
                            }}
                            className="flex items-center gap-1.5 rounded-lg bg-sparkle-border-secondary px-3 py-1.5 text-xs text-sparkle-text-secondary transition-colors hover:text-sparkle-text"
                        >
                            <ExternalLink size={14} />
                            <span>Open</span>
                        </button>
                        <div className="flex items-center gap-1.5 text-[10px] text-white/30">
                            <Clock size={12} />
                            <span>{formatRelativeTime(project.lastModified)}</span>
                        </div>
                    </div>

                    <div
                        className="absolute bottom-0 left-0 right-0 h-1 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
                        style={{ background: themeColor }}
                    />
                </>
            )}
        </div>
    )
}
