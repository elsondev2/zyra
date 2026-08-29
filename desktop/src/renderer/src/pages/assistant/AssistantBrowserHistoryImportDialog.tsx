import { useEffect, useMemo, useRef, useState } from 'react'
import { Download, X } from 'lucide-react'
import type { ExternalBrowserHistoryImportResult, ExternalBrowserHistoryProfile, ExternalBrowserHistoryScanResult } from '@shared/external-browser-history-contracts'
import {
    BrowserProfileSourcesStep,
    HistoryImportResultStep,
    HistoryRangeStep,
    HistoryReviewStep
} from './AssistantBrowserHistoryImportSteps'

const WIZARD_STEPS = ['Sources', 'Range', 'Review', 'Done'] as const

function localDateValue(date: Date): string {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

export function AssistantBrowserHistoryImportDialog({ onClose, onImported }: { onClose: () => void; onImported: () => void }) {
    const dialogRef = useRef<HTMLElement | null>(null)
    const [step, setStep] = useState(0)
    const [scan, setScan] = useState<ExternalBrowserHistoryScanResult | null>(null)
    const [scanning, setScanning] = useState(false)
    const [selected, setSelected] = useState<Set<string>>(() => new Set())
    const [scope, setScope] = useState<'all' | 'since'>('all')
    const [since, setSince] = useState(() => {
        const date = new Date()
        date.setMonth(date.getMonth() - 3)
        return localDateValue(date)
    })
    const [importing, setImporting] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [result, setResult] = useState<ExternalBrowserHistoryImportResult | null>(null)
    const selectedProfiles = useMemo(() => scan?.profiles.filter((profile) => selected.has(profile.sourceToken)) || [], [scan?.profiles, selected])
    const browserGroups = useMemo(() => {
        const groups = new Map<string, ExternalBrowserHistoryProfile[]>()
        for (const profile of scan?.profiles || []) {
            const profiles = groups.get(profile.browserName) || []
            profiles.push(profile)
            groups.set(profile.browserName, profiles)
        }
        return [...groups.entries()]
    }, [scan?.profiles])

    useEffect(() => {
        const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null
        dialogRef.current?.focus()
        return () => {
            window.requestAnimationFrame(() => previouslyFocused?.focus())
        }
    }, [])

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape' && !importing) {
                onClose()
                return
            }
            if (event.key !== 'Tab' || !dialogRef.current) return
            const focusable = [...dialogRef.current.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])')]
            if (focusable.length === 0) {
                event.preventDefault()
                return
            }
            const first = focusable[0]
            const last = focusable[focusable.length - 1]
            if (document.activeElement === dialogRef.current) {
                event.preventDefault()
                const target = event.shiftKey ? last : first
                target.focus()
            } else if (event.shiftKey && document.activeElement === first) {
                event.preventDefault()
                last.focus()
            } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault()
                first.focus()
            }
        }
        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [importing, onClose])

    const scanProfiles = async () => {
        setError(null)
        setScanning(true)
        try {
            if (typeof window.devscope.scanExternalBrowserHistoryProfiles !== 'function') throw new Error('Restart Zyra Desktop to load the history importer.')
            const response = await window.devscope.scanExternalBrowserHistoryProfiles()
            if (!response.success) throw new Error(response.error || 'Could not scan browser profiles.')
            const nextScan = { scanToken: response.scanToken, expiresAt: response.expiresAt, profiles: response.profiles }
            setScan(nextScan)
            setSelected(new Set())
        } catch (scanError) {
            setScan(null)
            setError(scanError instanceof Error ? scanError.message : 'Could not scan browser profiles.')
        } finally {
            setScanning(false)
        }
    }

    const importHistory = async () => {
        if (!scan || selectedProfiles.length === 0) return
        setError(null)
        setImporting(true)
        try {
            if (typeof window.devscope.importExternalBrowserHistory !== 'function') throw new Error('Restart Zyra Desktop to load the history importer.')
            const response = await window.devscope.importExternalBrowserHistory({
                scanToken: scan.scanToken,
                sourceTokens: selectedProfiles.map((profile) => profile.sourceToken),
                scope,
                ...(scope === 'since' ? { since: new Date(`${since}T00:00:00`).toISOString() } : {})
            })
            if (!response.success) throw new Error(response.error || 'Could not import Browser history.')
            setResult(response.result)
            setStep(3)
            onImported()
        } catch (importError) {
            setError(importError instanceof Error ? importError.message : 'Could not import Browser history.')
        } finally {
            setImporting(false)
        }
    }

    return (
        <div className="absolute inset-0 z-[120] flex items-center justify-center bg-[color-mix(in_srgb,var(--color-bg)_76%,transparent)] p-4 backdrop-blur-[3px]" role="dialog" aria-modal="true" aria-label="Import Browser history">
            <section ref={dialogRef} tabIndex={-1} className="flex max-h-[min(680px,calc(100%-24px))] w-full max-w-[520px] flex-col overflow-hidden rounded-xl border border-[var(--surface-divider)] bg-[color-mix(in_srgb,var(--color-card)_98%,var(--color-bg))] shadow-[0_28px_90px_rgba(0,0,0,0.42)]">
                <header className="flex h-12 shrink-0 items-center gap-2 border-b border-[var(--surface-divider)] px-3.5">
                    <Download size={14} className="text-[var(--accent-primary)]/80" />
                    <h3 className="text-[12px] font-semibold text-sparkle-text">Import Browser history</h3>
                    <span className="text-[8px] text-sparkle-text-muted/45">{WIZARD_STEPS[step]} · {step + 1}/{WIZARD_STEPS.length}</span>
                    <button type="button" onClick={onClose} disabled={importing} className="ml-auto inline-flex size-8 items-center justify-center rounded-md text-sparkle-text-muted/55 hover:bg-[var(--surface-hover)] hover:text-sparkle-text disabled:opacity-30" aria-label="Close import"><X size={13} /></button>
                </header>

                <div className="min-h-0 flex-1 overflow-y-auto p-4">
                    {step === 0 ? <BrowserProfileSourcesStep scan={scan} scanning={scanning} browserGroups={browserGroups} selected={selected} onSelectedChange={setSelected} onScan={() => void scanProfiles()} /> : null}
                    {step === 1 ? <HistoryRangeStep scope={scope} since={since} maxDate={localDateValue(new Date())} onScopeChange={setScope} onSinceChange={setSince} /> : null}
                    {step === 2 ? <HistoryReviewStep profiles={selectedProfiles} scope={scope} since={since} importing={importing} /> : null}
                    {step === 3 && result ? <HistoryImportResultStep result={result} /> : null}
                    {error ? <p className="mt-3 rounded-md border border-red-400/15 bg-red-400/[0.06] px-2.5 py-2 text-[9px] text-red-300">{error}</p> : null}
                </div>

                <footer className="flex min-h-12 shrink-0 items-center border-t border-[var(--surface-divider)] px-3">
                    <span className="text-[8px] text-sparkle-text-muted/40">{step === 0 ? `${selectedProfiles.length} selected` : step === 1 ? 'Choose the scope' : step === 2 ? `${selectedProfiles.length} profiles ready` : 'Complete'}</span>
                    <div className="ml-auto flex gap-2">
                        {step > 0 && step < 3 ? <button type="button" onClick={() => setStep((current) => Math.max(0, current - 1))} disabled={importing} className="h-8 rounded-md px-3 text-[9px] text-sparkle-text-muted hover:bg-[var(--surface-hover)] disabled:opacity-35">Back</button> : null}
                        {step === 0 ? <button type="button" onClick={() => setStep(1)} disabled={!scan || selectedProfiles.length === 0 || scanning} className="h-8 rounded-md bg-[var(--accent-primary)] px-3 text-[9px] font-semibold text-[var(--accent-contrast)] disabled:opacity-35">Continue</button> : null}
                        {step === 1 ? <button type="button" onClick={() => setStep(2)} className="h-8 rounded-md bg-[var(--accent-primary)] px-3 text-[9px] font-semibold text-[var(--accent-contrast)]">Review</button> : null}
                        {step === 2 ? <button type="button" onClick={() => void importHistory()} disabled={importing} className="h-8 rounded-md bg-[var(--accent-primary)] px-3 text-[9px] font-semibold text-[var(--accent-contrast)] disabled:opacity-40">{importing ? 'Importing…' : 'Import history'}</button> : null}
                        {step === 3 ? <button type="button" onClick={onClose} className="h-8 rounded-md bg-[var(--accent-primary)] px-3 text-[9px] font-semibold text-[var(--accent-contrast)]">Done</button> : null}
                    </div>
                </footer>
            </section>
        </div>
    )
}
