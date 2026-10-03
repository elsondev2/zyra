import { useState } from 'react'
import { PowerOff, Wifi } from 'lucide-react'
import type { MobileAccessApi, MobileAccessState } from '@shared/mobile-access'
import { mobileAccessError, preferredMobileAddress } from '@shared/mobile-access-policy'
import { SettingsButton, SettingsDialog, SettingsSelect } from './settings-layout'

/** Host-wide transport settings only. Project permissions live on each device. */
export function MobileAccessDialog({ state, api, onClose, onSaved }: { state: MobileAccessState; api: MobileAccessApi; onClose: () => void; onSaved: (state: MobileAccessState) => void }) {
    const [address, setAddress] = useState(state.config.address)
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const selected = state.addresses.find(entry => entry.address === address)
    const recommended = preferredMobileAddress(state.addresses)
    const hasChanges = address !== state.config.address || state.config.enabled !== state.running
    const close = () => { if (!busy) onClose() }
    const save = async (enabled = state.config.enabled) => {
        if (address === state.config.address && enabled === state.running && enabled === state.config.enabled) { onClose(); return }
        setBusy(true); setError(null)
        try { onSaved(await api.configure({ ...state.config, address, enabled })) }
        catch (e) { setError(mobileAccessError(e)) }
        finally { setBusy(false) }
    }
    return <SettingsDialog open title="Phone connection" description="Choose this PC’s network for your phone." onClose={close}
        footer={<><SettingsButton variant="ghost" disabled={busy} onClick={close}>Cancel</SettingsButton><SettingsButton variant="accent" disabled={busy || !selected} onClick={() => void save()}>{busy ? 'Saving…' : hasChanges ? 'Save changes' : 'Done'}</SettingsButton></>}>
        <div className="flex items-center gap-3"><Wifi size={18} className="shrink-0 text-[var(--settings-text-secondary)]" /><div className="min-w-0 flex-1"><p className="text-sm font-medium">{selected?.name || 'No network available'}</p><p className="mt-0.5 text-xs text-[var(--settings-text-secondary)]">{selected ? (state.running ? 'Mobile access is on' : 'Mobile access is off') : 'Connect this PC to Wi-Fi or Ethernet.'}</p></div>{state.running ? <SettingsButton variant="danger" className="h-7 px-2" disabled={busy} onClick={() => void save(false)}><PowerOff size={13} />Turn off</SettingsButton> : null}</div>
        <SettingsSelect aria-label="This PC’s network" value={address} disabled={busy} onChange={e => setAddress(e.target.value)} className="!w-full">{!selected ? <option value={address}>Previous network unavailable</option> : null}{state.addresses.map(entry => <option key={entry.address} value={entry.address}>{entry.name} · {entry.address}{entry.address === recommended ? ' (recommended)' : ''}</option>)}</SettingsSelect>
        <p className="text-xs leading-4 text-[var(--settings-text-secondary)]">Your phone needs this same network. Changing it may briefly disconnect paired phones.</p>
        {error ? <p role="alert" className="text-xs text-[var(--status-danger)]">{error}</p> : null}
    </SettingsDialog>
}
