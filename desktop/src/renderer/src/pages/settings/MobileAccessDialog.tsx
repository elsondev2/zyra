import { useState } from 'react'
import { Network, Wifi } from 'lucide-react'
import type { MobileAccessApi, MobileAccessState } from '@shared/mobile-access'
import { mobileAccessError, preferredMobileAddress } from '@shared/mobile-access-policy'
import { SettingsButton, SettingsDialog, SettingsSelect } from './settings-layout'
import { SettingsExpander } from './SettingsExpander'

/** Host-wide transport settings only. Project permissions live on each device. */
export function MobileAccessDialog({ state, api, onClose, onSaved }: { state: MobileAccessState; api: MobileAccessApi; onClose: () => void; onSaved: (state: MobileAccessState) => void }) {
    const [address, setAddress] = useState(state.config.address)
    const [advanced, setAdvanced] = useState(false)
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const selected = state.addresses.find(entry => entry.address === address)
    const recommended = preferredMobileAddress(state.addresses)
    const close = () => { if (!busy) onClose() }
    const save = async (enabled = state.config.enabled) => {
        if (address === state.config.address && enabled === state.running && enabled === state.config.enabled) { onClose(); return }
        setBusy(true); setError(null)
        try { onSaved(await api.configure({ ...state.config, address, enabled })) }
        catch (e) { setError(mobileAccessError(e)) }
        finally { setBusy(false) }
    }
    return <SettingsDialog open title="Phone connection" description="Keep your phone and this PC on the same network." onClose={close}
        footer={<><SettingsButton variant="ghost" disabled={busy} onClick={close}>Cancel</SettingsButton><SettingsButton variant="accent" disabled={busy || !selected} onClick={() => void save()}>{busy ? 'Saving…' : 'Done'}</SettingsButton></>}>
        <div className="flex items-center gap-3 py-2"><Wifi size={20} className="shrink-0 text-[var(--settings-text-secondary)]" /><div className="min-w-0 flex-1"><p className="text-sm font-medium">{selected?.name || 'No network available'}</p><p className="mt-1 text-xs text-[var(--settings-text-secondary)]">{selected ? (state.running ? 'Mobile access is on' : 'Ready to pair your phone') : 'Connect this PC to Wi-Fi or Ethernet.'}</p></div></div>
        <p className="text-xs leading-5 text-[var(--settings-text-secondary)]">Zyra stays open on your PC while you use your phone. Pairing needs no account or internet connection.</p>
        <SettingsButton variant="ghost" aria-expanded={advanced} onClick={() => setAdvanced(value => !value)}><Network size={14} />{advanced ? 'Hide advanced' : 'Advanced'}</SettingsButton>
        <SettingsExpander open={advanced} contentClassName="pt-3"><div className="space-y-4 border-t border-[var(--settings-border)] pt-3">
            <label className="block text-xs">Network interface<SettingsSelect aria-label="Network interface" value={address} disabled={busy} onChange={e => setAddress(e.target.value)} className="mt-2 !w-full">{!selected ? <option value={address}>Previous network unavailable</option> : null}{state.addresses.map(entry => <option key={entry.address} value={entry.address}>{entry.name} · {entry.address}{entry.address === recommended ? ' (recommended)' : ''}</option>)}</SettingsSelect></label>
            <p className="text-xs leading-5 text-[var(--settings-text-secondary)]">Change this only if your PC has several networks. Changing networks reconnects paired devices.</p>
            {state.running ? <SettingsButton disabled={busy} onClick={() => void save(false)}>Turn off mobile access</SettingsButton> : null}
        </div></SettingsExpander>
        {error ? <p role="alert" className="text-xs text-[var(--status-danger)]">{error}</p> : null}
    </SettingsDialog>
}
