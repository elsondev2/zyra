import type { AssistantPlaygroundLab, AssistantPlaygroundState, AssistantSessionMode } from './contracts'

function stripTrailingSeparators(value: string): string {
    const trimmed = value.trim()
    if (/^[A-Za-z]:[\\/]?$/.test(trimmed)) {
        return `${trimmed[0]}:\\`
    }
    return trimmed.replace(/[\\/]+$/, '')
}

export function sanitizeAssistantProjectPath(value: string | null | undefined): string | null {
    const normalized = stripTrailingSeparators(String(value || ''))
    return normalized.length > 0 ? normalized : null
}

export function normalizeAssistantProjectPathKey(value: string | null | undefined): string {
    return String(sanitizeAssistantProjectPath(value) || '').toLowerCase()
}

export function isAssistantProjectPathWithinRoot(pathKey: string, rootKey: string): boolean {
    if (!pathKey || !rootKey) return false
    return pathKey === rootKey || pathKey.startsWith(`${rootKey}\\`) || pathKey.startsWith(`${rootKey}/`)
}

export function findAssistantPlaygroundLabByProjectPath(
    projectPath: string | null | undefined,
    playground: AssistantPlaygroundState
): AssistantPlaygroundLab | null {
    const projectPathKey = normalizeAssistantProjectPathKey(projectPath)
    if (!projectPathKey) return null

    let matchedLab: AssistantPlaygroundLab | null = null
    let matchedRootKey = ''

    for (const lab of playground.labs || []) {
        const labRootKey = normalizeAssistantProjectPathKey(lab.rootPath)
        if (!labRootKey || !isAssistantProjectPathWithinRoot(projectPathKey, labRootKey)) continue
        if (labRootKey.length <= matchedRootKey.length) continue
        matchedLab = lab
        matchedRootKey = labRootKey
    }

    return matchedLab
}

export function isAssistantProjectInPlayground(
    projectPath: string | null | undefined,
    playground: AssistantPlaygroundState
): boolean {
    const projectPathKey = normalizeAssistantProjectPathKey(projectPath)
    if (!projectPathKey) return false

    if (findAssistantPlaygroundLabByProjectPath(projectPath, playground)) {
        return true
    }

    const playgroundRootKey = normalizeAssistantProjectPathKey(playground.rootPath)
    return isAssistantProjectPathWithinRoot(projectPathKey, playgroundRootKey)
}

export function resolveAssistantProjectTarget(
    projectPath: string | null | undefined,
    _playground: AssistantPlaygroundState
): {
    mode: AssistantSessionMode
    projectPath: string | null
    playgroundLabId: string | null
} {
    const sanitizedProjectPath = sanitizeAssistantProjectPath(projectPath)

    return {
        mode: 'work',
        projectPath: sanitizedProjectPath,
        playgroundLabId: null
    }
}
