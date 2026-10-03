import { useRef, useState } from 'react'
import { Check, Copy } from 'lucide-react'
import type { ChatGptDeviceCode } from '@shared/onboarding/contracts'
import { SettingsButton, SettingsDialog } from '../settings-layout'

export function ChatGptDeviceCodeDialog({ open, deviceCode, onClose, onCancel }: { open: boolean; deviceCode: ChatGptDeviceCode | null; onClose: () => void; onCancel: () => void }) {
    const [copyState, setCopyState] = useState<'idle' | 'copied' | 'error'>('idle')
    const copyTimerRef = useRef<number | null>(null)
    const copyCode = async () => {
        const code = deviceCode?.userCode || ''
        if (!code) return
        try {
            const result = await window.devscope.copyToClipboard?.(code)
            if (result?.success === false) throw new Error(result.error || 'Could not copy the device code.')
            if (!result) {
                if (!navigator.clipboard?.writeText) throw new Error('Clipboard access is unavailable.')
                await navigator.clipboard.writeText(code)
            }
            setCopyState('copied')
            if (copyTimerRef.current !== null) window.clearTimeout(copyTimerRef.current)
            copyTimerRef.current = window.setTimeout(() => setCopyState('idle'), 1_500)
        } catch {
            setCopyState('error')
        }
    }
    return <SettingsDialog
        open={open && deviceCode !== null}
        title="Sign in with device code"
        description="A browser page has opened. Sign in to ChatGPT, then enter this one-time code."
        onClose={onClose}
        footer={<><SettingsButton variant="ghost" onClick={onClose}>Hide</SettingsButton><SettingsButton variant="ghost" onClick={onCancel}>Cancel sign-in</SettingsButton></>}
    >
        <div className="space-y-3">
            <a href={deviceCode?.verificationUrl} target="_blank" rel="noreferrer" className="block truncate text-xs text-[var(--accent-primary)] underline underline-offset-4">{deviceCode?.verificationUrl}</a>
            <div className="flex items-center justify-between gap-3 rounded-md border border-[var(--settings-border)] bg-[var(--settings-control)] px-3 py-2.5">
                <code className="text-base font-semibold tracking-[0.16em] text-[var(--settings-text)]">{deviceCode?.userCode}</code>
                <SettingsButton variant="ghost" onClick={() => void copyCode()} aria-label="Copy device code">{copyState === 'copied' ? <Check size={13} /> : <Copy size={13} />}{copyState === 'copied' ? 'Copied' : copyState === 'error' ? 'Try again' : 'Copy'}</SettingsButton>
            </div>
        </div>
    </SettingsDialog>
}
