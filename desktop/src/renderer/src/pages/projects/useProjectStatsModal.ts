import { useEffect, useMemo, useState } from 'react'
import { Code, FileCode, GitBranch } from 'lucide-react'
import type { IndexedInventory, IndexedTotals, Project, StatChip } from './projectsTypes'

export type StatsModalKey = 'projects' | 'frameworks' | 'types'

export function useProjectStatsModal(
    projects: Project[],
    indexedTotals: IndexedTotals | null,
    indexedInventory: IndexedInventory | null,
    searchRootsKey: string
) {
    const [statsModal, setStatsModal] = useState<StatsModalKey | null>(null)
    const [projectsModalQuery, setProjectsModalQuery] = useState('')

    const projectTypes = useMemo(() => {
        const types = new Set(projects.map((project) => project.type))
        return Array.from(types).filter((type) => type !== 'unknown' && type !== 'git')
    }, [projects])

    const frameworkCountFromScan = useMemo(() => {
        const frameworks = new Set<string>()
        projects.forEach((project) => project.frameworks?.forEach((framework) => frameworks.add(framework)))
        return frameworks.size
    }, [projects])

    const activeIndexedTotals = indexedTotals?.scanKey === searchRootsKey ? indexedTotals : null
    const activeIndexedInventory = indexedInventory?.scanKey === searchRootsKey ? indexedInventory : null
    const totalProjects = activeIndexedTotals?.projects ?? projects.length
    const frameworkCount = activeIndexedTotals?.frameworks ?? frameworkCountFromScan
    const typeCount = activeIndexedTotals?.types ?? projectTypes.length

    const statChips = useMemo<StatChip[]>(() => ([
        { key: 'projects', label: 'projects', value: totalProjects, icon: Code, color: 'var(--accent-primary)' },
        { key: 'frameworks', label: 'frameworks', value: frameworkCount, icon: FileCode, color: '#22c55e' },
        { key: 'types', label: 'types', value: typeCount, icon: GitBranch, color: '#f59e0b' }
    ]), [totalProjects, frameworkCount, typeCount])

    const modalProjects = useMemo(() => {
        if (activeIndexedInventory?.projects?.length) {
            return [...activeIndexedInventory.projects].sort((a, b) => a.name.localeCompare(b.name))
        }
        return [...projects].sort((a, b) => a.name.localeCompare(b.name))
    }, [activeIndexedInventory, projects])

    const modalFrameworks = useMemo(() => {
        const source = activeIndexedInventory?.projects ?? projects
        const counts = new Map<string, number>()

        for (const project of source) {
            for (const framework of project.frameworks || []) {
                if (!framework) continue
                counts.set(framework, (counts.get(framework) || 0) + 1)
            }
        }

        return Array.from(counts.entries())
            .map(([name, count]) => ({ name, count }))
            .sort((a, b) => a.name.localeCompare(b.name))
    }, [activeIndexedInventory, projects])

    const modalTypes = useMemo(() => {
        const source = activeIndexedInventory?.projects ?? projects
        const counts = new Map<string, number>()

        for (const project of source) {
            if (!project.type || project.type === 'unknown' || project.type === 'git') continue
            counts.set(project.type, (counts.get(project.type) || 0) + 1)
        }

        return Array.from(counts.entries())
            .map(([name, count]) => ({ name, count }))
            .sort((a, b) => a.name.localeCompare(b.name))
    }, [activeIndexedInventory, projects])

    const filteredModalProjects = useMemo(() => {
        const query = projectsModalQuery.trim().toLowerCase()
        if (!query) return modalProjects

        return modalProjects.filter((project) =>
            project.name.toLowerCase().includes(query)
            || project.path.toLowerCase().includes(query)
            || project.type.toLowerCase().includes(query)
            || (project.frameworks || []).some((framework) => framework.toLowerCase().includes(query))
        )
    }, [modalProjects, projectsModalQuery])

    useEffect(() => {
        if (!statsModal) {
            setProjectsModalQuery('')
            return
        }

        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') setStatsModal(null)
        }
        window.addEventListener('keydown', onKeyDown)
        return () => window.removeEventListener('keydown', onKeyDown)
    }, [statsModal])

    const modalTitle = statsModal === 'projects'
        ? 'Projects'
        : statsModal === 'frameworks'
            ? 'Frameworks'
            : statsModal === 'types'
                ? 'Types'
                : ''

    const modalCount = statsModal === 'projects'
        ? filteredModalProjects.length
        : statsModal === 'frameworks'
            ? modalFrameworks.length
            : statsModal === 'types'
                ? modalTypes.length
                : 0

    return {
        totalProjects,
        frameworkCount,
        typeCount,
        statChips,
        statsModal,
        setStatsModal,
        projectsModalQuery,
        setProjectsModalQuery,
        filteredModalProjects,
        modalFrameworks,
        modalTypes,
        modalTitle,
        modalCount
    }
}
