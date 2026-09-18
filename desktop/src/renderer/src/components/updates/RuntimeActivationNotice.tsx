import { NativeOverlayPortal } from '@/components/ui/native-overlay-portal'
import { useRuntimeConnection } from '@/lib/runtime-connection'

export function RuntimeActivationNotice() {
    const { state, message } = useRuntimeConnection()
    const notice = message || (state.phase === 'restarting' ? 'Reconnecting to the updated runtime…' : null)
    if (!notice) return null
    return <NativeOverlayPortal passive><div role="status" className="fixed bottom-5 left-1/2 z-[200] max-w-[90vw] -translate-x-1/2 rounded-lg border border-[var(--surface-border)] bg-[var(--color-card)] px-4 py-3 text-[12px] text-sparkle-text shadow-lg">{notice}</div></NativeOverlayPortal>
}
