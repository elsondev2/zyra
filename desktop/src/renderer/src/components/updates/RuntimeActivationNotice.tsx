import { useRef } from 'react'
import { AlertTriangle, Info, X } from 'lucide-react'
import { AnchoredNativeOverlay } from '@/components/ui/AnchoredNativeOverlay'
import type { RuntimeNotice } from '@/lib/runtime-connection-presentation'
import { useRuntimeNotice } from '@/lib/use-runtime-notice'

function NoticeContent({ notice, dismiss, measuring = false }: { notice: RuntimeNotice; dismiss: () => void; measuring?: boolean }) {
    const Icon = notice.tone === 'info' ? Info : AlertTriangle
    return <div role={measuring ? undefined : 'status'} aria-live={measuring ? undefined : 'polite'} aria-atomic="true" className="flex w-full items-start gap-2.5 rounded-md border border-[var(--surface-divider)] bg-[var(--surface-floating)] px-3 py-2.5 text-[12px] text-[var(--color-text)] shadow-lg">
        <Icon aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" style={{ color: `var(--status-${notice.tone})` }} />
        <div className="min-w-0 flex-1">
            <div className="font-medium leading-5">{notice.title}</div>
            <div className="mt-0.5 leading-[18px] text-[var(--color-text-muted)]">{notice.message}</div>
        </div>
        {notice.tone === 'info' && (measuring
            ? <span className="h-6 w-6 shrink-0" />
            : <button type="button" aria-label="Dismiss notification" onClick={dismiss} className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded text-[var(--color-text-muted)] hover:bg-[var(--surface-divider)] hover:text-[var(--color-text)] focus-visible:outline focus-visible:outline-1 focus-visible:outline-[var(--status-info)]"><X aria-hidden="true" className="h-3.5 w-3.5" /></button>)}
    </div>
}

export function RuntimeActivationNotice() {
    const { notice, dismiss } = useRuntimeNotice()
    const anchor = useRef<HTMLDivElement>(null)
    if (!notice) return null
    return <div ref={anchor} className="pointer-events-none fixed right-4 top-[50px] z-[200] w-[22rem] max-w-[calc(100vw-32px)]">
        <div aria-hidden="true" className="invisible"><NoticeContent notice={notice} dismiss={dismiss} measuring /></div>
        {/* Bound the clickable update notice to its own area; never focus it automatically. */}
        <AnchoredNativeOverlay anchorRef={anchor} scoped passive={notice.tone !== 'info'} autoFocus={false}>
            <NoticeContent notice={notice} dismiss={dismiss} />
        </AnchoredNativeOverlay>
    </div>
}
