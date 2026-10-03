import { useCallback, useEffect, useRef, useState } from 'react'
import type { HarnessDetection, ModelProviderConnection } from '@shared/onboarding/contracts'
import { useSettings } from '@/lib/settings'
import { SettingsButton, SettingsInput } from '../settings-layout'

const field = '!h-11 !min-w-0 !w-full !rounded-lg !px-3 !text-[13px] focus:ring-2 focus:ring-[color-mix(in_srgb,var(--accent-primary)_12%,transparent)] disabled:opacity-50'

type DetectionState = { phase: 'checking' } | { phase: 'found'; version: string } | { phase: 'missing' }

/** Explicit opt-in for the local OpenCode harness. Detection never connects:
 *  the harness stays dormant until the user confirms here. */
export function HarnessConnectPanel({ onConnected, onBusyChange }: { onConnected?: (connection: ModelProviderConnection) => void | Promise<void>; onBusyChange?: (busy: boolean) => void }) {
    const { updateSettings } = useSettings()
    const [detection, setDetection] = useState<DetectionState>({ phase: 'checking' })
    const [model, setModel] = useState('')
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState('')
    const [success, setSuccess] = useState('')
    const mounted = useRef(false)
    const detect = useCallback(async () => {
        setDetection({ phase: 'checking' }); setError('')
        try {
            const result: { success: boolean; error?: string; detected?: HarnessDetection['detected'] } = await window.devscope.onboarding.detectHarness()
            if (!mounted.current) return
            if (!result.success) throw new Error(result.error || 'Could not check for OpenCode.')
            setDetection(result.detected ? { phase: 'found', version: result.detected.version } : { phase: 'missing' })
        } catch (cause) {
            if (mounted.current) {
                setDetection({ phase: 'missing' })
                setError(cause instanceof Error ? cause.message : 'Could not check for OpenCode.')
            }
        }
    }, [])
    useEffect(() => {
        mounted.current = true
        void detect()
        return () => { mounted.current = false }
    }, [detect])
    async function connect() {
        if (busy || detection.phase !== 'found') return
        setBusy(true); onBusyChange?.(true); setError(''); setSuccess('')
        try {
            const result = await window.devscope.onboarding.connectHarness(model.trim() ? { model: model.trim() } : {})
            if (!mounted.current) return
            if (!result.success) throw new Error(result.error || 'Could not connect the harness.')
            updateSettings({ assistantDefaultModel: result.connection.model })
            setSuccess(`${result.connection.label} connected`)
            await onConnected?.(result.connection)
        } catch (cause) {
            if (mounted.current) setError(cause instanceof Error ? cause.message : 'Could not connect the harness.')
        } finally {
            if (mounted.current) { setBusy(false); onBusyChange?.(false) }
        }
    }
    return <div className="space-y-4 text-left">
        {detection.phase === 'checking' ? <p className="text-[12px] text-sparkle-text-secondary">Checking for an installed OpenCode…</p> : null}
        {detection.phase === 'found' ? <p className="text-[12px] leading-5 text-sparkle-text-secondary">Found OpenCode {detection.version}. Connecting uses your OpenCode login through a local server Zyra starts on demand — no API key, and nothing connects until you confirm. Harness models answer without running tools in this phase.</p> : null}
        {detection.phase === 'missing' ? <>
            <p className="text-[12px] leading-5 text-sparkle-text-secondary">OpenCode is not installed. Install it, then run <span className="font-mono">opencode auth login</span> to connect a provider.</p>
            <SettingsButton variant="ghost" disabled={busy} onClick={() => void detect()}>Check again</SettingsButton>
        </> : null}
        {detection.phase === 'found' ? <form className="space-y-4" onSubmit={event => { event.preventDefault(); void connect() }}>
            <SettingsInput className={`${field} placeholder:text-sparkle-text-secondary`} aria-label="Model ID" placeholder="Model ID (optional, free default)" value={model} disabled={busy} onChange={event => setModel(event.currentTarget.value)} spellCheck={false} />
            <button className="h-10 w-full rounded-full bg-[var(--accent-primary)] px-4 text-[12px] font-medium text-[var(--accent-on-primary)] transition-opacity hover:opacity-90 disabled:opacity-50" disabled={busy}> {busy ? 'Connecting…' : 'Connect harness and use provider'}</button>
        </form> : null}
        {error || success ? <p role={error ? 'alert' : 'status'} className={`text-[12px] leading-5 ${error ? 'text-[var(--status-danger)]' : 'text-[var(--status-success)]'}`}>{error || success}</p> : null}
    </div>
}
