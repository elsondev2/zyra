import { useEffect, useRef, useState } from 'react'
import { Archive, ArrowUpRight, Check, FolderOpen, GitBranch, MoreHorizontal, Pencil, RotateCcw, X } from 'lucide-react'
import ProjectIcon from '@/components/ui/ProjectIcon'
import type { DevScopeProjectGitOverviewItem } from '@shared/contracts/devscope-git-contracts'
import { projectTechnologyTags } from './devscopePortfolioPaths'
import { ProjectTechPill } from './ProjectTechPill'
import type { PortfolioProject } from './useDevScopePortfolio'

type Props = {
    project: PortfolioProject
    iconPath?: string | null
    git?: DevScopeProjectGitOverviewItem
    githubName?: string
    view: 'list' | 'cards'
    onOpen: () => void
    onArchive: () => void
    onRename: (name: string) => void
    onReveal: () => void
}

function GitSummary({ git }: { git?: DevScopeProjectGitOverviewItem }) {
    if (!git) return <span className="text-sparkle-text-muted">Git status pending</span>
    if (git.error) return <span className="text-sparkle-text-muted">Git unavailable</span>
    if (!git.isGitRepo) return <span className="text-sparkle-text-muted">Local project</span>
    return <span className="inline-flex items-center gap-1.5 text-sparkle-text-secondary"><GitBranch size={12} />{git.changedCount ? `${git.changedCount} changed` : 'Clean'}{git.unpushedCount > 0 ? <span className="text-sky-300">↑{git.unpushedCount}</span> : null}</span>
}

function ProjectMenu({ project, onOpen, onArchive, onStartRename, onReveal }: {
    project: PortfolioProject
    onOpen: () => void
    onArchive: () => void
    onStartRename: () => void
    onReveal: () => void
}) {
    const [open, setOpen] = useState(false)
    const menuRef = useRef<HTMLDivElement>(null)
    useEffect(() => {
        if (!open) return
        const outside = (event: PointerEvent) => { if (!menuRef.current?.contains(event.target as Node)) setOpen(false) }
        const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false) }
        document.addEventListener('pointerdown', outside)
        document.addEventListener('keydown', escape)
        return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape) }
    }, [open])

    const choose = (action: () => void) => { setOpen(false); action() }
    return <div ref={menuRef} className="relative shrink-0" onClick={event => event.stopPropagation()}>
        <button type="button" onClick={() => setOpen(value => !value)} aria-label={`Project actions for ${project.displayName}`} aria-haspopup="menu" aria-expanded={open} className="rounded-md p-2 text-sparkle-text-secondary hover:bg-white/10 hover:text-sparkle-text"><MoreHorizontal size={16} /></button>
        {open ? <div role="menu" className="absolute right-0 top-full z-30 mt-1 w-44 rounded-lg border border-[var(--surface-divider)] bg-[var(--surface-floating)] p-1 shadow-xl">
            <button type="button" role="menuitem" onClick={() => choose(onOpen)} className="flex w-full items-center gap-2 rounded px-2.5 py-2 text-left text-xs hover:bg-white/10"><ArrowUpRight size={14} />Open project</button>
            <button type="button" role="menuitem" onClick={() => choose(onReveal)} className="flex w-full items-center gap-2 rounded px-2.5 py-2 text-left text-xs hover:bg-white/10"><FolderOpen size={14} />Show in Explorer</button>
            <button type="button" role="menuitem" onClick={() => choose(onStartRename)} className="flex w-full items-center gap-2 rounded px-2.5 py-2 text-left text-xs hover:bg-white/10"><Pencil size={14} />Rename in DevScope</button>
            <div className="my-1 border-t border-[var(--surface-divider)]" />
            <button type="button" role="menuitem" onClick={() => choose(onArchive)} className="flex w-full items-center gap-2 rounded px-2.5 py-2 text-left text-xs hover:bg-white/10">{project.archived ? <RotateCcw size={14} /> : <Archive size={14} />}{project.archived ? 'Restore' : 'Archive'}</button>
        </div> : null}
    </div>
}

export function DevScopeProjectRow({ project, iconPath, git, githubName, view, onOpen, onArchive, onRename, onReveal }: Props) {
    const [renaming, setRenaming] = useState(false)
    const [draftName, setDraftName] = useState(project.displayName)
    const tags = projectTechnologyTags(project)
    const icon = <ProjectIcon projectType={project.type} customIconPath={iconPath} size={view === 'cards' ? 32 : 21} />
    const menu = <ProjectMenu project={project} onOpen={onOpen} onArchive={onArchive} onReveal={onReveal} onStartRename={() => { setDraftName(project.displayName); setRenaming(true) }} />
    const name = renaming ? <form onSubmit={event => { event.preventDefault(); const next = draftName.trim(); if (next) onRename(next); setRenaming(false) }} onClick={event => event.stopPropagation()} className="flex min-w-0 items-center gap-1">
        <input autoFocus aria-label="Project name" value={draftName} onChange={event => setDraftName(event.target.value)} onKeyDown={event => { if (event.key === 'Escape') setRenaming(false) }} className="min-w-0 flex-1 rounded border border-[var(--accent-primary)] bg-transparent px-2 py-1 text-sm outline-none" />
        <button type="submit" aria-label="Save project name" className="rounded p-1 hover:bg-white/10"><Check size={14} /></button><button type="button" aria-label="Cancel rename" onClick={() => setRenaming(false)} className="rounded p-1 hover:bg-white/10"><X size={14} /></button>
    </form> : <button type="button" onClick={onOpen} className="block min-w-0 max-w-full truncate text-left text-sm font-semibold text-sparkle-text hover:text-[var(--accent-primary)]">{project.displayName}</button>

    if (view === 'cards') return <article className="group flex min-h-48 min-w-0 flex-col rounded-xl border border-[var(--surface-divider)] bg-[var(--surface-floating)] p-4 transition-colors hover:border-white/20 hover:bg-white/[0.045]">
        <div className="flex items-start justify-between gap-3"><div className="flex size-12 shrink-0 items-center justify-center rounded-lg border border-[var(--surface-divider)] bg-white/[0.035]">{icon}</div>{menu}</div>
        <div className="mt-4 min-w-0">{name}<p className="mt-1 truncate font-mono text-[11px] text-sparkle-text-muted" title={project.path}>{project.path}</p></div>
        <div className="mt-3 flex flex-wrap gap-1.5">{tags.map(tag => <ProjectTechPill key={`${tag.kind}:${tag.id}`} technology={tag} />)}</div>
        <div className="mt-auto flex items-center justify-between gap-2 pt-5 text-[11px]"><GitSummary git={git} /><span className="shrink-0 text-sparkle-text-muted" title={githubName}>{githubName ? 'Matched on GitHub' : project.source === 'added' ? 'Added' : 'Detected locally'}</span></div>
    </article>

    return <div className="group flex min-w-0 items-center gap-3 border-b border-[var(--surface-divider)] px-3 py-3 last:border-b-0 hover:bg-white/[0.035] sm:gap-4 sm:px-4">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-md border border-[var(--surface-divider)] bg-white/[0.035]">{icon}</div>
        <div className="min-w-0 flex-1">{name}<p className="mt-0.5 truncate font-mono text-[11px] text-sparkle-text-muted" title={project.path}>{project.path}</p><div className="mt-1.5 flex flex-wrap gap-1 md:hidden">{tags.slice(0, 2).map(tag => <ProjectTechPill key={`${tag.kind}:${tag.id}`} technology={tag} />)}</div></div>
        <div className="hidden max-w-56 shrink-0 flex-wrap justify-end gap-1 md:flex">{tags.slice(0, 2).map(tag => <ProjectTechPill key={`${tag.kind}:${tag.id}`} technology={tag} />)}</div>
        <div className="hidden min-w-28 justify-end text-xs lg:flex"><GitSummary git={git} /></div>
        {githubName ? <span className="hidden text-[10px] text-sparkle-text-muted xl:block" title={githubName}>GitHub match</span> : null}
        {menu}
    </div>
}
