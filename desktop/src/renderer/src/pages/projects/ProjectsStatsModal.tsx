import { ExternalLink, Pencil, Search, Trash2 } from 'lucide-react'
import ProjectIcon from '@/components/ui/ProjectIcon'

export type StatsModalKey = 'projects' | 'frameworks' | 'types'

interface ModalProject {
    name: string
    path: string
    type: string
    markers: string[]
    frameworks: string[]
    lastModified?: number
    isProject: boolean
}

interface ModalCountItem {
    name: string
    count: number
}

export function ProjectsStatsModal({
    statsModal,
    modalTitle,
    modalCount,
    projectsModalQuery,
    setProjectsModalQuery,
    filteredModalProjects,
    modalFrameworks,
    modalTypes,
    onClose,
    onProjectClick,
    onProjectRename,
    onProjectDelete,
    getProjectTypeLabel,
    onOpenInExplorer
}: {
    statsModal: StatsModalKey | null
    modalTitle: string
    modalCount: number
    projectsModalQuery: string
    setProjectsModalQuery: (value: string) => void
    filteredModalProjects: ModalProject[]
    modalFrameworks: ModalCountItem[]
    modalTypes: ModalCountItem[]
    onClose: () => void
    onProjectClick: (project: ModalProject) => void
    onProjectRename: (project: ModalProject) => void
    onProjectDelete: (project: ModalProject) => void
    getProjectTypeLabel: (type: string) => string
    onOpenInExplorer: (path: string) => void
}) {
    if (!statsModal) return null

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fadeIn p-4"
            onClick={onClose}
        >
            <div
                className="w-full max-w-5xl max-h-[95vh] rounded-2xl border border-white/10 bg-sparkle-card overflow-hidden flex flex-col"
                onClick={(event) => event.stopPropagation()}
            >
                <div className="flex items-center justify-between border-b border-white/10 px-5 py-3 flex-shrink-0">
                    <div className="flex items-center gap-3">
                        <h3 className="text-sm font-semibold text-white">{modalTitle}</h3>
                        <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs text-white/60">
                            {modalCount}
                        </span>
                    </div>
                    <button
                        onClick={onClose}
                        className="rounded-md border border-white/10 px-2 py-1 text-xs text-white/60 hover:text-white hover:bg-white/[0.03] transition-colors"
                    >
                        Close
                    </button>
                </div>

                <div className="overflow-y-auto p-4 flex-1">
                    {statsModal === 'projects' && (
                        <div>
                            <div className="sticky top-0 z-20 -mx-4 mb-4 border-b border-sparkle-border bg-sparkle-card/95 px-4 pb-3 pt-1 backdrop-blur-xl">
                                <div className="relative">
                                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-sparkle-text-muted" />
                                    <input
                                        type="text"
                                        value={projectsModalQuery}
                                        onChange={(event) => setProjectsModalQuery(event.target.value)}
                                        placeholder="Search projects by name, path, type, framework..."
                                        className="w-full rounded-lg border border-sparkle-border bg-sparkle-bg py-2 pl-9 pr-3 text-sm text-sparkle-text placeholder:text-sparkle-text-muted focus:outline-none focus:border-[var(--accent-primary)]/40"
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                                {filteredModalProjects.map((project) => (
                                    <div key={project.path} className="rounded-xl border border-sparkle-border p-3 bg-sparkle-bg/40 hover:bg-sparkle-bg/60 transition-colors">
                                        <div className="mb-2 flex items-start gap-2.5">
                                            <div className="rounded-lg border border-white/10 bg-sparkle-card p-2 shadow-inner shrink-0">
                                                <ProjectIcon projectType={project.type} framework={project.frameworks?.[0]} size={18} />
                                            </div>
                                            <div className="min-w-0 flex-1">
                                                <button
                                                    onClick={() => onProjectClick(project)}
                                                    className="text-left text-sm font-semibold text-sparkle-text hover:text-[var(--accent-primary)] transition-colors whitespace-normal break-words [display:-webkit-box] [-webkit-line-clamp:2] [-webkit-box-orient:vertical] overflow-hidden"
                                                    title={project.name}
                                                >
                                                    {project.name}
                                                </button>
                                                <div className="mt-0.5 text-[10px] px-1.5 py-0.5 rounded bg-sparkle-border-secondary text-sparkle-text-secondary inline-flex max-w-full truncate">
                                                    {getProjectTypeLabel(project.type)}
                                                </div>
                                            </div>
                                        </div>

                                        <div className="text-[11px] text-sparkle-text-muted truncate mb-2" title={project.path}>
                                            {project.path}
                                        </div>

                                        <div className="flex items-center justify-between gap-2">
                                            <span className="text-[11px] text-sparkle-text-secondary truncate">
                                                {project.frameworks?.length ? project.frameworks.join(', ') : 'No frameworks'}
                                            </span>
                                            <div className="inline-flex items-center gap-1 shrink-0">
                                                <button
                                                    onClick={() => onProjectRename(project)}
                                                    className="inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded border border-sparkle-border text-sparkle-text-secondary hover:text-sparkle-text hover:bg-sparkle-card-hover transition-colors"
                                                    title="Rename project"
                                                >
                                                    <Pencil size={11} />
                                                    Rename
                                                </button>
                                                <button
                                                    onClick={() => onProjectDelete(project)}
                                                    className="inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded border border-red-500/30 text-red-200 hover:bg-red-500/15 transition-colors"
                                                    title="Delete project"
                                                >
                                                    <Trash2 size={11} />
                                                    Delete
                                                </button>
                                                <button
                                                    onClick={() => onOpenInExplorer(project.path)}
                                                    className="inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded border border-sparkle-border text-sparkle-text-secondary hover:text-sparkle-text hover:bg-sparkle-card-hover transition-colors"
                                                >
                                                    <ExternalLink size={11} />
                                                    Open
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {statsModal === 'frameworks' && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                            {modalFrameworks.map((framework) => (
                                <div key={framework.name} className="rounded-lg border border-sparkle-border bg-sparkle-bg/40 px-3 py-2.5">
                                    <div className="flex items-center gap-2 min-w-0">
                                        <div className="rounded-md border border-white/10 bg-sparkle-card p-1.5 shrink-0">
                                            <ProjectIcon framework={framework.name} projectType="default" size={14} />
                                        </div>
                                        <div className="min-w-0">
                                            <div className="text-sm text-sparkle-text font-medium truncate">{framework.name}</div>
                                            <div className="text-[11px] text-sparkle-text-secondary">{framework.count} projects</div>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {statsModal === 'types' && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                            {modalTypes.map((type) => (
                                <div key={type.name} className="rounded-lg border border-sparkle-border bg-sparkle-bg/40 px-3 py-2.5">
                                    <div className="flex items-center gap-2 min-w-0">
                                        <div className="rounded-md border border-white/10 bg-sparkle-card p-1.5 shrink-0">
                                            <ProjectIcon projectType={type.name} size={14} />
                                        </div>
                                        <div className="min-w-0">
                                            <div className="text-sm text-sparkle-text font-medium truncate">
                                                {getProjectTypeLabel(type.name)}
                                            </div>
                                            <div className="text-[11px] text-sparkle-text-secondary">{type.count} projects</div>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
