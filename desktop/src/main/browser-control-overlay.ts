import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MousePointer2 } from 'lucide-react'
import type { BrowserViewControlOverlay } from '../shared/browser-view'

const pointerMarkup = renderToStaticMarkup(createElement(MousePointer2, { size: 24, strokeWidth: 2, fill: 'none', 'aria-hidden': true }))

export function browserControlOverlayScript(overlay: BrowserViewControlOverlay): string {
    return `(${renderOverlay.toString()})(${JSON.stringify(overlay)}, ${JSON.stringify(pointerMarkup)})`
}

function renderOverlay(payload: BrowserViewControlOverlay, pointer: string): void {
    const runtime = globalThis as typeof globalThis & { __zyraControlOverlayState?: { host: HTMLElement; shadow: ShadowRoot } }
    let state = runtime.__zyraControlOverlayState
    if (!payload.controlled && !payload.cursor?.visible) {
        state?.host.remove()
        delete runtime.__zyraControlOverlayState
        return
    }
    if (!state?.host.isConnected) {
        const host = document.createElement('div')
        host.setAttribute('data-zyra-control-overlay', '')
        host.style.cssText = 'all:initial;position:fixed;inset:0;z-index:2147483647;pointer-events:none;overflow:hidden;contain:layout style paint;'
        const shadow = host.attachShadow({ mode: 'closed' })
        shadow.innerHTML = '<style>:host{all:initial}[hidden]{display:none!important}.frame{position:absolute;inset:0;border:1px solid rgba(103,232,249,.42);box-shadow:inset 0 0 20px rgba(34,211,238,.08)}.cursor{position:absolute;left:0;top:0;will-change:transform;transition:transform 80ms linear;font-family:system-ui,sans-serif}.cursor svg{position:relative;width:24px;height:24px;transform:translate(-4px,-4px);color:#67e8f9;filter:drop-shadow(0 1px 3px rgba(0,0,0,.85))}.label{position:absolute;left:14px;top:16px;white-space:nowrap;border:1px solid rgba(165,243,252,.28);border-radius:6px;background:rgba(2,6,23,.92);padding:3px 5px;color:#cffafe;font:600 8px/1 system-ui,sans-serif;letter-spacing:.06em;text-transform:uppercase;box-shadow:0 3px 8px rgba(0,0,0,.35)}@media(prefers-reduced-motion:reduce){.cursor{transition:none}}</style><div class="frame"></div><div class="cursor">' + pointer + '<span class="label"></span></div>'
        ;(document.documentElement || document.body).appendChild(host)
        state = { host, shadow }
        runtime.__zyraControlOverlayState = state
    }
    const frame = state.shadow.querySelector<HTMLElement>('.frame')!
    const cursor = state.shadow.querySelector<HTMLElement>('.cursor')!
    frame.hidden = !payload.controlled
    cursor.hidden = !payload.cursor?.visible
    if (payload.cursor?.visible) {
        cursor.style.transform = `translate3d(${payload.cursor.x}px,${payload.cursor.y}px,0)`
        state.shadow.querySelector('.label')!.textContent = payload.cursor.label + (payload.cursor.phase === 'idle' ? '' : ' · ' + payload.cursor.phase)
    }
}
