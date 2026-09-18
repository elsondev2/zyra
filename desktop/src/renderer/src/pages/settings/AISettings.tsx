import { useState } from 'react'
import { RefreshCw, Trash2 } from 'lucide-react'
import { ConfirmModal } from '@/components/ui/ConfirmModal'
import { useSettings, type CommitAIProvider } from '@/lib/settings'
import { isElectronRendererRuntime } from '@/lib/browser-file-url'
import { SettingsProviderIcon } from './SettingsProviderIcon'
import { createSettingsRowTargetId } from './settings-search'
import {
    SettingsButton,
    SettingsDialog,
    SettingsInput,
    SettingsNotice,
    SettingsPageContainer,
    SettingsRow,
    SettingsSection
} from './settings-layout'

type HostedProvider = Exclude<CommitAIProvider, 'codex'>
type ProviderStatus = 'idle' | 'testing' | 'saving' | 'success' | 'error'

export default function AISettings({ backTo = '/settings/providers', backLabel = 'Providers' }: { backTo?: string; backLabel?: string }) {
    const { settings, updateHostedAiSecrets } = useSettings()
    const desktopHost = isElectronRendererRuntime()
    const [groqDraft, setGroqDraft] = useState('')
    const [geminiDraft, setGeminiDraft] = useState('')
    const [editingProvider, setEditingProvider] = useState<HostedProvider | null>(null)
    const [clearKeysConfirmOpen, setClearKeysConfirmOpen] = useState(false)
    const [status, setStatus] = useState<Record<HostedProvider, ProviderStatus>>({ groq: 'idle', gemini: 'idle' })
    const [errors, setErrors] = useState<Record<HostedProvider, string>>({ groq: '', gemini: '' })

    const testProvider = async (provider: HostedProvider) => {
        setStatus((current) => ({ ...current, [provider]: 'testing' }))
        setErrors((current) => ({ ...current, [provider]: '' }))
        try {
            const result = provider === 'groq'
                ? await window.devscope.testGroqConnection(groqDraft.trim())
                : await window.devscope.testGeminiConnection(geminiDraft.trim())
            if (!result.success) throw new Error(result.error || 'Connection test failed.')
            setStatus((current) => ({ ...current, [provider]: 'success' }))
        } catch (error) {
            setStatus((current) => ({ ...current, [provider]: 'error' }))
            setErrors((current) => ({ ...current, [provider]: error instanceof Error ? error.message : 'Connection test failed.' }))
        }
    }

    const saveHostedKey = async (provider: HostedProvider) => {
        const key = (provider === 'groq' ? groqDraft : geminiDraft).trim()
        if (!key) return
        setStatus((current) => ({ ...current, [provider]: 'saving' }))
        setErrors((current) => ({ ...current, [provider]: '' }))
        try {
            await updateHostedAiSecrets(provider === 'groq' ? { groqApiKey: key } : { geminiApiKey: key })
            if (provider === 'groq') setGroqDraft('')
            else setGeminiDraft('')
            setStatus((current) => ({ ...current, [provider]: 'idle' }))
            setEditingProvider(null)
        } catch (error) {
            setStatus((current) => ({ ...current, [provider]: 'error' }))
            setErrors((current) => ({ ...current, [provider]: error instanceof Error ? error.message : 'Could not save the API key.' }))
        }
    }

    const clearHostedKeys = async () => {
        try {
            await updateHostedAiSecrets({ groqApiKey: '', geminiApiKey: '', confirmClear: true })
            setGroqDraft('')
            setGeminiDraft('')
            setStatus({ groq: 'idle', gemini: 'idle' })
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Could not clear hosted API keys.'
            setErrors((current) => ({ ...current, groq: message, gemini: message }))
            setStatus((current) => ({ ...current, groq: 'error', gemini: 'error' }))
        }
    }

    const providerStatus = (provider: HostedProvider, draft = false) => {
        if (!draft) {
            if (status[provider] === 'saving') return 'Saving…'
            return (provider === 'groq' ? settings.groqApiKeyConfigured : settings.geminiApiKeyConfigured) ? 'Key saved' : 'Not configured'
        }
        if (status[provider] === 'testing') return 'Testing…'
        if (status[provider] === 'saving') return 'Saving…'
        if (status[provider] === 'success') return 'Verified'
        if (status[provider] === 'error') return 'Needs attention'
        return 'Not checked'
    }

    const providerStatusTone = (provider: HostedProvider): 'ready' | 'info' | 'muted' => (
        status[provider] === 'saving' ? 'info' : (provider === 'groq' ? settings.groqApiKeyConfigured : settings.geminiApiKeyConfigured) ? 'ready' : 'muted'
    )

    const providerBusy = editingProvider !== null && (status[editingProvider] === 'testing' || status[editingProvider] === 'saving')
    const savingKey = editingProvider !== null && status[editingProvider] === 'saving'

    return (
        <SettingsPageContainer title="Git writing services" description="Provider credentials used for commit messages and pull requests." backTo={backTo} backLabel={backLabel} showSettingsBack>
            <SettingsSection title="Hosted providers">
                <SettingsRow
                    title="Groq"
                    description="API key for Git text generation with Groq."
                    icon={<SettingsProviderIcon provider="groq" />}
                    searchTargetId={createSettingsRowTargetId('Groq', 'API key')}
                    status={providerStatus('groq')}
                    statusTone={providerStatusTone('groq')}
                    statusTitle={editingProvider === 'groq' && status.groq === 'error' ? errors.groq : undefined}
                    control={desktopHost ? <SettingsButton onClick={() => { setGroqDraft(''); setEditingProvider('groq') }}>{settings.groqApiKeyConfigured ? 'Replace key' : 'Add key'}</SettingsButton> : <span className="text-xs text-sparkle-text-muted">Managed in Desktop</span>}
                />
                <SettingsRow
                    title="Google Gemini"
                    description="API key for Git text generation with Gemini."
                    icon={<SettingsProviderIcon provider="gemini" />}
                    searchTargetId={createSettingsRowTargetId('Google Gemini', 'API key')}
                    status={providerStatus('gemini')}
                    statusTone={providerStatusTone('gemini')}
                    statusTitle={editingProvider === 'gemini' && status.gemini === 'error' ? errors.gemini : undefined}
                    control={desktopHost ? <SettingsButton onClick={() => { setGeminiDraft(''); setEditingProvider('gemini') }}>{settings.geminiApiKeyConfigured ? 'Replace key' : 'Add key'}</SettingsButton> : <span className="text-xs text-sparkle-text-muted">Managed in Desktop</span>}
                />
            </SettingsSection>

            <SettingsSection title="Stored credentials">
                {desktopHost ? <SettingsRow title="Clear hosted API keys" description="Remove the OS-encrypted Groq and Gemini keys from this device." control={<SettingsButton variant="danger" disabled={!settings.groqApiKeyConfigured && !settings.geminiApiKeyConfigured} onClick={() => setClearKeysConfirmOpen(true)}><Trash2 size={12} />Clear keys</SettingsButton>} /> : <SettingsNotice tone="neutral">Open Zyra Desktop to add, replace, test, or remove hosted-provider API keys.</SettingsNotice>}
            </SettingsSection>

            <SettingsDialog
                open={editingProvider !== null}
                title={`Configure ${editingProvider === 'gemini' ? 'Google Gemini' : 'Groq'}`}
                description="Test the key if needed, then save it on this device."
                onClose={() => { if (savingKey) return; setGroqDraft(''); setGeminiDraft(''); setEditingProvider(null) }}
                footer={editingProvider ? (
                    <>
                        <SettingsButton variant="ghost" disabled={savingKey} onClick={() => { setGroqDraft(''); setGeminiDraft(''); setEditingProvider(null) }}>Cancel</SettingsButton>
                        <SettingsButton onClick={() => void testProvider(editingProvider)} disabled={!(editingProvider === 'groq' ? groqDraft : geminiDraft).trim() || providerBusy}>
                            {status[editingProvider] === 'testing' ? <RefreshCw size={12} className="animate-spin motion-reduce:animate-none" /> : null}Test
                        </SettingsButton>
                        <SettingsButton variant="accent" disabled={!(editingProvider === 'groq' ? groqDraft : geminiDraft).trim() || providerBusy} onClick={() => void saveHostedKey(editingProvider)}>{savingKey ? <RefreshCw size={12} className="animate-spin motion-reduce:animate-none" /> : null}{savingKey ? 'Saving…' : 'Save key'}</SettingsButton>
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
                            autoComplete="off"
                            spellCheck={false}
                            onChange={(event) => editingProvider === 'groq' ? setGroqDraft(event.target.value) : setGeminiDraft(event.target.value)}
                            placeholder={editingProvider === 'groq' ? 'gsk_…' : 'AIza…'}
                            className="sm:w-full"
                        />
                        {status[editingProvider] === 'error' ? <SettingsNotice tone="error">{errors[editingProvider]}</SettingsNotice> : <div className="text-[11px] text-[var(--settings-text-muted)]">{providerStatus(editingProvider, true)}</div>}
                    </>
                ) : null}
            </SettingsDialog>

            <ConfirmModal
                isOpen={clearKeysConfirmOpen}
                title="Clear hosted API keys?"
                message="Zyra will remove the OS-encrypted Groq and Gemini credentials from this device. Git text generation using those providers will require new keys."
                confirmLabel="Clear keys"
                variant="warning"
                onCancel={() => setClearKeysConfirmOpen(false)}
                onConfirm={() => {
                    setClearKeysConfirmOpen(false)
                    void clearHostedKeys()
                }}
            />
        </SettingsPageContainer>
    )
}
