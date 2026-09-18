import { useCallback, useEffect, useState } from 'react'
import type { AgentRoleModels as RoleModels } from '@shared/onboarding/contracts'
import type { AssistantModelInfo } from '@shared/assistant/contracts'
import { providerFeatures } from '@shared/assistant/provider-features'
import { loadSettingsModels } from './settings-model-catalog-cache'
import { SettingsButton, SettingsNotice, SettingsRow, SettingsSection, SettingsSelect } from './settings-layout'

const roles = { planner: 'Planning', implementer: 'Implementation', reviewer: 'Review', debugger: 'Debugging', verifier: 'Verification', researcher: 'Research', specialist: 'Other agents' } as const

export function AgentRoleModels() {
    const [models, setModels] = useState<AssistantModelInfo[]>([])
    const [preferences, setPreferences] = useState<RoleModels>({})
    const [provider, setProvider] = useState('')
    const [busy, setBusy] = useState(false)
    const [loading, setLoading] = useState(true)
    const [revision, setRevision] = useState(0)
    const [error, setError] = useState('')
    useEffect(() => {
        let live = true
        setLoading(true); setError('')
        void Promise.all([loadSettingsModels(), window.devscope.onboarding.getAgentRoleModels()]).then(([nextModels, result]) => {
            if (!live) return
            if (!result.success) throw new Error(result.error)
            setModels(nextModels)
            setPreferences(result.models)
            const available = [...new Set([...nextModels.map(model => model.id.split('/')[0]), ...Object.keys(result.models)])]
            setProvider(current => available.includes(current) ? current : available[0] || '')
        }).catch(cause => { if (live) setError(cause instanceof Error ? cause.message : 'Could not load agent models.') })
            .finally(() => { if (live) setLoading(false) })
        return () => { live = false }
    }, [revision])
    const providers = [...new Set([...models.map(model => model.id.split('/')[0]), ...Object.keys(preferences)])]
    const save = useCallback(async (role: string, model: string) => {
        if (busy) return
        setBusy(true); setError('')
        try {
            const result = await window.devscope.onboarding.setAgentRoleModel({ provider, role, model })
            if (!result.success) throw new Error(result.error)
            setPreferences(result.models)
        } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not save agent model.') }
        finally { setBusy(false) }
    }, [busy, provider])
    return <SettingsSection title="Delegated work">
        <details>
            <summary className="cursor-pointer px-4 py-3.5 text-[13px] font-medium text-[var(--settings-text)]">Models by agent role</summary>
            <p className="px-4 pb-3 text-[12px] leading-5 text-[var(--settings-text-secondary)]">Applies to the next agent launched from a chat using the selected provider.</p>
            {error ? <SettingsNotice tone="error">{error}<SettingsButton variant="ghost" disabled={loading || busy} onClick={() => setRevision(value => value + 1)}>Retry</SettingsButton></SettingsNotice> : null}
            {loading ? <SettingsNotice>Loading agent models…</SettingsNotice> : providers.length ? <>
                <SettingsRow title="Provider" description="Explicit models in saved agent definitions still take precedence."
                    control={<SettingsSelect aria-label="Agent model provider" value={provider} disabled={busy} onChange={event => setProvider(event.target.value)}>{providers.map(id => <option key={id} value={id}>{id.startsWith('custom-') ? id.slice(7) : providerFeatures(id).label}</option>)}</SettingsSelect>} />
                {Object.entries(roles).map(([role, label]) => {
                    const selected = preferences[provider]?.[role as keyof typeof roles] || 'inherit'
                    const choices = models.filter(model => model.id.startsWith(`${provider}/`))
                    return <SettingsRow key={role} title={label} description={null}
                        control={<SettingsSelect aria-label={`${label} model`} value={selected} disabled={busy} className="sm:w-64" onChange={event => void save(role, event.target.value)}>
                            <option value="inherit">Same as the chat</option>
                            {selected !== 'inherit' && !choices.some(model => model.id === selected) ? <option value={selected}>{selected} (unavailable)</option> : null}
                            {choices.map(model => <option key={model.id} value={model.id}>{model.label || model.id}</option>)}
                        </SettingsSelect>} />
                })}
            </> : !error ? <SettingsNotice>Connect a provider to choose agent models.</SettingsNotice> : null}
        </details>
    </SettingsSection>
}
