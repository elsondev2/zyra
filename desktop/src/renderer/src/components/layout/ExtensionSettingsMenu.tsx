import { useEffect, useRef, useState } from 'react'
import { ExternalLink, Settings } from 'lucide-react'
import { extensionRequest } from '@/lib/browser-extension'
import { extensionQuotaText } from './extension-quota'

export function ExtensionSettingsMenu() {
    const [open, setOpen] = useState(false)
    const [quota, setQuota] = useState('Checking quota…')
    const [checkedAt, setCheckedAt] = useState('')
    const [error, setError] = useState('')
    const container = useRef<HTMLDivElement>(null)
    const trigger = useRef<HTMLButtonElement>(null)
    useEffect(() => {
        if (!open) return
        let active = true
        setQuota('Checking quota…')
        setCheckedAt('')
        void window.devscope.assistant.getAccountOverview(false).then(result => {
            if (!active) return
            setQuota(result.success ? extensionQuotaText(result.overview) : 'Quota unavailable')
            if (result.success) setCheckedAt(result.overview.fetchedAt)
        }).catch(() => { if (active) setQuota('Quota unavailable') })
        const outside = (event: PointerEvent) => {
            if (!container.current?.contains(event.target as Node)) setOpen(false)
        }
        document.addEventListener('pointerdown', outside)
        return () => { active = false; document.removeEventListener('pointerdown', outside) }
    }, [open])
    const run = async (destination: 'extension' | 'desktop') => {
        setError('')
        try {
            if (destination === 'extension') await extensionRequest('open-console')
            else {
                const result = await window.devscope.openDesktopSettings()
                if (!result.success) throw new Error(result.error || 'Could not open Desktop settings.')
            }
            setOpen(false)
            trigger.current?.focus()
        } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not open settings.') }
    }
    return <div ref={container} className="relative min-w-0 flex-1" onKeyDown={event => {
        if (event.key === 'Escape' && open) { event.preventDefault(); setOpen(false); trigger.current?.focus() }
    }}>
        <button ref={trigger} type="button" aria-expanded={open} aria-controls="extension-settings-options" onClick={() => { setError(''); setOpen(value => !value) }} className="flex h-8 w-full items-center gap-2.5 rounded-md px-2.5 text-[13px] text-sparkle-text-secondary hover:bg-[var(--surface-hover)] focus-visible:outline focus-visible:outline-1">
            <Settings size={15} aria-hidden="true" />Settings
        </button>
        {open && <div id="extension-settings-options" className="absolute bottom-full left-0 z-50 mb-2 w-full min-w-[210px] rounded-md border border-[var(--surface-divider)] bg-sparkle-bg p-1 text-[12px] text-sparkle-text shadow-lg">
            <button type="button" onClick={() => void run('extension')} className="flex w-full items-center justify-between gap-2 rounded px-2 py-2 text-left hover:bg-[var(--surface-hover)]">Extension settings<ExternalLink size={13} aria-hidden="true" /></button>
            <button type="button" onClick={() => void run('desktop')} className="flex w-full items-center justify-between gap-2 rounded px-2 py-2 text-left hover:bg-[var(--surface-hover)]">Desktop settings<ExternalLink size={13} aria-hidden="true" /></button>
            <div role="status" className="mt-1 border-t border-[var(--surface-divider)] px-2 py-2" title={checkedAt ? `Snapshot: ${checkedAt}` : undefined}>
                <div className="text-sparkle-text-muted">ChatGPT quota</div><div className="mt-1">{quota}</div>
            </div>
            {error && <p role="alert" className="px-2 pb-2 text-[var(--status-danger)]">{error}</p>}
        </div>}
    </div>
}
