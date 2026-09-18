import { getNativeOverlayHost } from './native-overlay-host'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, ExternalLink, LoaderCircle, RotateCw, X } from 'lucide-react'
import type { DevScopeBrowserThreatWarning } from '@shared/contracts/devscope-api'
import { AssistantBrowserThreatWarning } from '../../pages/assistant/AssistantBrowserThreatWarning'
import type { BrowserViewState, BrowserViewCommand } from '@shared/browser-view'
import type { DesktopLinkResult } from '@shared/desktop-link-policy'
import { getOverlayEventDocuments } from './native-overlay-portal'
import { suspendLinkOriginOverlays } from '@/lib/desktop-link-overlays'
import { observeAssistantBrowserSlotGeometry } from '../../pages/assistant/assistant-browser-slot-geometry'
import { nextAssistantBrowserSlotRevision } from '../../pages/assistant/assistant-browser-slot-revision'

const button = 'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-sparkle-text-secondary transition-colors hover:bg-[var(--color-accent)] hover:text-sparkle-text disabled:opacity-30'
export function DesktopLinkBrowser({ id, url, visible, onReady, onClose }: {
    id: string; url: string; visible: boolean; onReady: (result: DesktopLinkResult) => void; onClose: () => void
}) {
    const slot = useRef<HTMLDivElement>(null)
    const [state, setState] = useState<BrowserViewState | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [warning, setWarning] = useState<DevScopeBrowserThreatWarning | null>(null)
    const [warningBusy, setWarningBusy] = useState(false)
    const mounted = useRef(false)
    useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
    const liveState = useRef(state)
    liveState.current = state
    const ready = useRef(onReady)
    ready.current = onReady
    useLayoutEffect(() => {
        const restoreContent = suspendLinkOriginOverlays(getOverlayEventDocuments())
        const restoreInteractive = getNativeOverlayHost().suspendCurrentPresentation()
        const restorePassive = getNativeOverlayHost(true).suspendCurrentPresentation()
        return () => { restoreContent(); restoreInteractive(); restorePassive() }
    }, [id])
    useEffect(() => {
        let disposed = false
        const unsubscribe = window.devscope.browserView.onEvent(event => {
            if (!disposed && event.type === 'state' && event.state.tabId === id) { liveState.current = event.state; setState(event.state) }
        })
        void window.devscope.browserView.ensure({ tabId: id, threadId: `desktop-links:${id.slice(8)}`, sessionMode: 'normal', initialUrl: url }).then(result => {
            if (disposed) return
            if (result.success) { liveState.current = result.state; setState(result.state); ready.current({ success: true }) }
            else { setError(result.error); ready.current(result) }
        }).catch(cause => {
            if (!disposed) { const message = cause instanceof Error ? cause.message : 'Could not open Browser.'; setError(message); ready.current({ success: false, error: message }) }
        })
        return () => {
            disposed = true
            unsubscribe()
            window.devscope.browserView.reportSlot({ tabId: id, revision: nextAssistantBrowserSlotRevision(window), bounds: null, contentSize: null, active: false, visible: false })
            void window.devscope.browserView.close(id).catch(() => undefined)
        }
    }, [id, url])
    useEffect(() => window.devscope.onBrowserThreatBlocked(threat => {
        if (threat.sourceGuestWebContentsId === liveState.current?.guestWebContentsId) { setWarning(threat); setError(null) }
    }), [])
    const resolveWarning = async (proceed: boolean) => {
        if (!warning || warningBusy) return
        setWarningBusy(true)
        try {
            const result = proceed ? await window.devscope.proceedBrowserThreatWarning(warning.decisionId) : await window.devscope.dismissBrowserThreatWarning(warning.decisionId)
            if (!mounted.current) return
            if (!result.success) { setError(result.error || 'Could not update the security warning.'); return }
            setWarning(null)
            if (!proceed) onClose()
        } catch { if (mounted.current) setError('Could not update the security warning.') }
        finally { if (mounted.current) setWarningBusy(false) }
    }
    const available = Boolean(state)
    const nativeVisible = visible && !warning
    useLayoutEffect(() => {
        const element = slot.current
        if (!element || !available) return
        const report = () => {
            const rect = element.getBoundingClientRect()
            const bounds = rect.width > 0 && rect.height > 0 ? { x: rect.left, y: rect.top, width: rect.width, height: rect.height } : null
            window.devscope.browserView.reportSlot({ tabId: id, revision: nextAssistantBrowserSlotRevision(window), bounds, contentSize: bounds ? { width: element.offsetWidth, height: element.offsetHeight } : null, active: nativeVisible, visible: nativeVisible })
        }
        return observeAssistantBrowserSlotGeometry(element, report)
    }, [id, available, nativeVisible])
    const command = async (type: 'back' | 'forward' | 'reload') => {
        setError(null)
        try {
            const result = await window.devscope.browserView.command({ tabId: id, type } as BrowserViewCommand)
            if (!result.success) setError(result.error)
        } catch { setError('Could not update this page.') }
    }
    const external = async () => {
        try { const result = await window.devscope.openBrowserPreviewExternal(state?.url || url); if (!result.success) setError(result.error || 'Could not open the default browser.') }
        catch { setError('Could not open the default browser.') }
    }
    return <section aria-label="Link in Zyra Browser" className="fixed inset-x-0 bottom-0 top-[34px] z-40 flex flex-col bg-sparkle-bg text-sparkle-text">
        <header className="flex min-h-12 items-center gap-1 border-b border-[var(--color-border)] px-3">
            <button type="button" className={button} title="Back to Zyra" aria-label="Back to Zyra" onClick={onClose}><X size={17} /></button>
            <button type="button" className={button} disabled={!state?.canGoBack} aria-label="Back" onClick={() => void command('back')}><ArrowLeft size={16} /></button>
            <button type="button" className={button} disabled={!state?.canGoForward} aria-label="Forward" onClick={() => void command('forward')}><ArrowRight size={16} /></button>
            <button type="button" className={button} disabled={!state} aria-label="Reload page" onClick={() => void command('reload')}>{state?.status === 'loading' ? <LoaderCircle size={15} className="animate-spin" /> : <RotateCw size={15} />}</button>
            <div className="mx-2 min-w-0 flex-1 truncate rounded-lg bg-[var(--color-card)] px-3 py-1.5 text-xs text-sparkle-text-secondary" title={state?.url || url}>{state?.displayAddress || state?.url || url}</div>
            <button type="button" className={button} title="Open in default browser" aria-label="Open in default browser" onClick={() => void external()}><ExternalLink size={16} /></button>
        </header>
        {error || state?.error ? <p role="alert" className="px-4 py-2 text-xs text-red-400">{error || state?.error}</p> : null}
        <div ref={slot} className="relative min-h-0 flex-1">{warning ? <div className="absolute inset-0"><AssistantBrowserThreatWarning warning={warning} busy={warningBusy} error={error} onBack={() => void resolveWarning(false)} onProceed={() => void resolveWarning(true)} /></div> : null}{!state && !error ? <div role="status" className="flex h-full items-center justify-center text-sm text-sparkle-text-muted"><LoaderCircle size={18} className="animate-spin" /><span className="sr-only">Opening Browser</span></div> : null}</div>
    </section>
}
