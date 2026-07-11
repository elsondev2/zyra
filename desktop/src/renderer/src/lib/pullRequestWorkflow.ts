import { resolvePreferredGitTextProvider } from './gitAi'
import type {
    CommitAIProvider,
    ProjectPullRequestConfig,
    PullRequestGuideConfig,
    PullRequestGuideSource,
    PullRequestChangeSource,
    Settings
} from './settings'

export function normalizeProjectPullRequestKey(projectPath: string): string {
    return String(projectPath || '').trim().replace(/\\/g, '/').toLowerCase()
}

export function getDefaultProjectPullRequestConfig(settings: Settings): ProjectPullRequestConfig {
    return {
        guideSource: settings.gitPullRequestDefaultGuideSource,
        guide: { ...settings.gitPullRequestGlobalGuide, text: '', filePath: '' },
        targetBranch: settings.gitPullRequestDefaultTargetBranch,
        draft: settings.gitPullRequestDefaultDraft,
        changeSource: settings.gitPullRequestDefaultChangeSource
    }
}

export function getProjectPullRequestConfig(settings: Settings, projectPath: string): ProjectPullRequestConfig {
    const key = normalizeProjectPullRequestKey(projectPath)
    const stored = settings.gitProjectPullRequestConfigs[key]
    return stored ? { ...stored, guide: { ...stored.guide } } : getDefaultProjectPullRequestConfig(settings)
}

export function mergeProjectPullRequestConfig(
    settings: Settings,
    projectPath: string,
    partial: Partial<ProjectPullRequestConfig>
): Record<string, ProjectPullRequestConfig> {
    const key = normalizeProjectPullRequestKey(projectPath)
    const previous = getProjectPullRequestConfig(settings, projectPath)
    return {
        ...settings.gitProjectPullRequestConfigs,
        [key]: {
            ...previous,
            ...partial,
            guide: {
                ...previous.guide,
                ...(partial.guide || {})
            }
        }
    }
}

export function resolvePreferredPullRequestProvider(settings: Settings): { provider: CommitAIProvider; apiKey?: string; model?: string } | null {
    return resolvePreferredGitTextProvider(settings, 'pull-request')
}

async function readGuideFile(filePath: string): Promise<string> {
    const normalized = String(filePath || '').trim()
    if (!normalized) return ''
    const result = await window.devscope.readTextFileFull(normalized)
    if (!result?.success) {
        throw new Error(result?.error || 'Failed to read guide file.')
    }
    return String(result.content || '').trim()
}

export async function resolvePullRequestGuideText(
    settings: Settings,
    projectPath: string,
    guideSource: PullRequestGuideSource,
    projectGuide: PullRequestGuideConfig
): Promise<string> {
    if (guideSource === 'none') {
        return ''
    }

    if (guideSource === 'project') {
        if (projectGuide.mode === 'file') {
            return await readGuideFile(projectGuide.filePath)
        }
        return String(projectGuide.text || '').trim()
    }

    if (guideSource === 'global') {
        const guide = settings.gitPullRequestGlobalGuide
        if (guide.mode === 'file') {
            return await readGuideFile(guide.filePath)
        }
        return String(guide.text || '').trim()
    }

    const templateCandidates = [
        `${projectPath}/.github/pull_request_template.md`,
        `${projectPath}/.github/PULL_REQUEST_TEMPLATE.md`,
        `${projectPath}/pull_request_template.md`,
        `${projectPath}/PULL_REQUEST_TEMPLATE.md`
    ]

    for (const candidate of templateCandidates) {
        const result = await window.devscope.readTextFileFull(candidate)
        if (result?.success && String(result.content || '').trim()) {
            return String(result.content || '').trim()
        }
    }

    return ''
}
