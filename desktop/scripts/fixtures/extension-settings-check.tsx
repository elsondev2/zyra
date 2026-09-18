import { flushSync } from 'react-dom'
import type { Root } from 'react-dom/client'
import { ExtensionSettingsMenu } from '../../src/renderer/src/components/layout/ExtensionSettingsMenu'
import { browserBridgeJsonReplacer, browserBridgeJsonReviver } from '../../src/shared/browser-bridge-json'

export async function checkExtensionSettings(root: Root) {
    const assert = (condition: unknown, message: string) => { if (!condition) throw new Error(message) }
    const settle = () => new Promise(resolve => setTimeout(resolve, 30))
    const bytes = new Uint8Array(await (await fetch('./font.woff2')).arrayBuffer())
    const restored = JSON.parse(JSON.stringify({ data: bytes }, browserBridgeJsonReplacer), browserBridgeJsonReviver).data as Uint8Array
    const font = await new FontFace('Zyra bridge font fixture', restored.buffer as ArrayBuffer).load()
    document.fonts.add(font)
    assert(document.fonts.check('14px "Zyra bridge font fixture"'), 'the JSON round-trip font loads under extension CSP')
    const original = window.devscope
    const runtime = (globalThis as any).chrome.runtime
    const originalSend = runtime.sendMessage
    const opened: string[] = []
    let fail = false
    runtime.sendMessage = async (request: { type: string }) => { opened.push(request.type); return { ok: true } }
    ;(window as any).devscope = {
        assistant: { getAccountOverview: async () => ({ success: true, overview: { fetchedAt: '2026-09-17T00:00:00Z', rateLimits: { primary: { remainingPercent: 87, windowDurationMins: 10080 } } } }) },
        openDesktopSettings: async () => { if (fail) return { success: false, error: 'Desktop unavailable' }; opened.push('desktop-settings'); return { success: true } }
    }
    const button = (label: string) => [...document.querySelectorAll('button')].find(node => node.textContent === label)!
    try {
        flushSync(() => root.render(<ExtensionSettingsMenu />))
        flushSync(() => button('Settings').click())
        await settle()
        assert(document.body.textContent?.includes('7d: 87% left'), 'third option shows fetched remaining quota')
        assert(document.querySelectorAll('button').length === 3, 'only trigger and two destinations are buttons; quota is read-only')
        button('Extension settings').click()
        await settle()
        assert(opened[0] === 'open-console', 'extension settings opens its actual options page')
        flushSync(() => button('Settings').click())
        await settle()
        button('Desktop settings').click()
        await settle()
        assert(opened[1] === 'desktop-settings', 'desktop settings uses the desktop bridge, not the local router')
        fail = true
        flushSync(() => button('Settings').click())
        await settle()
        button('Desktop settings').click()
        await settle()
        assert(document.querySelector('[role="alert"]')?.textContent === 'Desktop unavailable', 'destination errors remain visible')
        button('Desktop settings').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
        await settle()
        assert(button('Settings').getAttribute('aria-expanded') === 'false', 'Escape closes the options')
        assert(document.activeElement === button('Settings'), 'Escape restores trigger focus')
    } finally {
        runtime.sendMessage = originalSend
        ;(window as any).devscope = original
        document.fonts.delete(font)
    }
}
