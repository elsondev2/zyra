import { useEffect, useRef, useState } from 'react'
import { useRuntimeConnection } from '@/lib/runtime-connection'
import { Check, Copy, Loader2, Settings2, SlidersHorizontal, QrCode, RefreshCw, Smartphone, X } from 'lucide-react'
import type { MobileAccessState, MobilePairing } from '@shared/mobile-access'
import { mobileAccessError, mobilePairingCompleted, preferredMobileAddress } from '@shared/mobile-access-policy'
import { SettingsButton, SettingsRow, SettingsSection } from './settings-layout'

import { SensitiveSettingValue } from './SensitiveSettingValue'
import { MobileAccessDialog } from './MobileAccessDialog'
import { MobileDeviceAccessDialog } from './MobileDeviceAccessDialog'

export function MobileConnectionSettings() {
    const api = window.devscope.mobileAccess
    const runtimeConnection = useRuntimeConnection()
    const pairingPanel = useRef<HTMLDivElement>(null)
    const [state, setState] = useState<MobileAccessState | null>(null)
    const [address, setAddress] = useState('')
    const [projects, setProjects] = useState<string[]>([])
    const [pairing, setPairing] = useState<MobilePairing | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [busy, setBusy] = useState(false)
    const [remaining, setRemaining] = useState(0)
    const [paired, setPaired] = useState(false)
    const [dialog, setDialog] = useState(false)
    const [deviceDialog, setDeviceDialog] = useState<string | null>(null)
    const [copied, setCopied] = useState(false)
    const install = (next: MobileAccessState) => {
        setState(next); setAddress(preferredMobileAddress(next.addresses, next.config.address)); setProjects(next.config.projects)
    }
    useEffect(() => {
        let alive = true
        void api?.getState().then(next => { if (alive) install(next) }).catch(e => { if (alive) setError(mobileAccessError(e)) })
        return () => { alive = false }
    }, [api])
    useEffect(() => {
        if (!pairing || !api) return
        let alive = true, polling = false
        const known = state?.devices || []
        const tick = () => setRemaining(Math.max(0, Math.ceil((pairing.expiresAt - Date.now()) / 1000)))
        tick()
        const countdown = window.setInterval(tick, 1000)
        const timer = window.setInterval(async () => {
            if (polling) return
            polling = true
            try {
                const next = await api.getState()
                if (!alive) return
                setState(next)
                if (mobilePairingCompleted(known, next.devices)) { setPairing(null); setPaired(true) }
            } catch { /* Keep the code visible during a transient refresh failure. */ }
            finally { polling = false }
        }, 2500)
        return () => { alive = false; window.clearInterval(countdown); window.clearInterval(timer) }
    }, [api, pairing])
    useEffect(() => {
        if (pairing) pairingPanel.current?.scrollIntoView({ block: 'nearest', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })
    }, [pairing])
    const run = async (action: () => Promise<void>) => {
        setBusy(true); setError(null)
        try { await action() } catch (e) { setError(mobileAccessError(e)) }
        finally { setBusy(false) }
    }
    const dirty = state && (address !== state.config.address || JSON.stringify(projects) !== JSON.stringify(state.config.projects))
    const pair = () => run(async () => {
        if (!api || !state) return
        setPaired(false); setCopied(false)
        if (!state.running || dirty) install(await api.configure({ ...state.config, enabled: true, address, projects }))
        setPairing(await api.pair())
    })
    return <><SettingsSection title="Zyra on your phone" icon={<Smartphone size={15} />}>
        <SettingsRow title="Continue from Android" description={`Connect Android to ${runtimeConnection.label} on this PC. ${runtimeConnection.detail}.`}
            status={state?.running ? runtimeConnection.live ? 'Live' : 'Listening' : undefined} statusTone={runtimeConnection.live ? 'ready' : undefined}
            control={<><SettingsButton disabled={busy || !state || !api} onClick={() => void pair()}>{busy ? <Loader2 size={14} className="animate-spin" /> : <QrCode size={14} />}Pair phone</SettingsButton><SettingsButton variant="ghost" aria-label="Network settings" title="Network settings" disabled={!state || busy} onClick={() => setDialog(true)}><Settings2 size={16} /></SettingsButton></>} />
        {!state && !error ? <p className="px-4 pb-4 text-xs text-[var(--settings-text-secondary)]">Preparing mobile access…</p> : null}
        {error ? <div role="alert" className="flex items-center gap-3 px-4 py-3 text-sm text-[var(--status-danger)]"><span className="flex-1">{error}</span><SettingsButton onClick={() => void run(async () => { if (api) install(await api.getState()) })}>Retry</SettingsButton></div> : null}
        {paired ? <div role="status" className="flex items-center gap-3 border-t border-[var(--settings-border)] p-4"><Check size={20} className="text-[var(--status-success)]" /><div><p className="text-sm font-medium">Your phone is connected</p><p className="mt-1 text-xs text-[var(--settings-text-secondary)]">Continue in Zyra on Android. Keep this app open.</p></div></div> : null}
        {pairing ? <div ref={pairingPanel} className="border-t border-[var(--settings-border)] p-5">
            <div className="flex items-center justify-between"><h3 className="text-sm font-medium">Scan with Zyra on Android</h3><SettingsButton variant="ghost" aria-label="Hide pairing code" onClick={() => setPairing(null)}><X size={15} /></SettingsButton></div>
            <div className="mt-4 flex flex-col items-center gap-5 sm:flex-row">
                <div className="relative shrink-0 rounded-xl bg-white p-2">
                    {remaining > 0 ? <img src={pairing.image} alt="One-use Android pairing code" width={196} height={196} /> : <div className="flex h-[196px] w-[196px] items-center justify-center text-sm text-black">Code expired</div>}
                </div>
                <div className="min-w-0 space-y-4 text-sm">
                    <p>1. Connect your phone to the same Wi-Fi.</p><p>2. Open Zyra and tap <strong className="font-medium">Connect your PC</strong>.</p><p>3. Scan this code and confirm the computer.</p>
                    <div className="flex flex-wrap items-center gap-2"><SettingsButton onClick={() => void pair()} disabled={busy}><RefreshCw size={13} />{remaining > 0 ? 'New code' : 'Create new code'}</SettingsButton>
                    {remaining > 0 ? <SettingsButton variant="ghost" onClick={() => void run(async () => { const result = await window.devscope.copyToClipboard(pairing.link); if (!result.success) throw new Error('Could not copy the link.'); setCopied(true) })}>{copied ? <Check size={13} /> : <Copy size={13} />}{copied ? 'Copied' : 'Copy link'}</SettingsButton> : null}</div>
                    <p className="text-xs text-[var(--settings-text-secondary)]">{remaining > 0 ? 'Code expires in ' + remaining + 's. ' : ''}Only scan codes from a PC you trust.</p>
                </div>
            </div>
        </div> : null}
        {state?.devices.map(device => <div key={device.id} className="flex items-center gap-3 border-t border-[var(--settings-border)] px-4 py-3"><Smartphone size={16} /><div className="min-w-0 flex-1"><div className="min-w-0 text-sm"><SensitiveSettingValue value={device.name} label="Device name" /></div><p className="mt-0.5 text-[11px] text-[var(--settings-text-secondary)]">{device.connected ? "Connected · " : "Not connected · "}{device.hiddenProjects?.length ? "Custom project access" : "All projects"}</p></div><SettingsButton variant="ghost" aria-label="Project access for this device" title="Project access" disabled={busy} onClick={() => setDeviceDialog(device.id)}><SlidersHorizontal size={15} /></SettingsButton><SettingsButton variant="ghost" disabled={busy} onClick={() => void run(async () => { if (api) install(await api.revoke(device.id)) })}>Revoke access</SettingsButton></div>)}
    </SettingsSection>{dialog && state && api ? <MobileAccessDialog state={state} api={api} onClose={() => setDialog(false)} onSaved={next => { install(next); setPairing(null); setDialog(false) }} /> : null}{deviceDialog && state && api && state.devices.some(device => device.id === deviceDialog) ? <MobileDeviceAccessDialog device={state.devices.find(device => device.id === deviceDialog)!} api={api} onClose={() => setDeviceDialog(null)} onSaved={next => { install(next); setDeviceDialog(null) }} /> : null}</>
}
