import { readdir } from 'node:fs/promises'
import { PROJECT_TYPES, projectMarkerMatches } from '../ipc/project-detection'
import { DEPENDENCY_MANAGER_LOCKFILES } from '../services/project-dependencies'

export type ProjectAnalyticsCapabilities = {
    has_git: boolean
    language_count: number
    package_manager_count: number
}

export async function inspectProjectAnalyticsCapabilities(projectPath: string): Promise<ProjectAnalyticsCapabilities> {
    const entries = await readdir(projectPath)
    return {
        has_git: entries.includes('.git'),
        language_count: PROJECT_TYPES.filter((type) => (
            type.id !== 'git' && type.markers.some((marker) => projectMarkerMatches(marker, entries))
        )).length,
        package_manager_count: countProjectPackageManagers(entries)
    }
}

export function countProjectPackageManagers(entries: readonly string[]): number {
    const normalized = new Set(entries.map((entry) => entry.toLowerCase()))
    return Object.values(DEPENDENCY_MANAGER_LOCKFILES)
        .filter((markers) => markers.some((marker) => normalized.has(marker)))
        .length
}
