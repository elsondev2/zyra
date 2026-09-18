import { useCallback, useEffect, useRef, useState } from 'react'
import type { DelegationPreferencesUpdate, DelegationSettingsSnapshot } from '@shared/onboarding/contracts'
import { isElectronRendererRuntime } from '@/lib/browser-file-url'
import { SettingsButton, SettingsDialog, SettingsNotice, SettingsRow, SettingsSection, SettingsSegmented, SettingsTextarea } from './settings-layout'

export function DelegationPreferences() {
    const [snapshot, setSnapshot] = useState<DelegationSettingsSnapshot | null>(null)
    const [loading, setLoading] = useState(true)
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState('')
    const [editing, setEditing] = useState(false)
    const [draft, setDraft] = useState('')
    const mounted = useRef(false)
    const requestId = useRef(0)
    const desktop = isElectronRendererRuntime()
    const load = useCallback(async () => {
        const id = ++requestId.current
        setLoading(true); setError('')
        try {
            const api = window.devscope.onboarding
            if (typeof api.getDelegationPreferences !== 'function') throw Error('Restart Zyra Desktop to load delegation preferences.')
            const result = await api.getDelegationPreferences()
            if (!result.success) throw Error(result.error)
            if (mounted.current && id === requestId.current) setSnapshot(result)
        } catch (cause) {
            if (mounted.current && id === requestId.current) setError(cause instanceof Error ? cause.message : 'Could not load delegation preferences.')
        } finally { if (mounted.current && id === requestId.current) setLoading(false) }
    }, [])
    useEffect(() => {
        mounted.current = true
        if (desktop) void load()
        else setLoading(false)
        return () => { mounted.current = false; requestId.current += 1 }
    }, [desktop, load])
    const save = async (patch: DelegationPreferencesUpdate) => {
        if (busy) return
        const id = ++requestId.current
        setBusy(true); setError('')
        try {
            const result = await window.devscope.onboarding.saveDelegationPreferences(patch)
            if (!result.success) throw Error(result.error)
            if (mounted.current && id === requestId.current) { setSnapshot(result); setEditing(false) }
        } catch (cause) {
            if (mounted.current && id === requestId.current) setError(cause instanceof Error ? cause.message : 'Could not save delegation preferences.')
        } finally { if (mounted.current && id === requestId.current) setBusy(false) }
    }
    const selected = snapshot?.presets.find(preset => preset.id === snapshot.preferences.preset)
    return <SettingsSection title="Delegated work">
        {!desktop ? <SettingsNotice>Manage delegation preferences in Zyra Desktop.</SettingsNotice> : <>
            {loading && !snapshot ? <SettingsNotice>Loading delegation preferences…</SettingsNotice> : null}
            {error ? <SettingsNotice tone="error">{error}{!editing ? <SettingsButton variant="ghost" disabled={busy || loading} onClick={() => void load()}>Retry</SettingsButton> : null}</SettingsNotice> : null}
            {snapshot ? <>
                <SettingsRow title="Approach" description={selected?.description || 'Choose how Zyra delegates work.'}
                    info="The main agent chooses models and reasoning effort using an on-demand shortlist. Estimated API cost is the common comparison; actual spending and subscription limits remain separate."
                    control={<SettingsSegmented value={snapshot.preferences.preset} options={snapshot.presets.map(preset => ({ value: preset.id, label: preset.label }))} disabled={busy || loading} onChange={preset => void save({ preset })} label="Delegation approach" />} />
                <SettingsRow title="Your guidance" description="Add preferences for when Zyra delegates work."
                    info="Applies to future model choices without adding a full pricing catalog to the conversation; fixed agent definitions and existing permissions still apply."
                    status={snapshot.preferences.notes ? 'Custom' : undefined}
                    control={<SettingsButton disabled={busy || loading} onClick={() => { setDraft(snapshot.preferences.notes); setEditing(true) }}>Edit</SettingsButton>} />
            </> : null}
        </>}
        <SettingsDialog open={editing} title="Delegation guidance" description="Refine the selected approach without assigning models by role."
            onClose={() => { if (!busy) setEditing(false) }}
            footer={<><SettingsButton variant="ghost" disabled={busy} onClick={() => setEditing(false)}>Cancel</SettingsButton><SettingsButton variant="accent" disabled={busy} onClick={() => void save({ notes: draft })}>{busy ? 'Saving…' : 'Save guidance'}</SettingsButton></>}>
            {error ? <SettingsNotice tone="error">{error}</SettingsNotice> : null}
            <SettingsTextarea autoFocus rows={7} maxLength={4000} value={draft} disabled={busy} onChange={event => setDraft(event.target.value)} aria-label="Delegation guidance" placeholder="Keep routine searches economical; use stronger models for architecture and security reviews." />
            <div className="text-right text-[10px] tabular-nums text-[var(--settings-text-muted)]">{draft.length.toLocaleString()} / 4,000</div>
        </SettingsDialog>
    </SettingsSection>
}
