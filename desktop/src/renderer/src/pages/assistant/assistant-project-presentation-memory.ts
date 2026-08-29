export type AssistantProjectPresentation = {
    projectIconPath: string | null
    projectType: string | null
    framework: string | null
}

const STORAGE_KEY = 'zyra:assistant-project-presentations:v1'
const MAX_REMEMBERED_PROJECTS = 256
const rememberedPresentations = new Map<string, AssistantProjectPresentation>()
let restored = false

function normalizeProjectKey(projectPath: string): string {
    const normalized = projectPath.trim().replace(/\\/g, '/').replace(/\/+$/u, '')
    return /^[a-z]:\//iu.test(normalized) || normalized.startsWith('//')
        ? normalized.toLowerCase()
        : normalized
}

function optionalString(value: unknown): string | null {
    return typeof value === 'string' && value.trim().length > 0 ? value : null
}

function sanitizePresentation(value: unknown): AssistantProjectPresentation | null {
    if (!value || typeof value !== 'object') return null
    const record = value as Record<string, unknown>
    return {
        projectIconPath: optionalString(record.projectIconPath),
        projectType: optionalString(record.projectType),
        framework: optionalString(record.framework)
    }
}

function hasVisibleIdentity(value: AssistantProjectPresentation): boolean {
    return Boolean(
        value.projectIconPath
        || value.framework
        || (value.projectType && !['unknown', 'default', 'folder'].includes(value.projectType))
    )
}

function restoreRememberedPresentations(): void {
    if (restored) return
    restored = true
    if (typeof window === 'undefined') return

    try {
        const raw = window.localStorage.getItem(STORAGE_KEY)
        const entries = raw ? JSON.parse(raw) as unknown : null
        if (!Array.isArray(entries)) return
        for (const entry of entries.slice(-MAX_REMEMBERED_PROJECTS)) {
            if (!Array.isArray(entry) || typeof entry[0] !== 'string') continue
            const presentation = sanitizePresentation(entry[1])
            if (presentation && hasVisibleIdentity(presentation)) {
                rememberedPresentations.set(entry[0], presentation)
            }
        }
    } catch {
        // A project icon must still work when renderer storage is unavailable.
    }
}

function persistRememberedPresentations(): void {
    if (typeof window === 'undefined') return
    try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify([...rememberedPresentations]))
    } catch {
        // Keep the in-memory identity when renderer storage is unavailable.
    }
}

function presentationsMatch(left: AssistantProjectPresentation, right: AssistantProjectPresentation): boolean {
    return left.projectIconPath === right.projectIconPath
        && left.projectType === right.projectType
        && left.framework === right.framework
}

export function retainAssistantProjectPresentation(
    projectPath: string,
    candidate: AssistantProjectPresentation
): AssistantProjectPresentation {
    const key = normalizeProjectKey(projectPath)
    if (!key) return candidate
    restoreRememberedPresentations()

    const sanitizedCandidate = sanitizePresentation(candidate) || candidate
    const remembered = rememberedPresentations.get(key)
    if (!hasVisibleIdentity(sanitizedCandidate)) return remembered || sanitizedCandidate
    if (remembered && presentationsMatch(remembered, sanitizedCandidate)) return remembered

    rememberedPresentations.delete(key)
    rememberedPresentations.set(key, sanitizedCandidate)
    while (rememberedPresentations.size > MAX_REMEMBERED_PROJECTS) {
        const oldestKey = rememberedPresentations.keys().next().value
        if (typeof oldestKey !== 'string') break
        rememberedPresentations.delete(oldestKey)
    }
    persistRememberedPresentations()
    return sanitizedCandidate
}
