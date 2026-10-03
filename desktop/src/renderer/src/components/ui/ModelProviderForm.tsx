import { providerFeatures } from '@shared/assistant/provider-features'
import { useEffect, useState } from 'react'
import type { ModelProviderInput, ModelProviderConnection } from '@shared/onboarding/contracts'
import { useSettings } from '@/lib/settings'
import { SettingsButton, SettingsInput, SettingsSelect } from '@/pages/settings/settings-layout'

const field = 'sm:w-full'

export function ModelProviderForm({ onConnected, onBusyChange, onReadyChange, initialProvider = 'opencode', lockProvider = false, formId }: {
    onConnected?: (connection: ModelProviderConnection) => void | Promise<void>
    onBusyChange?: (busy: boolean) => void
    onReadyChange?: (ready: boolean) => void
    initialProvider?: ModelProviderInput['provider']
    lockProvider?: boolean
    formId?: string
}) {
    const { updateSettings } = useSettings()
    const [provider, setProvider] = useState<ModelProviderInput['provider']>(initialProvider)
    const [apiKey, setApiKey] = useState('')
    const [name, setName] = useState('')
    const [baseUrl, setBaseUrl] = useState('')
    const [model, setModel] = useState('')
    const [api, setApi] = useState<ModelProviderInput['api']>('openai-completions')
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState('')
    const [success, setSuccess] = useState('')

    useEffect(() => {
        onReadyChange?.(Boolean(apiKey.trim()) && (provider !== 'custom' || Boolean(name.trim() && baseUrl.trim())))
    }, [apiKey, baseUrl, name, onReadyChange, provider])

    async function connect() {
        if (busy) return
        setBusy(true); onBusyChange?.(true); setError(''); setSuccess('')
        try {
            const result = await window.devscope.onboarding.connectModelProvider({ provider, apiKey, name, baseUrl, model, api })
            if (!result.success) throw new Error(result.error)
            setApiKey('')
            updateSettings({ assistantDefaultModel: result.connection.model })
            setSuccess(`${result.connection.label} connected`)
            await onConnected?.(result.connection)
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : 'Could not connect this provider.')
        } finally {
            setBusy(false); onBusyChange?.(false)
        }
    }

    const changeProvider = (nextProvider: ModelProviderInput['provider']) => {
        setProvider(nextProvider)
        setApiKey('')
        setModel('')
        setError('')
        setSuccess('')
    }
    return <form id={formId} className="space-y-3 text-left" onSubmit={event => { event.preventDefault(); void connect() }}>
        {!lockProvider ? <label className="block text-[12px] text-sparkle-text-secondary">Provider
            <SettingsSelect className={`${field} mt-2`} value={provider} disabled={busy} onChange={event => changeProvider(event.target.value as ModelProviderInput['provider'])}>
                {(['opencode', 'anthropic', 'custom'] as const).map(id => <option key={id} value={id}>{providerFeatures(id).label}</option>)}
            </SettingsSelect>
        </label> : null}
        {provider === 'custom' ? <>
            <SettingsInput className={field} aria-label="Provider name" placeholder="Provider name" value={name} disabled={busy} onChange={event => setName(event.target.value)} required />
            <SettingsInput className={field} aria-label="API base URL" placeholder="https://your-provider.com/v1" value={baseUrl} disabled={busy} onChange={event => setBaseUrl(event.target.value)} required />
            <SettingsSelect className={field} aria-label="API format" value={api} disabled={busy} onChange={event => setApi(event.target.value as ModelProviderInput['api'])}>
                <option value="openai-completions">Chat Completions</option><option value="openai-responses">Responses</option><option value="anthropic-messages">Anthropic Messages</option>
            </SettingsSelect>
        </> : null}
        <SettingsInput className={`${field} placeholder:text-sparkle-text-secondary`} type="password" aria-label={`${provider === 'anthropic' ? 'Claude' : provider === 'opencode' ? 'Zen' : 'Provider'} API key`} placeholder="API key" autoComplete="off" spellCheck={false} value={apiKey} disabled={busy} onChange={event => setApiKey(event.target.value)} required />
        <SettingsInput className={`${field} placeholder:text-sparkle-text-secondary`} aria-label="Model ID" placeholder={providerFeatures(provider).modelDiscovery === 'endpoint' ? 'Model ID (optional, detected when available)' : 'Model ID'} value={model} disabled={busy} onChange={event => setModel(event.target.value)} />
        {!formId ? <SettingsButton type="submit" variant="accent" className="w-full" disabled={busy || !apiKey.trim()}>{busy ? 'Connecting…' : 'Connect provider'}</SettingsButton> : null}
        {error || success ? <p role={error ? 'alert' : 'status'} className={`text-[12px] leading-5 ${error ? 'text-[var(--status-danger)]' : 'text-[var(--status-success)]'}`}>{error || success}</p> : null}
    </form>
}
