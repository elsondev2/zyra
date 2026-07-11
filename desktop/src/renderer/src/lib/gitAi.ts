import type { CommitAIProvider, Settings } from './settings'

export type GitTextPurpose = 'commit' | 'pull-request'

export type ResolvedGitTextProvider = {
    provider: CommitAIProvider
    apiKey?: string
    model?: string
}

function readProviderApiKey(settings: Settings, provider: Exclude<CommitAIProvider, 'codex'>) {
    return provider === 'groq'
        ? String(settings.groqApiKey || '').trim()
        : String(settings.geminiApiKey || '').trim()
}

function resolveCodexModel(settings: Settings, purpose: GitTextPurpose): string {
    const preferred = purpose === 'pull-request'
        ? settings.gitPullRequestCodexModel
        : settings.gitCommitCodexModel
    const fallback = purpose === 'pull-request'
        ? settings.gitCommitCodexModel
        : settings.gitPullRequestCodexModel

    return String(preferred || fallback || settings.assistantDefaultModel || '').trim()
}

function buildResolvedProvider(settings: Settings, provider: CommitAIProvider, purpose: GitTextPurpose): ResolvedGitTextProvider | null {
    if (provider === 'codex') {
        const model = resolveCodexModel(settings, purpose)
        return {
            provider,
            ...(model ? { model } : {})
        }
    }

    const apiKey = readProviderApiKey(settings, provider)
    if (!apiKey) return null
    return { provider, apiKey }
}

export function resolvePreferredGitTextProvider(
    settings: Settings,
    purpose: GitTextPurpose = 'commit'
): ResolvedGitTextProvider | null {
    const preferred = buildResolvedProvider(settings, settings.commitAIProvider, purpose)
    if (preferred) return preferred

    for (const provider of ['groq', 'gemini'] as Exclude<CommitAIProvider, 'codex'>[]) {
        if (provider === settings.commitAIProvider) continue
        const candidate = buildResolvedProvider(settings, provider, purpose)
        if (candidate) return candidate
    }

    return null
}

export function formatGitTextProviderLabel(provider: CommitAIProvider) {
    if (provider === 'groq') return 'Groq'
    if (provider === 'gemini') return 'Gemini'
    return 'Codex'
}
