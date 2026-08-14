import { useEffect, useMemo, useState } from 'react'
import { RefreshCw, Trash2 } from 'lucide-react'
import { useSettings, type CommitAIProvider } from '@/lib/settings'
import { useCodexModelOptions } from './ai-settings/useCodexModelOptions'
import {
    SettingsButton,
    SettingsDialog,
    SettingsInput,
    SettingsNotice,
    SettingsPageContainer,
    SettingsRow,
    SettingsSection,
    SettingsSelect
} from './settings-layout'

type ProviderStatus = 'idle' | 'testing' | 'success' | 'error'

export default function AISettings() {
    const { settings, updateSettings } = useSettings()
    const [groqDraft, setGroqDraft] = useState(settings.groqApiKey)
    const [geminiDraft, setGeminiDraft] = useState(settings.geminiApiKey)
    const [editingProvider, setEditingProvider] = useState<Exclude<CommitAIProvider, 'codex'> | null>(null)
    const [status, setStatus] = useState<Record<CommitAIProvider, ProviderStatus>>({ groq: 'idle', gemini: 'idle', codex: 'idle' })
    const [errors, setErrors] = useState<Record<CommitAIProvider, string>>({ groq: '', gemini: '', codex: '' })
    const { codexModelsError, resolvedCodexModelOptions } = useCodexModelOptions([settings.gitCommitCodexModel, settings.gitPullRequestCodexModel, settings.assistantDefaultModel])

    useEffect(() => setGroqDraft(settings.groqApiKey), [settings.groqApiKey])
    useEffect(() => setGeminiDraft(settings.geminiApiKey), [settings.geminiApiKey])

    const modelOptions = useMemo(() => resolvedCodexModelOptions.map((option) => ({ id: option.id, label: option.label || option.id })), [resolvedCodexModelOptions])

    const testProvider = async (provider: CommitAIProvider) => {
        setStatus((current) => ({ ...current, [provider]: 'testing' }))
        setErrors((current) => ({ ...current, [provider]: '' }))
        try {
            const result = provider === 'groq'
                ? await window.devscope.testGroqConnection(groqDraft.trim())
                : provider === 'gemini'
                    ? await window.devscope.testGeminiConnection(geminiDraft.trim())
                    : await window.devscope.testCodexConnection(settings.gitCommitCodexModel || settings.gitPullRequestCodexModel || settings.assistantDefaultModel || undefined)
            if (!result.success) throw new Error(result.error || 'Connection test failed.')
            setStatus((current) => ({ ...current, [provider]: 'success' }))
        } catch (error) {
            setStatus((current) => ({ ...current, [provider]: 'error' }))
            setErrors((current) => ({ ...current, [provider]: error instanceof Error ? error.message : 'Connection test failed.' }))
        }
    }

    const providerStatus = (provider: CommitAIProvider) => {
        if (status[provider] === 'testing') return 'Testing…'
        if (status[provider] === 'success') return 'Connection verified'
        if (status[provider] === 'error') return 'Unavailable'
        if (provider === 'codex') return 'Uses the local Codex CLI'
        return (provider === 'groq' ? settings.groqApiKey : settings.geminiApiKey) ? 'API key saved locally' : 'No API key saved'
    }

    const providerStatusTone = (provider: CommitAIProvider): 'ready' | 'warning' | 'danger' | 'info' | 'muted' => {
        if (status[provider] === 'testing') return 'info'
        if (status[provider] === 'success') return 'ready'
        if (status[provider] === 'error') return 'danger'
        if (provider === 'codex') return 'muted'
        return (provider === 'groq' ? settings.groqApiKey : settings.geminiApiKey) ? 'ready' : 'warning'
    }

    return (
        <SettingsPageContainer>
            <SettingsSection title="Providers">
                <SettingsRow
                    title="Default Git AI provider"
                    description="Provider used for generated commit messages and pull-request drafts."
                    control={<SettingsSelect value={settings.commitAIProvider} onChange={(event) => updateSettings({ commitAIProvider: event.target.value as CommitAIProvider })} aria-label="Default Git AI provider"><option value="groq">Groq</option><option value="gemini">Google Gemini</option><option value="codex">Codex CLI</option></SettingsSelect>}
                />
            </SettingsSection>

            <SettingsSection title="Groq">
                <SettingsRow
                    title="API key"
                    description="Hosted Groq API credential used only for Git text generation."
                    status={providerStatus('groq')}
                    statusTone={providerStatusTone('groq')}
                    statusTitle={status.groq === 'error' ? errors.groq : undefined}
                    control={<SettingsButton onClick={() => setEditingProvider('groq')}>{settings.groqApiKey ? 'Edit key' : 'Add key'}</SettingsButton>}
                />
            </SettingsSection>

            <SettingsSection title="Google Gemini">
                <SettingsRow
                    title="API key"
                    description="Google AI Studio credential used only for Git text generation."
                    status={providerStatus('gemini')}
                    statusTone={providerStatusTone('gemini')}
                    statusTitle={status.gemini === 'error' ? errors.gemini : undefined}
                    control={<SettingsButton onClick={() => setEditingProvider('gemini')}>{settings.geminiApiKey ? 'Edit key' : 'Add key'}</SettingsButton>}
                />
            </SettingsSection>

            <SettingsSection title="Codex CLI" headerAction={<SettingsButton variant="ghost" onClick={() => void testProvider('codex')} disabled={status.codex === 'testing'}>{status.codex === 'testing' ? <RefreshCw size={12} className="animate-spin" /> : null}Test connection</SettingsButton>}>
                <SettingsRow title="Commit model" description="Codex model used for generated commit messages." status={providerStatus('codex')} statusTone={providerStatusTone('codex')} statusTitle={status.codex === 'error' ? errors.codex : undefined} control={<SettingsSelect value={settings.gitCommitCodexModel} onChange={(event) => updateSettings({ gitCommitCodexModel: event.target.value })} aria-label="Codex commit model"><option value="">Default model</option>{modelOptions.map((model) => <option key={model.id} value={model.id}>{model.label}</option>)}</SettingsSelect>} />
                <SettingsRow title="Pull-request model" description="Codex model used for generated PR titles and bodies." control={<SettingsSelect value={settings.gitPullRequestCodexModel} onChange={(event) => updateSettings({ gitPullRequestCodexModel: event.target.value })} aria-label="Codex pull-request model"><option value="">Default model</option>{modelOptions.map((model) => <option key={model.id} value={model.id}>{model.label}</option>)}</SettingsSelect>} />
                {codexModelsError ? <SettingsNotice tone="error">{codexModelsError}</SettingsNotice> : null}
            </SettingsSection>

            <SettingsSection title="Stored credentials">
                <SettingsRow title="Clear hosted API keys" description="Remove the saved Groq and Gemini keys from local settings." control={<SettingsButton variant="danger" disabled={!settings.groqApiKey && !settings.geminiApiKey} onClick={() => { updateSettings({ groqApiKey: '', geminiApiKey: '' }); setGroqDraft(''); setGeminiDraft('') }}><Trash2 size={12} />Clear keys</SettingsButton>} />
            </SettingsSection>

            <SettingsDialog
                open={editingProvider !== null}
                title={`Configure ${editingProvider === 'gemini' ? 'Google Gemini' : 'Groq'}`}
                description="The credential is hidden on the Settings page and can be tested before saving."
                onClose={() => setEditingProvider(null)}
                footer={editingProvider ? (
                    <>
                        <SettingsButton variant="ghost" onClick={() => setEditingProvider(null)}>Cancel</SettingsButton>
                        <SettingsButton onClick={() => void testProvider(editingProvider)} disabled={!(editingProvider === 'groq' ? groqDraft : geminiDraft).trim() || status[editingProvider] === 'testing'}>
                            {status[editingProvider] === 'testing' ? <RefreshCw size={12} className="animate-spin" /> : null}Test
                        </SettingsButton>
                        <SettingsButton variant="accent" onClick={() => {
                            if (editingProvider === 'groq') updateSettings({ groqApiKey: groqDraft.trim() })
                            else updateSettings({ geminiApiKey: geminiDraft.trim() })
                            setEditingProvider(null)
                        }}>Save key</SettingsButton>
                    </>
                ) : null}
            >
                {editingProvider ? (
                    <>
                        <label htmlFor="provider-api-key" className="text-[12px] font-medium text-[var(--settings-text)]">API key</label>
                        <SettingsInput
                            id="provider-api-key"
                            autoFocus
                            type="password"
                            value={editingProvider === 'groq' ? groqDraft : geminiDraft}
                            onChange={(event) => editingProvider === 'groq' ? setGroqDraft(event.target.value) : setGeminiDraft(event.target.value)}
                            placeholder={editingProvider === 'groq' ? 'gsk_…' : 'AIza…'}
                            className="sm:w-full"
                        />
                        <div className="text-[11px] text-[var(--settings-text-muted)]">{providerStatus(editingProvider)}</div>
                    </>
                ) : null}
            </SettingsDialog>
        </SettingsPageContainer>
    )
}
