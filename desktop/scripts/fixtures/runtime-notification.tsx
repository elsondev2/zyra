import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RuntimeActivationNotice } from '../../src/renderer/src/components/updates/RuntimeActivationNotice'
import { useRuntimeConnection } from '../../src/renderer/src/lib/runtime-connection'
import type { RuntimeActivationStatus } from '../../src/shared/runtime-activation'

const pendingUpdate = (): RuntimeActivationStatus => ({ phase: 'waiting', connection: 'connected', updatePending: true, errorCode: 'AGENT_SERVER_UPGRADE_BUSY', lastConfirmedAt: new Date().toISOString(), installation: { kind: 'development', label: 'Development' } })
let status = pendingUpdate()
const listeners = new Set<(state: RuntimeActivationStatus) => void>()
const noticeTimers = new Map<number, () => void>()
let noticeTimerId = 1_000_000
const originalTimeout = window.setTimeout.bind(window)
const originalClearTimeout = window.clearTimeout.bind(window)
window.setTimeout = ((handler: TimerHandler, delay?: number, ...args: unknown[]) => {
    if (delay === 6_000 && typeof handler === 'function') {
        const id = ++noticeTimerId
        noticeTimers.set(id, () => handler(...args))
        return id
    }
    return originalTimeout(handler, delay, ...args)
}) as typeof window.setTimeout
window.clearTimeout = (id?: number) => { noticeTimers.delete(id!); originalClearTimeout(id) }
;(window as any).devscope = { runtimeActivation: {
    getState: async () => status,
    onStateChange: (listener: (state: RuntimeActivationStatus) => void) => { listeners.add(listener); return () => listeners.delete(listener) }
} }
function ConnectionLabel() {
    const connection = useRuntimeConnection()
    return <span data-wordmark title={connection.detail} style={{ color: `var(--status-${connection.tone})` }}>Dev</span>
}
createRoot(document.getElementById('root')!).render(<StrictMode><ConnectionLabel /><RuntimeActivationNotice /></StrictMode>)
const pause = () => new Promise(resolve => setTimeout(resolve, 50))
const publish = async (next: RuntimeActivationStatus) => { status = next; for (const listener of listeners) listener(next); await pause() }
const assert = (condition: unknown, message: string) => { if (!condition) throw Error(message) }
;(window as any).runtimeNotificationPreview = async () => {
    await publish(pendingUpdate())
    assert(document.querySelector('[role="status"]'), 'Preview must contain the pending-update notice')
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
}
;(window as any).runtimeNotificationCheck = (async () => {
    for (let attempt = 0; attempt < 40 && !document.querySelector('[role="status"]'); attempt++) await pause()
    const wordmark = document.querySelector<HTMLElement>('[data-wordmark]')!
    assert(getComputedStyle(wordmark).color === 'rgb(70, 190, 130)', 'A connected Dev wordmark must stay green while an update is pending')
    const notice = document.querySelector<HTMLElement>('[role="status"]')!
    assert(notice, 'Pending update must have a notification')
    const bounds = notice.getBoundingClientRect()
    assert(bounds.left > window.innerWidth / 2 && Math.abs(window.innerWidth - bounds.right - 16) <= 1 && bounds.top >= 34 && bounds.top <= 64, 'Runtime notification belongs at the upper-right edge, below the title bar')
    assert(notice.textContent?.includes('running chats'), 'Pending update must explain what it is waiting for')
    const closeBounds = notice.querySelector('button')!.getBoundingClientRect()
    assert(document.elementFromPoint(closeBounds.x + closeBounds.width / 2, closeBounds.y + closeBounds.height / 2)?.closest('button'), 'Close button must receive pointer input')
    assert(document.activeElement?.tagName !== 'BUTTON', 'Notification must not steal keyboard focus')
    assert(getComputedStyle(notice).animationName === 'none' && getComputedStyle(notice).transitionDuration === '0s', 'Persistent notice must not slide or animate')
    assert(noticeTimers.size === 1, 'A deferred update must have one six-second auto-dismiss timer')
    await publish(pendingUpdate())
    for (const callback of noticeTimers.values()) callback()
    noticeTimers.clear()
    await pause()
    assert(!document.querySelector('[role="status"]'), 'Informational update must disappear after its timer')
    await publish({ ...pendingUpdate(), errorCode: undefined })
    assert(!document.querySelector('[role="status"]'), 'Heartbeat must not resurrect an expired update notification')
    await publish({ phase: 'ready', connection: 'connected', lastConfirmedAt: new Date().toISOString() })
    await publish(pendingUpdate())
    const close = document.querySelector<HTMLButtonElement>('button[aria-label="Dismiss notification"]')
    assert(close, 'Informational update must offer a close button')
    close!.click()
    await pause()
    assert(!document.querySelector('[role="status"]'), 'Close button must hide the informational update')
    await publish(pendingUpdate())
    assert(!document.querySelector('[role="status"]'), 'Heartbeat must respect manual dismissal')
    await publish({ phase: 'checking', connection: 'connecting' })
    const connectionNotice = document.querySelector<HTMLElement>('[role="status"]')!
    assert(connectionNotice, 'An unresolved connection problem must appear even after dismissing an update')
    assert(noticeTimers.size === 0, 'Connection problems must not expire automatically')
    const retryBounds = connectionNotice.getBoundingClientRect()
    assert(retryBounds.right === bounds.right && retryBounds.top === bounds.top, 'Status changes must keep the same notification anchor')
    await publish({ phase: 'failed', connection: 'disconnected' })
    assert(document.querySelector('[role="status"]') === connectionNotice, 'Unresolved failure must remain visible')
    assert(getComputedStyle(wordmark).color === 'rgb(230, 90, 100)', 'Disconnected wordmark must signal the lost connection')
    await publish({ phase: 'ready', connection: 'connected', lastConfirmedAt: new Date(Date.now() - 46_000).toISOString() })
    assert(document.querySelector('[role="status"]') === connectionNotice && connectionNotice.textContent?.includes('stale'), 'Stale connection must keep an explanatory notification')
    assert(getComputedStyle(wordmark).color === 'rgb(230, 170, 60)', 'Stale connection must not appear green')
    await publish({ phase: 'idle', connection: 'unknown' })
    assert(document.querySelector('[role="status"]') === connectionNotice, 'Unknown status must not dismiss an unresolved notification')
    await publish({ phase: 'checking', connection: 'connected', errorCode: 'AGENT_SERVER_HEARTBEAT_DELAYED', lastConfirmedAt: new Date().toISOString() })
    assert(wordmark.title === 'Connected · status delayed', 'Delayed heartbeat must distinguish a retained connection from reconnecting')
    assert(getComputedStyle(wordmark).color === 'rgb(230, 170, 60)', 'Delayed heartbeat warns without claiming the agent disconnected')
    await publish({ phase: 'ready', connection: 'connected', lastConfirmedAt: new Date().toISOString() })
    assert(!document.querySelector('[role="status"]'), 'Healthy connection with no pending update clears the notice')
    assert(getComputedStyle(wordmark).color === 'rgb(70, 190, 130)', 'Resolved connected wordmark stays green')
    return ['connected wordmark stays green during a pending update', 'notification stays at the upper-right edge without animation', 'informational update expires after six seconds', 'close button dismisses the update and heartbeats do not repeat it', 'connection problems persist through checking, failure and unknown status', 'disconnected and stale status never appear green', 'delayed heartbeat preserves connected identity and uses warning color', 'resolved state clears the notification']
})()
