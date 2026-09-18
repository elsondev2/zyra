import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { LoaderCircle, X } from 'lucide-react'
import type { AccessoryWindowState } from '@shared/accessories'
import { ConfirmModal } from '@/components/ui/ConfirmModal'
import { AccessoryWindowHeader } from './AccessoryWindowHeader'
import { AccessoryHeaderProvider } from './AccessoryHeaderContext'

const AccessoryBrowser = lazy(() => import('./AccessoryBrowser').then(module => ({ default: module.AccessoryBrowser })))
const AccessoryFiles = lazy(() => import('./AccessoryFiles').then(module => ({ default: module.AccessoryFiles })))
const AccessoryTerminal = lazy(() => import('./AccessoryTerminal').then(module => ({ default: module.AccessoryTerminal })))

export default function AccessoryWindowPage() {
    const [state, setState] = useState<AccessoryWindowState | null>(null)
    const [error, setError] = useState('')
    const [confirmClose, setConfirmClose] = useState(false)
    const [headerSlot, setHeaderSlot] = useState<HTMLDivElement | null>(null)
    const alive = useRef(false)
    const updates = useRef(0)
    const previewOpen = useRef(false)
    const allowClose = useRef(false)
    const showError = useCallback((message: string) => setError(message), [])
    const previewChanged = useCallback((open: boolean) => { previewOpen.current = open }, [])
    useEffect(() => {
        alive.current = true
        const api = window.devscope.accessories
        if (!api) { setError('Restart Zyra Desktop to load Accessories.'); return () => { alive.current = false } }
        const unsubscribe = api.onChanged(next => {
            if (!alive.current) return
            updates.current += 1
            setState(next)
        })
        const revision = updates.current
        void window.devscope.accessories.getState().then(result => {
            if (!alive.current || revision !== updates.current) return
            if (result.success) setState(result.state)
            else setError(result.error)
        }).catch(cause => { if (alive.current && revision === updates.current) setError(cause instanceof Error ? cause.message : 'Could not open the accessory.') })
        return () => { alive.current = false; updates.current += 1; unsubscribe() }
    }, [])
    useEffect(() => {
        const guard = (event: BeforeUnloadEvent) => {
            if (!previewOpen.current || allowClose.current) return
            event.preventDefault(); event.returnValue = ''; setConfirmClose(true)
        }
        window.addEventListener('beforeunload', guard)
        return () => window.removeEventListener('beforeunload', guard)
    }, [])
    const close = useCallback(() => {
        if (previewOpen.current && !allowClose.current) { setConfirmClose(true); return }
        void window.devscope.window.close()
    }, [])
    const handled = useCallback((requestId: string) => {
        const revision = updates.current
        void window.devscope.accessories.acknowledge(requestId).then(result => {
            if (!alive.current) return
            if (!result.success) setError(result.error)
            else if (updates.current === revision) setState(result.state)
        }).catch(cause => { if (alive.current) setError(cause instanceof Error ? cause.message : 'Could not acknowledge the browser request.') })
    }, [])
    const title = state?.kind === 'browser' ? state.sessionMode === 'incognito' ? 'Incognito Browser' : 'Browser' : state?.kind === 'terminal' ? 'Terminal' : state?.kind === 'files' ? 'File Explorer' : 'Accessories'
    return <AccessoryHeaderProvider value={headerSlot}><div className="flex h-screen min-h-0 flex-col overflow-hidden bg-sparkle-bg text-sparkle-text">
        <AccessoryWindowHeader title={title} onClose={close} slotRef={setHeaderSlot} separated={state?.kind === 'terminal' || state?.kind === 'files'} />
        <main className="relative flex min-h-0 min-w-0 flex-1 overflow-hidden theme-adaptive">
            {error ? <div role="alert" className="absolute bottom-3 left-3 right-3 z-[90] flex items-center gap-3 rounded-lg border border-[var(--surface-divider)] bg-[var(--surface-floating)] px-3 py-2 text-[12px]"><span className="min-w-0 flex-1">{error}</span><button type="button" aria-label="Dismiss accessory error" onClick={() => setError('')}><X size={14} /></button></div> : null}
            <Suspense fallback={<AccessoryLoading />}>
                {!state ? !error ? <AccessoryLoading /> : null : state.kind === 'browser'
                    ? <AccessoryBrowser workspaceId={state.id} sessionMode={state.sessionMode} request={state.requests[0] || null} onRequestHandled={handled} onError={showError} onPreviewOpenChange={previewChanged} />
                    : state.kind === 'terminal' ? <AccessoryTerminal workspaceId={state.id} rootPath={state.rootPath} onError={showError} />
                        : <AccessoryFiles workspaceId={state.id} rootPath={state.rootPath} onError={showError} onPreviewOpenChange={previewChanged} />}
            </Suspense>
        </main>
        <ConfirmModal isOpen={confirmClose} title={`Close ${title}?`} message="Save any edits first. Closing this window discards unsaved file changes." confirmLabel="Close window" variant="warning" onCancel={() => setConfirmClose(false)} onConfirm={() => { allowClose.current = true; setConfirmClose(false); void window.devscope.window.close() }} />
    </div></AccessoryHeaderProvider>
}

function AccessoryLoading() {
    return <div role="status" className="flex min-h-0 flex-1 items-center justify-center gap-2 text-[12px] text-sparkle-text-secondary"><LoaderCircle size={16} className="animate-spin motion-reduce:animate-none" />Opening accessory…</div>
}
