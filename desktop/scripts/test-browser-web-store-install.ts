import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { chromeWebStoreIdFromUrl } from '../src/shared/browser-web-store'
import { BrowserWebStoreInstall } from '../src/main/browser-web-store-install'
import type { BrowserExtensionRecord } from '../src/shared/browser-extensions'
import type { WebStoreInstallPresentation } from '../src/shared/browser-web-store'

const id = 'a'.repeat(32), other = 'b'.repeat(32)
const url = `https://chromewebstore.google.com/detail/example/${id}`
for (const valid of [url, `${url}?hl=en`, `https://chromewebstore.google.com/detail/${id}`, `https://chrome.google.com/webstore/detail/example/${id}`]) assert.equal(chromeWebStoreIdFromUrl(valid), id)
for (const invalid of [url.replace('https:', 'http:'), url.replace('.com/', '.com.evil.test/'), url.replace('https://', 'https://user:pass@'), `${url}/extra`, url.replace('/detail/', '/search/detail/'), url.replace('.com/', '.com:444/'), 'https://chromewebstore.google.com/category/extensions', `file:///detail/${id}`, `https://evil.test/detail/${id}`]) assert.equal(chromeWebStoreIdFromUrl(invalid), null, invalid)
const review = { id, name: 'Fixture extension', version: '1', permissions: ['storage'], hostPermissions: ['https://example.test/*'], warnings: ['Fixture warning'] } as BrowserExtensionRecord
function fixture() {
    const target = { url, document: 1, available: true }
    const calls: string[] = [], presentations: Array<WebStoreInstallPresentation | null> = []
    let confirm = async () => true, inspect = async () => review, approve = async () => review
    const flow = new BrowserWebStoreInstall({ current: () => target,
        installer: {
            inspectWebStore: async requested => { assert.equal(requested, id); calls.push('download'); return inspect() },
            approveWebStore: async requested => { assert.equal(requested, id); calls.push('approve'); return approve() },
            discardWebStore: async requested => { assert.equal(requested, id); calls.push('discard') }
        },
        present: async value => { presentations.push(value) },
        confirm: async value => { assert.equal(value, review); calls.push('confirm'); return confirm() },
        reportError: async () => { calls.push('error') }
    })
    return { flow, target, calls, presentations, request: () => presentations.at(-1)!.requestUrl,
        setConfirm: (fn: typeof confirm) => { confirm = fn }, setInspect: (fn: typeof inspect) => { inspect = fn }, setApprove: (fn: typeof approve) => { approve = fn } }
}
{
    const f = fixture(); await f.flow.refresh(); const request = f.request()
    await f.flow.request(`zyra-extension://install/${id}`)
    await f.flow.request(request.replace(id, other))
    assert.deepEqual(f.calls, [], 'unissued or mismatched requests cannot download')
    await f.flow.request(request)
    assert.deepEqual(f.calls, ['download', 'confirm', 'approve'])
    assert.deepEqual(f.presentations.map(p => p?.state), ['ready', 'downloading', 'reviewing', 'installed'])
    await f.flow.request(request)
    assert.equal(f.calls.length, 3, 'request is single use')
}
{
    const f = fixture(); f.setConfirm(async () => false); await f.flow.refresh(); await f.flow.request(f.request())
    assert.deepEqual(f.calls, ['download', 'confirm', 'discard'])
    assert.equal(f.presentations.at(-1)?.state, 'ready')
}
for (const phase of ['download', 'confirm'] as const) {
    const f = fixture(); let resolve!: (value: any) => void
    if (phase === 'download') f.setInspect(() => new Promise(done => { resolve = done }))
    else f.setConfirm(() => new Promise(done => { resolve = done }))
    await f.flow.refresh(); const request = f.request(); const work = f.flow.request(request)
    for (let i = 0; i < 12; i++) await Promise.resolve()
    await f.flow.request(request)
    assert.equal(f.calls.filter(call => call === 'download').length, 1, 'double click cannot download twice')
    f.target.document++; f.target.url = `https://chromewebstore.google.com/detail/${other}`
    await f.flow.refresh(); resolve(phase === 'download' ? review : true); await work
    assert.ok(!f.calls.includes('approve'), 'navigation cancels stale approval')
    assert.equal(f.calls.at(-1), 'discard')
    assert.equal(f.presentations.at(-1)?.id, other)
}
{
    const f = fixture(); f.setInspect(async () => { throw new Error('Existing review') }); await f.flow.refresh(); await f.flow.request(f.request())
    assert.deepEqual(f.calls, ['download', 'error'], 'failed acquisition cannot discard another caller’s pending review')
    assert.equal(f.presentations.at(-1)?.state, 'error')
    f.setInspect(async () => review); await f.flow.request(f.request()); assert.equal(f.calls.at(-1), 'approve')
}
{
    const f = fixture(); f.setApprove(async () => { throw new Error('Unsupported API') }); await f.flow.refresh(); await f.flow.request(f.request())
    assert.deepEqual(f.calls, ['download', 'confirm', 'approve', 'error', 'discard'])
}
for (const mutate of [(f: ReturnType<typeof fixture>) => { f.target.available = false }, (f: ReturnType<typeof fixture>) => { f.target.url = 'https://evil.test' }, (f: ReturnType<typeof fixture>) => { f.target.document++ }]) {
    const f = fixture(); await f.flow.refresh(); const request = f.request(); mutate(f); await f.flow.request(request); assert.deepEqual(f.calls, [])
}
const source = readFileSync(new URL('../src/main/browser-view-manager.ts', import.meta.url), 'utf8')
assert.match(source, /executeJavaScriptInIsolatedWorld\(998/)
assert.match(source, /if \(!redirect\).*webStoreInstalls.get\(record\)\?\.request/)
assert.match(source, /did-navigate-in-page[\s\S]*?injectChromeWebStoreInstallControl\(record\)/)
assert.match(source, /defaultId: 1, cancelId: 1/)
assert.match(source, /BROWSER_VIEW_IPC\.refreshTheme[\s\S]*?injectChromeWebStoreInstallControl\(record\)/)
const appSource = readFileSync(new URL('../src/renderer/src/App.tsx', import.meta.url), 'utf8')
assert.match(appSource, /addEventListener\(ZYRA_THEME_CHANGED_EVENT, refreshBrowserTheme\)/)
assert.match(appSource, /refreshBrowserTheme = \(\) => window\.devscope\.browserView\.refreshTheme\(\)/)
const manager = readFileSync(new URL('../src/main/browser-extension-manager.ts', import.meta.url), 'utf8')
assert.match(manager, /if \(this.pending.has\(id\)\) throw/)
console.log('Web Store install: exact HTTPS listings, single-use requests, permission review, cancellation, navigation, retry and isolated injection: PASS')
