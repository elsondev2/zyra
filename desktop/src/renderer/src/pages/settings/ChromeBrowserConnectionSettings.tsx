import { CHROME_EXTENSION_STORE_URL } from '@shared/chrome-extension-identity'
import { useEffect, useState } from 'react'
import { Copy, FolderOpen, ArrowUpRight } from 'lucide-react'
import type { ControlPairingState } from '@shared/agent-control/contracts'
import { SettingsButton, SettingsRow, SettingsSection } from './settings-layout'
import chromeLogo from '@/assets/browser-logos/chrome.svg'
export function ChromeBrowserConnectionSettings() {
    const [pairing, setPairing] = useState<ControlPairingState>({ state: 'stopped' })
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [copied, setCopied] = useState(false)
    useEffect(() => {
        let disposed = false
        void window.devscope.agentControl.getState().then(result => { if (!disposed && result.success) setPairing(result.state.pairing) }).catch(() => { if (!disposed) setError('Could not read the Chrome connection.') })
        const unsubscribe = window.devscope.agentControl.onStateChange(state => setPairing(state.pairing))
        return () => { disposed = true; unsubscribe() }
    }, [])
    const run = async (operation: () => Promise<{ success: boolean; error?: string }>) => {
        setBusy(true); setError(null)
        try { const result = await operation(); if (!result.success) throw new Error(result.error || 'Could not update the Chrome connection.') }
        catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not update the Chrome connection.') }
        finally { setBusy(false) }
    }
    return <SettingsSection title="Chrome browser">
        <SettingsRow title="Zyra Browser" description="Install once, then click the Zyra icon in Chrome to chat." icon={<img src={chromeLogo} width={16} height={16} alt="" aria-hidden="true" />} info={<p>Your extension connects automatically while Zyra is open. Click its icon to chat about the current tab, or ask any Desktop chat to use your named Chrome browser. Connection status updates automatically.</p>} status={pairing.state === 'paired' ? 'Connected' : pairing.automaticConnectionPaused ? 'Paused' : 'Waiting for Chrome'} statusTone={pairing.state === 'paired' ? 'ready' : 'muted'} control={<>
            {CHROME_EXTENSION_STORE_URL
                ? <SettingsButton disabled={busy} onClick={() => void run(() => window.devscope.openBrowserPreviewExternal(CHROME_EXTENSION_STORE_URL!))}><ArrowUpRight size={12}/>{pairing.state === 'paired' ? 'View extension' : 'Install extension'}</SettingsButton>
                : <SettingsButton disabled={busy} onClick={() => void run(() => window.devscope.agentControl.openChromeExtensionFolder())}><FolderOpen size={12}/>Extension folder</SettingsButton>}
            {!pairing.automaticConnectionPaused
                ? <SettingsButton variant="ghost" disabled={busy} onClick={() => void run(() => window.devscope.agentControl.stopChromePairing())}>Pause connection</SettingsButton>
                : <SettingsButton variant="ghost" disabled={busy} onClick={() => void run(() => window.devscope.agentControl.startChromePairing())}>Resume connection</SettingsButton>}
        </>}>
            {!CHROME_EXTENSION_STORE_URL && <p className="mt-2 text-xs text-[var(--settings-text-secondary)]">The store release is not available yet. In chrome://extensions, enable Developer mode and load the extension folder.</p>}
            <details className="mt-3 text-xs text-[var(--settings-text-secondary)]"><summary className="cursor-pointer">Advanced connection</summary>
            <p className="my-2">Only needed for older extension versions.</p><SettingsButton variant="ghost" disabled={busy || pairing.state === 'paired'} onClick={() => void run(() => window.devscope.agentControl.startChromePairing())}>Show pairing code</SettingsButton>
            {pairing.state === 'waiting' && <div className="mt-3 flex flex-wrap items-center gap-5 rounded-lg border border-[var(--settings-border)] bg-[var(--settings-control)] px-3 py-3 text-xs">
                <div><div className="mb-1 text-[var(--settings-text-secondary)]">Pairing code</div><button className="flex items-center gap-2 font-mono text-base tracking-widest" aria-label="Copy pairing code" onClick={() => void run(async () => { const result = await window.devscope.copyToClipboard(pairing.code || ''); if (result.success) setCopied(true); return result })}>{pairing.code}<Copy size={12} /></button>{copied && <span className="text-[10px]">Copied</span>}</div>
                <div><div className="mb-1 text-[var(--settings-text-secondary)]">Port</div><code className="select-all text-base">{pairing.port}</code></div>
                <p className="basis-full text-[11px] text-[var(--settings-text-secondary)]">Enter these in the extension's Connect tab. This code expires in five minutes.</p>
            </div>}
            </details>
            {error && <p role="alert" className="mt-2 text-xs text-[var(--status-danger)]">{error}</p>}
        </SettingsRow>
    </SettingsSection>
}
