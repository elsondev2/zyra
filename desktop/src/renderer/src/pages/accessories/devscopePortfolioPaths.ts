import type { DevScopeProject } from '@shared/contracts/devscope-project-contracts'

export const pathKey = (path: string) => path.replace(/[\\/]+$/, '').replace(/\\/g, '/').toLowerCase()

export const folderName = (path: string) => path.replace(/[\\/]+$/, '').split(/[\\/]/).pop() || path

export function isWithinPath(parent: string, child: string): boolean {
    const base = pathKey(parent)
    const target = pathKey(child)
    return target === base || target.startsWith(`${base}/`)
}

const SYSTEM_PARTS = new Set([
    'appdata', 'programdata', 'program files', 'program files (x86)',
    'windows', 'node_modules', '.git', '.zyra-worktrees', '.venv', 'venv',
    'dist', 'build', 'target', '__pycache__'
])

export function isSystemProjectPath(path: string): boolean {
    return pathKey(path).split('/').some(part => SYSTEM_PARTS.has(part))
}

export function collapseNestedProjects<T extends Pick<DevScopeProject, 'path'>>(projects: T[]): T[] {
    const sorted = projects.filter(project => !isSystemProjectPath(project.path))
        .sort((left, right) => pathKey(left.path).length - pathKey(right.path).length)
    const result: T[] = []
    for (const project of sorted) {
        if (!result.some(parent => isWithinPath(parent.path, project.path))) result.push(project)
    }
    return result
}

type TechnologyDefinition = { label: string; color: string }
export type ProjectTechnology = TechnologyDefinition & { id: string; kind: 'type' | 'framework' }

const TYPES: Record<string, TechnologyDefinition> = {
    node: { label: 'Node.js', color: '#5FA04E' }, python: { label: 'Python', color: '#3776AB' },
    rust: { label: 'Rust', color: '#B77A48' }, go: { label: 'Go', color: '#00ADD8' },
    java: { label: 'Java', color: '#E76F36' }, dotnet: { label: '.NET', color: '#7A5ACB' },
    ruby: { label: 'Ruby', color: '#CC342D' }, php: { label: 'PHP', color: '#777BB4' },
    dart: { label: 'Dart', color: '#0175C2' }, elixir: { label: 'Elixir', color: '#8E63B5' },
    cpp: { label: 'C/C++', color: '#5489C7' }, git: { label: 'Git repo', color: '#F05032' },
    unknown: { label: 'Code project', color: '#8B9AA5' }
}
const FRAMEWORKS: Record<string, TechnologyDefinition> = {
    typescript: { label: 'TypeScript', color: '#3178C6' }, react: { label: 'React', color: '#61DAFB' },
    nextjs: { label: 'Next.js', color: '#AEB8C2' }, vue: { label: 'Vue', color: '#4FC08D' },
    angular: { label: 'Angular', color: '#DD0031' }, electron: { label: 'Electron', color: '#7CB4C4' },
    express: { label: 'Express', color: '#AAB4BD' }, vite: { label: 'Vite', color: '#8A69E6' },
    tailwind: { label: 'Tailwind', color: '#06B6D4' }, flutter: { label: 'Flutter', color: '#54C5F8' }
}

export function projectTechnologyTags(project: DevScopeProject): ProjectTechnology[] {
    const type = TYPES[project.type] || { label: project.type || 'Code project', color: '#8B9AA5' }
    const tags: ProjectTechnology[] = [{ id: project.type, kind: 'type', ...type }]
    for (const id of project.frameworks || []) {
        const framework = FRAMEWORKS[id] || { label: id, color: '#8B9AA5' }
        if (!tags.some(tag => tag.label === framework.label)) tags.push({ id, kind: 'framework', ...framework })
    }
    return tags.slice(0, 4)
}

export const projectTags = (project: DevScopeProject): string[] => projectTechnologyTags(project).map(tag => tag.label)

export type ProjectSortOrder = 'recent' | 'oldest' | 'name'

export function sortPortfolioProjects<T extends Pick<DevScopeProject, 'name' | 'lastModified' | 'path'> & { displayName?: string }>(projects: T[], order: ProjectSortOrder): T[] {
    return [...projects].sort((left, right) => {
        if (order !== 'name') {
            const byActivity = (right.lastModified || 0) - (left.lastModified || 0)
            if (byActivity) return order === 'recent' ? byActivity : -byActivity
        }
        return (left.displayName || left.name).localeCompare(right.displayName || right.name) || left.path.localeCompare(right.path)
    })
}
