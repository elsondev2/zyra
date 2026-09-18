import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { previewWindowMenuActions } from '../src/renderer/src/components/ui/file-preview/preview-window-menu'

const calls: string[] = []
const api = {
    window: { minimize: () => { calls.push('minimize') }, maximize: () => { calls.push('maximize') }, close: () => { calls.push('native-close') } },
    openDesktopSettings: async () => { calls.push('settings'); return { success: true } },
    openInExplorer: async (path: string) => { calls.push(`reveal:${path}`); return { success: true } },
    copyToClipboard: async (path: string) => { calls.push(`copy:${path}`); return { success: true } }
}
const props = { api, filePath: 'C:/fixture/QuickOpen.tsx', isMaximized: false,
    close: () => { calls.push('guarded-close') }, reload: () => { calls.push('reload') } }
const actions = previewWindowMenuActions(props)
for (const action of actions) await action.run()
assert.deepEqual(calls, ['reveal:C:/fixture/QuickOpen.tsx', 'copy:C:/fixture/QuickOpen.tsx', 'settings', 'reload', 'minimize', 'maximize', 'guarded-close'])
assert.equal(previewWindowMenuActions({ ...props, isMaximized: true }).find(action => action.id === 'maximize')?.label, 'Restore window')
const dirtyReload = previewWindowMenuActions({ ...props, isDirty: true }).find(action => action.id === 'reload')!
assert.equal(dirtyReload.disabled, true)
const count = calls.length
await dirtyReload.run()
assert.equal(calls.length, count, 'a reload cannot discard unsaved edits')
const failure = previewWindowMenuActions({ ...props, api: { ...api, openDesktopSettings: async () => ({ success: false, error: 'Settings unavailable' }) } }).find(action => action.id === 'settings')!
await assert.rejects(async () => failure.run(), /Settings unavailable/, 'menu failures reach the visible error state')
assert.equal(previewWindowMenuActions({ ...props, filePath: undefined }).some(action => action.id === 'reveal'), false)
const source = (name: string) => readFileSync(new URL(`../src/renderer/src/${name}`, import.meta.url), 'utf8')
const quickOpen = source('pages/QuickOpen.tsx')
assert.match(quickOpen, /!previewFile && <QuickPreviewTitleBar/, 'loaded files do not retain a second title row')
assert.match(quickOpen, /<QuickPreviewTitleBar title=\{previewFile.name\}/, 'lazy loading still has usable window controls')
const header = source('components/ui/file-preview/PreviewModalHeader.tsx')
assert.match(header, /data-standalone-preview-header/)
assert.match(header, /<PreviewAppMenu filePath=\{file.path\} isDirty=\{isDirty\} onClose=\{onClose\}/)
assert.match(header, /<PreviewWindowControls onClose=\{onClose\}/)
assert.match(header, /\[&_button\]:\[-webkit-app-region:no-drag\]/, 'the draggable header does not swallow toolbar button input')
for (const file of ['pages/QuickPreviewTitleBar.tsx', 'components/ui/file-preview/PreviewWindowChrome.tsx']) {
    const text = source(file)
    assert.doesNotMatch(text, /ZyraLogo|<pre\b/, 'preview chrome uses the normal wordmark, not ASCII artwork')
    new Bun.Transpiler({ loader: 'tsx' }).transformSync(text)
}
new Bun.Transpiler({ loader: 'tsx' }).transformSync(header)
console.log('Standalone preview: one row, Zyra menu, guarded actions, loading controls and draggable chrome: ok')
