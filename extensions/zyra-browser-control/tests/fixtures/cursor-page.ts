import { cursorPageTask } from '../../src/extension/cursor-page'
import { createCursorFavicon } from '../../src/extension/cursor-favicon'

// Run the same serialized functions as Runtime.evaluate, without bundle closures.
const page = new Function(`return (${cursorPageTask.toString()})`)() as typeof cursorPageTask
const favicon = new Function(`return (${createCursorFavicon.toString()})`)() as typeof createCursorFavicon
const appearance = { light: { primary: '#16c8e8', secondary: '#16c8e8' }, dark: { primary: '#16c8e8', secondary: '#16c8e8' }, reduceMotion: true }
const check = (condition: unknown, message: string) => { if (!condition) throw new Error(message) }
const nativeTimeout = window.setTimeout.bind(window)
const settle = () => new Promise(resolve => nativeTimeout(resolve, 50))
const host = () => document.querySelector<HTMLElement>('[data-zyra-browser-cursor]')
const badge = () => document.head.querySelector<HTMLLinkElement>('[data-zyra-control-favicon]')
const run = (command = 'cursor:update', extra = {}) => page(command, { x: 90, y: 95, phase: 'idle', appearance, ...extra }, favicon)
const makePng = (color: string) => {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 32
  const ctx = canvas.getContext('2d')!; ctx.fillStyle = color; ctx.fillRect(0, 0, 32, 32)
  return canvas.toDataURL()
}

;(window as any).cursorChecks = (async () => {
  const results: string[] = []
  let expiry: (() => void) | undefined
  // The native timer is covered by the controller tests. Here we invoke its expiry
  // deterministically so the entire real-DOM suite takes less than a second.
  window.setTimeout = ((fn: () => void, delay: number) => { check(delay === 5000, 'only the orphan lease should schedule a timer'); expiry = fn; return 1 }) as typeof window.setTimeout
  const oldClear = window.clearTimeout
  window.clearTimeout = () => { expiry = undefined }
  const original = document.createElement('link')
  original.rel = 'shortcut icon'; original.type = 'image/png'; original.setAttribute('sizes', '16x16')
  const red = makePng('#ff0000'), blue = makePng('#0000ff')
  original.href = red; document.head.append(original)
  try {
    run('cursor:appearance')
    check(!host() && !badge(), 'appearance updates must not start presence')
    run()
    await settle()
    check(host() && badge(), 'cursor and favicon must appear together')
    check(original.href !== red && original.href === badge()!.href, 'all favicon candidates must get the badge')
    const decoded = new Image(); decoded.src = badge()!.href; await decoded.decode()
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 32
    const ctx = canvas.getContext('2d')!; ctx.drawImage(decoded, 0, 0)
    const base = ctx.getImageData(4, 4, 1, 1).data, pointer = ctx.getImageData(20, 20, 1, 1).data
    check(base[0] > 240 && base[1] < 10, 'original website icon must remain visible beneath the cursor')
    check(pointer[0] < 40 && pointer[1] > 180, 'cursor overlay must be drawn on the favicon')
    decoded.id = 'favicon-preview'; decoded.style.cssText = 'width:96px;height:96px;image-rendering:pixelated'; document.body.append(decoded)
    results.push('composited site favicon retains its artwork and adds the cursor')

    run('cursor:update', { phase: 'dragging' })
    for (let i = 0; i < 15; i++) run('cursor:keepalive', { phase: undefined })
    const state = (globalThis as any).__zyraCursor
    check(state.pointer.dataset.phase === 'dragging', 'renewal must not reset an in-progress gesture')
    check(state.pointer.style.transitionDuration === '0ms', 'reduced motion must still work')
    Object.defineProperty(document, 'hidden', { configurable: true, value: true })
    document.dispatchEvent(new Event('visibilitychange'))
    check(host() && badge(), 'switching away must not clear the controlled tab indicator')
    delete (document as any).hidden
    results.push('idle renewal, gesture phase and background-tab presence')

    original.href = blue
    const alternate = document.createElement('link'); alternate.rel = 'icon'; alternate.href = red
    document.head.append(alternate)
    await settle()
    check(original.href === badge()!.href && alternate.href === badge()!.href, 'site favicon changes must retain the control badge')
    run('cursor:destroy')
    check(!host() && !badge(), 'release must remove both indicators')
    check(original.href === blue && original.getAttribute('sizes') === '16x16' && original.type === 'image/png', 'release must restore the latest site icon and attributes')
    check(alternate.href === red && !alternate.hasAttribute('sizes') && !alternate.hasAttribute('type'), 'added icon attributes must restore exactly')
    alternate.remove()
    results.push('dynamic website favicons and exact attribute restoration')

    run()
    original.href = red; original.type = 'image/x-icon'; original.setAttribute('sizes', '64x64')
    run('cursor:destroy') // Before the mutation observer can deliver its callback.
    check(original.href === red && original.type === 'image/x-icon' && original.getAttribute('sizes') === '64x64', 'cleanup must not overwrite a pending website mutation')
    await settle(); check(!badge(), 'late image callbacks must not resurrect a released indicator')
    results.push('pending mutations and late image callbacks are safe on release')

    run(); await settle()
    check(!!expiry, 'presence must retain a bounded orphan-cleanup lease')
    expiry!()
    check(!host() && !badge() && original.href === red, 'lost worker/debugger must expire and restore the icon')
    run(); window.dispatchEvent(new Event('pagehide'))
    check(!host() && !badge(), 'navigation/pagehide must dispose old-document state')
    run('cursor:keepalive', { phase: undefined })
    check(host() && badge(), 'renewal must restore presence in a replacement document')
    run('cursor:destroy')
    results.push('orphan expiry, pagehide and next-document restoration')

    original.remove()
    run(); check(!!badge(), 'pages without icons still get a cursor badge')
    run('cursor:destroy'); check(!document.head.querySelector('link[rel~=icon]'), 'fallback badge must not leave a favicon behind')
    results.push('no-icon fallback and complete cleanup')
    return results
  } finally {
    run('cursor:destroy'); original.remove()
    window.setTimeout = nativeTimeout; window.clearTimeout = oldClear
  }
})()
