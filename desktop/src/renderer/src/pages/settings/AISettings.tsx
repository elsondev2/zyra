import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, GitBranch, Sparkles, Trash2 } from 'lucide-react'
import { useSettings, type CommitAIProvider } from '@/lib/settings'
import {
    CodexProviderModal,
    KeyProviderModal,
    ProviderOverviewCard,
    type StatusPillTone
} from './ai-settings/AISettingsCards'
import { PROVIDER_MODELS, type ProviderStatus } from './ai-settings/aiSettingsConfig'
import { useCodexModelOptions } from './ai-settings/useCodexModelOptions'

const PROVIDERS: CommitAIProvider[] = ['groq', 'gemini', 'codex']

const PROVIDER_COPY: Record<
    CommitAIProvider,
    {
        title: string
        description: string
        accessMode: string
        keyHint?: string
        keyPlaceholder?: string
        docsUrl?: string
    }
> = {
    groq: {
        title: 'Groq',
        description: 'Fast hosted inference',
        accessMode: 'Hosted API',
        keyHint: 'gsk_*',
        keyPlaceholder: 'gsk_xxxxxxxxxxxx...',
        docsUrl: 'https://console.groq.com/keys'
    },
    gemini: {
        title: 'Google Gemini',
        description: 'Gemini API',
        accessMode: 'Hosted API',
        keyHint: 'AIza*',
        keyPlaceholder: 'AIzaSyxxxxxxxxxxxx...',
        docsUrl: 'https://aistudio.google.com/app/apikey'
    },
    codex: {
        title: 'Codex',
        description: 'Local Codex CLI',
        accessMode: 'Local CLI'
    }
}

export default function AISettings() {
    const { settings, updateSettings } = useSettings()
    const [activeModal, setActiveModal] = useState<CommitAIProvider | null>(null)
    const [testStatus, setTestStatus] = useState<Record<CommitAIProvider, ProviderStatus>>({
        groq: 'idle',
        gemini: 'idle',
        codex: 'idle'
    })
    const [testError, setTestError] = useState<Record<CommitAIProvider, string>>({
        groq: '',
        gemini: '',
        codex: ''
    })

    const { codexModelsError, resolvedCodexModelOptions } = useCodexModelOptions([
        settings.gitCommitCodexModel,
        settings.gitPullRequestCodexModel,
        settings.assistantDefaultModel
    ])

    const activeProvider = settings.commitAIProvider
    const hasAnyKey = Boolean(settings.groqApiKey || settings.geminiApiKey)

    const setProvider = (provider: CommitAIProvider) => {
        updateSettings({ commitAIProvider: provider })
    }

    const saveProviderKey = (provider: Exclude<CommitAIProvider, 'codex'>, value: string) => {
        updateSettings(provider === 'groq' ? { groqApiKey: value } : { geminiApiKey: value })
        resetProviderTest(provider)
        setActiveModal(null)
    }

    const saveCodexModels = (commitModel: string, pullRequestModel: string) => {
        updateSettings({
            gitCommitCodexModel: commitModel,
            gitPullRequestCodexModel: pullRequestModel
        })
        resetProviderTest('codex')
        setActiveModal(null)
    }

    const handleTestConnection = async (
        provider: CommitAIProvider,
        overrides?: {
            apiKey?: string
            commitModel?: string
            pullRequestModel?: string
        }
    ) => {
        const apiKey = provider === 'groq'
            ? overrides?.apiKey ?? settings.groqApiKey
            : provider === 'gemini'
                ? overrides?.apiKey ?? settings.geminiApiKey
                : ''

        if (provider !== 'codex' && !String(apiKey || '').trim()) {
            setTestStatus((prev) => ({ ...prev, [provider]: 'error' }))
            setTestError((prev) => ({ ...prev, [provider]: 'Enter an API key first.' }))
            return
        }

        setTestStatus((prev) => ({ ...prev, [provider]: 'testing' }))
        setTestError((prev) => ({ ...prev, [provider]: '' }))

        try {
            const result = provider === 'groq'
                ? await window.devscope.testGroqConnection(String(apiKey).trim())
                : provider === 'gemini'
                    ? await window.devscope.testGeminiConnection(String(apiKey).trim())
                    : await window.devscope.testCodexConnection(
                        overrides?.commitModel
                        || overrides?.pullRequestModel
                        || settings.gitCommitCodexModel
                        || settings.gitPullRequestCodexModel
                        || settings.assistantDefaultModel
                        || undefined
                    )

            if (result.success) {
                setTestStatus((prev) => ({ ...prev, [provider]: 'success' }))
                setTestError((prev) => ({ ...prev, [provider]: '' }))
            } else {
                setTestStatus((prev) => ({ ...prev, [provider]: 'error' }))
                setTestError((prev) => ({ ...prev, [provider]: result.error || 'Connection failed.' }))
            }
        } catch (error) {
            setTestStatus((prev) => ({ ...prev, [provider]: 'error' }))
            setTestError((prev) => ({
                ...prev,
                [provider]: error instanceof Error ? error.message : 'Connection failed.'
            }))
        }
    }

    const resetProviderTest = (provider: CommitAIProvider) => {
        setTestStatus((prev) => ({ ...prev, [provider]: 'idle' }))
        setTestError((prev) => ({ ...prev, [provider]: '' }))
    }

    return (
        <div className="animate-fadeIn">
            <div className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="flex items-center gap-3">
                    <div className="rounded-xl bg-violet-500/10 p-2.5">
                        <Sparkles className="text-violet-300" size={22} />
                    </div>
                    <div>
                        <h1 className="text-2xl font-semibold text-sparkle-text">Git AI</h1>
                        <p className="mt-1 text-sm text-sparkle-text-secondary">Commit messages and PR drafts.</p>
                    </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                    <Link
                        to="/settings"
                        className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-sparkle-card px-4 py-2 text-sm text-sparkle-text transition-colors hover:border-white/18 hover:bg-white/[0.04]"
                    >
                        <ArrowLeft size={16} />
                        <span>Back to Settings</span>
                    </Link>
                </div>
            </div>

            <section className="rounded-xl border border-white/10 bg-sparkle-card p-5">
                <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <h2 className="text-sm font-semibold text-sparkle-text">Default Git AI Provider</h2>
                        <p className="mt-1 text-sm text-sparkle-text-secondary">Choose what Git uses.</p>
                    </div>
                    {settings.betaSettingsEnabled ? (
                        <Link
                            to="/settings/git"
                            className="inline-flex items-center gap-2 rounded-lg border border-transparent bg-white/[0.04] px-3 py-1.5 text-sm text-sparkle-text transition-colors hover:bg-white/[0.07]"
                        >
                            <GitBranch size={15} />
                            <span>Git settings</span>
                        </Link>
                    ) : null}
                </div>

                <div className="grid grid-cols-1 gap-3 xl:grid-cols-3" role="radiogroup" aria-label="Default Git AI provider">
                {PROVIDERS.map((provider) => {
                    const copy = PROVIDER_COPY[provider]
                    const connection = getProviderConnectionState(provider, settings, testStatus[provider])
                    const tags = dedupeTags([
                        provider === activeProvider ? { label: 'Active', tone: 'success' as const } : null,
                        { label: connection.label, tone: connection.tone },
                        { label: copy.accessMode, tone: 'neutral' as const }
                    ])

                    return (
                        <ProviderOverviewCard
                            key={provider}
                            provider={provider}
                            title={copy.title}
                            description={copy.description}
                            active={provider === activeProvider}
                            tags={tags}
                            details={getProviderDetails(provider, settings)}
                            message={testStatus[provider] === 'error' && testError[provider]
                                ? { tone: 'danger', text: testError[provider] }
                                : undefined}
                            onUse={provider === activeProvider ? undefined : () => setProvider(provider)}
                            onConfigure={() => setActiveModal(provider)}
                        />
                    )
                })}
                </div>
            </section>

            {hasAnyKey ? (
                <div className="mt-4 flex justify-end">
                    <button
                        type="button"
                        onClick={() => {
                            updateSettings({ groqApiKey: '', geminiApiKey: '' })
                            resetProviderTest('groq')
                            resetProviderTest('gemini')
                        }}
                        className="inline-flex items-center gap-2 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-2 text-sm text-red-300 transition-colors hover:border-red-500/30 hover:bg-red-500/14"
                    >
                        <Trash2 size={14} />
                        <span>Clear API keys</span>
                    </button>
                </div>
            ) : null}

            <KeyProviderModal
                open={activeModal === 'groq'}
                provider="groq"
                title={PROVIDER_COPY.groq.title}
                description="Save a Groq key."
                value={settings.groqApiKey}
                placeholder={PROVIDER_COPY.groq.keyPlaceholder || ''}
                keyHint={PROVIDER_COPY.groq.keyHint || ''}
                docsUrl={PROVIDER_COPY.groq.docsUrl || ''}
                status={testStatus.groq}
                error={testError.groq}
                onClose={() => setActiveModal(null)}
                onSave={(value) => saveProviderKey('groq', value)}
                onTest={(value) => void handleTestConnection('groq', { apiKey: value })}
            />

            <KeyProviderModal
                open={activeModal === 'gemini'}
                provider="gemini"
                title={PROVIDER_COPY.gemini.title}
                description="Save a Gemini key."
                value={settings.geminiApiKey}
                placeholder={PROVIDER_COPY.gemini.keyPlaceholder || ''}
                keyHint={PROVIDER_COPY.gemini.keyHint || ''}
                docsUrl={PROVIDER_COPY.gemini.docsUrl || ''}
                status={testStatus.gemini}
                error={testError.gemini}
                onClose={() => setActiveModal(null)}
                onSave={(value) => saveProviderKey('gemini', value)}
                onTest={(value) => void handleTestConnection('gemini', { apiKey: value })}
            />

            <CodexProviderModal
                open={activeModal === 'codex'}
                commitModel={settings.gitCommitCodexModel}
                pullRequestModel={settings.gitPullRequestCodexModel}
                modelOptions={resolvedCodexModelOptions}
                modelsError={codexModelsError}
                status={testStatus.codex}
                error={testError.codex}
                onClose={() => setActiveModal(null)}
                onSave={(commitModel, pullRequestModel) => saveCodexModels(commitModel, pullRequestModel)}
                onTest={(commitModel, pullRequestModel) => void handleTestConnection('codex', { commitModel, pullRequestModel })}
            />
        </div>
    )
}

function dedupeTags(
    tags: Array<{ label: string; tone: StatusPillTone } | null>
): Array<{ label: string; tone: StatusPillTone }> {
    const seen = new Set<string>()
    const result: Array<{ label: string; tone: StatusPillTone }> = []
    for (const tag of tags) {
        if (!tag) continue
        const key = tag.label.trim().toLowerCase()
        if (!key || seen.has(key)) continue
        seen.add(key)
        result.push(tag)
    }
    return result
}

function getProviderConnectionState(
    provider: CommitAIProvider,
    settings: ReturnType<typeof useSettings>['settings'],
    status: ProviderStatus
): { label: string; tone: StatusPillTone } {
    if (status === 'success') return { label: 'Connected', tone: 'success' }
    if (status === 'testing') return { label: 'Testing', tone: 'accent' }
    if (status === 'error') return { label: provider === 'codex' ? 'Unavailable' : 'Failed test', tone: 'danger' }
    if (provider === 'codex') return { label: 'Local CLI', tone: 'neutral' }
    const hasKey = provider === 'groq' ? Boolean(settings.groqApiKey) : Boolean(settings.geminiApiKey)
    return hasKey ? { label: 'Key saved', tone: 'neutral' } : { label: 'No key', tone: 'danger' }
}

function getProviderDetails(
    provider: CommitAIProvider,
    settings: ReturnType<typeof useSettings>['settings']
): Array<{ label: string; value: string }> {
    if (provider === 'codex') {
        return [
            { label: 'Commit', value: settings.gitCommitCodexModel || 'Default' },
            { label: 'PR', value: settings.gitPullRequestCodexModel || 'Default' }
        ]
    }

    const hasKey = provider === 'groq' ? Boolean(settings.groqApiKey) : Boolean(settings.geminiApiKey)
    return [
        { label: 'Model', value: PROVIDER_MODELS[provider] },
        { label: 'Saved key', value: hasKey ? 'Present' : 'Missing' }
    ]
}
