import type { ProjectDetails } from './types'

function getProjectNameFromPath(projectPath: string): string {
    const normalizedPath = String(projectPath || '').trim().replace(/[\\/]+$/, '')
    if (!normalizedPath) return 'Project'

    const parts = normalizedPath.split(/[\\/]/).filter(Boolean)
    const lastPart = parts[parts.length - 1]

    if (lastPart && /^[A-Za-z]:$/.test(lastPart)) {
        return normalizedPath
    }

    return lastPart || normalizedPath
}

export function buildProjectDetailsShell(projectPath: string): ProjectDetails {
    const displayName = getProjectNameFromPath(projectPath)

    return {
        name: displayName,
        displayName,
        path: projectPath,
        type: 'unknown',
        projectIconPath: null,
        markers: [],
        frameworks: []
    }
}
