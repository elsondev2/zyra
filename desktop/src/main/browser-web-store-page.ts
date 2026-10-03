import type { chromeWebStoreIdFromUrl, WebStoreInstallPresentation, WebStoreInstallTheme } from '../shared/browser-web-store'

/** Serialized into an isolated world. The website receives no Node, preload, or IPC bridge. */
export function renderWebStoreInstall(presentation: WebStoreInstallPresentation | null, listingId: typeof chromeWebStoreIdFromUrl, theme: WebStoreInstallTheme): void {
    type State = { update(value: WebStoreInstallPresentation, theme: WebStoreInstallTheme): void; dispose(): void }
    const scope = globalThis as typeof globalThis & { __zyraWebStoreInstall?: State }
    if (!presentation || listingId(location.href) !== presentation.id) {
        scope.__zyraWebStoreInstall?.dispose()
        return
    }
    if (scope.__zyraWebStoreInstall) { scope.__zyraWebStoreInstall.update(presentation, theme); return }
    let value = presentation
    const host = document.createElement('span')
    host.dataset.zyraWebStoreInstall = ''
    host.style.cssText = 'display:inline-flex;vertical-align:middle;margin-left:8px;'
    const shadow = host.attachShadow({ mode: 'closed' })
    const style = document.createElement('style')
    style.textContent = `
        :host{all:initial}
        button{display:inline-flex;align-items:center;gap:7px;min-height:40px;padding:0 16px;border:1px solid color-mix(in srgb,var(--zyra-accent) 62%,var(--zyra-background));border-radius:7px;background:color-mix(in srgb,var(--zyra-accent) 13%,var(--zyra-background));color:var(--zyra-accent);font:600 13px/1.2 var(--zyra-font);cursor:pointer;white-space:nowrap;box-shadow:inset 0 1px 0 color-mix(in srgb,var(--zyra-accent) 18%,transparent),0 1px 2px color-mix(in srgb,var(--zyra-accent) 12%,transparent);transition:background-color 120ms ease,border-color 120ms ease,box-shadow 120ms ease}
        button:hover:enabled{border-color:color-mix(in srgb,var(--zyra-accent) 82%,var(--zyra-background));background:color-mix(in srgb,var(--zyra-accent) 20%,var(--zyra-background));box-shadow:0 0 0 2px color-mix(in srgb,var(--zyra-accent) 12%,transparent),inset 0 1px 0 color-mix(in srgb,var(--zyra-accent) 22%,transparent)}
        button:active:enabled{background:color-mix(in srgb,var(--zyra-accent) 26%,var(--zyra-background));box-shadow:inset 0 1px 2px color-mix(in srgb,var(--zyra-background) 35%,transparent)}
        button:focus-visible{outline:2px solid var(--zyra-accent);outline-offset:3px}
        button:disabled{cursor:default;opacity:.8}svg{width:17px;height:17px;flex-shrink:0}
        @media(prefers-reduced-motion:reduce){button{transition:none}}
    `
    const button = document.createElement('button')
    button.type = 'button'
    const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    icon.setAttribute('viewBox', '0 0 24 24'); icon.setAttribute('fill', 'none')
    icon.setAttribute('stroke', 'currentColor'); icon.setAttribute('stroke-width', '2'); icon.setAttribute('aria-hidden', 'true')
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path')
    path.setAttribute('d', 'M12 3v12m-5-5 5 5 5-5M5 16v5h14v-5')
    icon.append(path)
    const label = document.createElement('span')
    label.setAttribute('aria-live', 'polite')
    button.append(icon, label); shadow.append(style, button)
    let scheduled = 0
    const position = () => {
        cancelAnimationFrame(scheduled)
        scheduled = 0
        if (listingId(location.href) !== value.id) { state.dispose(); return }
        const nativeButton = Array.from(document.querySelectorAll<HTMLElement>('button, a[role="button"]'))
            .find(element => /^(Add to Chrome|Remove from Chrome)$/i.test(element.textContent?.trim() || ''))
        observer.disconnect()
        if (nativeButton?.parentElement) {
            host.style.cssText = 'display:inline-flex;vertical-align:middle;margin-left:8px;'
            if (nativeButton.nextElementSibling !== host) nativeButton.after(host)
        } else {
            // Wait for the store's install row rather than floating over unrelated controls.
            host.remove()
        }
        observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true })
    }
    const observer = new MutationObserver(() => { if (!scheduled) scheduled = requestAnimationFrame(position) })
    const events = new AbortController()
    const state: State = {
        update(next, colors) {
            value = next
            button.style.setProperty('--zyra-accent', colors.accent)
            button.style.setProperty('--zyra-background', colors.background)
            button.style.setProperty('--zyra-font', colors.fontFamily)
            button.style.colorScheme = colors.colorScheme
            const labels = { ready: 'Add to Zyra', downloading: 'Downloading…', reviewing: 'Review permissions…', installed: 'Added to Zyra', error: 'Try again' }
            label.textContent = labels[next.state]
            button.disabled = !['ready', 'error'].includes(next.state)
            button.setAttribute('aria-busy', String(['downloading', 'reviewing'].includes(next.state)))
            button.title = next.state === 'installed' ? 'Installed. Reload open websites to use this extension.' : 'Install this extension in Zyra Browser'
            position()
        },
        dispose() {
            observer.disconnect(); cancelAnimationFrame(scheduled); events.abort(); host.remove()
            if (scope.__zyraWebStoreInstall === state) delete scope.__zyraWebStoreInstall
        }
    }
    button.addEventListener('click', event => {
        if (!event.isTrusted || button.disabled || listingId(location.href) !== value.id) return
        button.disabled = true
        label.textContent = 'Downloading…'
        location.href = value.requestUrl
    }, { signal: events.signal })
    window.addEventListener('pagehide', state.dispose, { signal: events.signal })
    scope.__zyraWebStoreInstall = state
    state.update(presentation, theme)
}
