import assert from 'node:assert/strict'
import { navigateHtmlPreviewLink, resolveHtmlPreviewLink } from '../src/renderer/src/components/ui/file-preview/html-preview-links'
import { withHtmlPreviewLocation } from '../src/renderer/src/components/ui/file-preview/html-preview-location'
import { installDesktopLinkHandler } from '../src/renderer/src/lib/desktop-links'
import { createPreviewNavigationState, recordPreviewNavigationEntry, getPreviewNavigationTarget, movePreviewNavigationToIndex } from '../src/renderer/src/components/ui/file-preview/preview-navigation-history'
import type { PreviewNavigationEntry } from '../src/renderer/src/components/ui/file-preview/preview-navigation-history'
import type { PreviewOpenOptions } from '../src/renderer/src/components/ui/file-preview/types'

const source = 'C:/fixture/contact.html'
const opened: Array<{ file: { name: string; path: string }; extension: string; options?: PreviewOpenOptions }> = []
const web: string[] = []
const lookedUp: string[] = []
let exists = true
let directory = false
;(globalThis as any).window = { devscope: { getPathInfo: async (path: string) => {
    lookedUp.push(path)
    return { success: true, exists, type: directory ? 'directory' : 'file', path }
} } }
const uninstall = installDesktopLinkHandler(async url => { web.push(url); return { success: true } })
const openPreview = async (file: { name: string; path: string }, extension: string, options?: PreviewOpenOptions) => { opened.push({ file, extension, options }) }
const navigate = (href: string) => navigateHtmlPreviewLink({ href, filePath: source, openPreview })

assert.equal(await navigate('zyra:///C:/fixture/projects.html?view=cards#work'), true)
assert.equal(opened[0].file.path, 'C:/fixture/projects.html')
assert.equal(opened[0].extension, 'html')
assert.deepEqual(resolveHtmlPreviewLink('zyra://c/fixture/projects.html', source), { kind: 'local', path: 'c:/fixture/projects.html', location: { search: '', hash: '' } }, 'Chromium canonicalizes local drive URLs into single-letter authorities')
assert.deepEqual(opened[0].options?.htmlLocation, { search: '?view=cards', hash: '#work' })
assert.equal(opened[0].options?.revealNavigatorTarget, true)
assert.deepEqual(resolveHtmlPreviewLink('../other/a%20b%23c.html', source), { kind: 'local', path: 'C:/other/a b#c.html', location: { search: '', hash: '' } })
assert.deepEqual(resolveHtmlPreviewLink('file://server/share/a.html', source), { kind: 'local', path: '//server/share/a.html', location: { search: '', hash: '' } })
assert.equal(resolveHtmlPreviewLink('../b.html', '/tmp/site/a.html')?.kind, 'local')
assert.deepEqual(resolveHtmlPreviewLink('next.html', 'C:/site 100%/contact.html'), { kind: 'local', path: 'C:/site 100%/next.html', location: { search: '', hash: '' } })
assert.deepEqual(resolveHtmlPreviewLink('#part', source), { kind: 'fragment', hash: '#part' })
assert.equal(await navigate('https://example.test/guide'), true)
assert.deepEqual(web, ['https://example.test/guide'], 'web links use the existing desktop-link dispatcher')
const count = lookedUp.length
for (const href of ['javascript:alert(1)', 'data:text/html,bad', 'command:run', 'https://user:secret@example.test/', 'zyra://user:secret@server/a.html']) assert.equal(await navigate(href), false)
assert.equal(lookedUp.length, count, 'blocked URLs never probe files')
assert.equal(await navigate('guide.pdf'), true)
assert.equal(opened.at(-1)?.extension, 'pdf')
directory = true
assert.equal(await navigate('../docs/'), true)
assert.equal(opened.at(-1)?.options?.targetKind, 'directory')
directory = false
await assert.rejects(navigate('run.exe'), /cannot be previewed/, 'HTML links cannot launch executables through the unsupported-file fallback')
exists = false
await assert.rejects(navigate('missing.html'), /could not be found/)
exists = true
await assert.rejects(navigateHtmlPreviewLink({ href: 'next.html', filePath: source }), /unavailable/)
uninstall()
let active = true
let finishLookup!: (value: any) => void
;(window as any).devscope.getPathInfo = () => new Promise(resolve => { finishLookup = resolve })
const beforeStaleLookup = opened.length
const pending = navigateHtmlPreviewLink({ href: 'next.html', filePath: source, openPreview, isCurrent: () => active })
active = false
finishLookup({ success: true, exists: true, type: 'file', path: 'C:/fixture/next.html' })
await pending
assert.equal(opened.length, beforeStaleLookup, 'a late lookup cannot reopen a closed or replaced preview')

const preview = withHtmlPreviewLocation('zyra:///C:/fixture/projects.html?devscope-preview=stamp', { search: '?view=cards&devscope-preview=forged', hash: '#work' })
assert.equal(new URL(preview).searchParams.get('devscope-preview'), 'stamp')
assert.equal(new URL(preview).searchParams.get('view'), 'cards')
assert.equal(new URL(preview).hash, '#work')
const browserProjection = withHtmlPreviewLocation('http://localhost/file?path=safe', { search: '?path=other&view=x', hash: '' })
assert.equal(new URL(browserProjection).searchParams.get('path'), 'safe', 'transport-owned parameters cannot be replaced by an HTML href')

const entry = (path: string, hash = ''): PreviewNavigationEntry => ({ file: { path, name: path.split('/').pop()!, type: 'html', htmlLocation: { search: '', hash } }, extension: 'html', mediaItems: [] })
let history = createPreviewNavigationState(entry(source))
history = recordPreviewNavigationEntry(history, entry('C:/fixture/projects.html', '#work'))
assert.equal(getPreviewNavigationTarget(history, -1)?.entry.file.path, source)
history = movePreviewNavigationToIndex(history, 0)
assert.equal(getPreviewNavigationTarget(history, 1)?.entry.file.htmlLocation?.hash, '#work')
history = recordPreviewNavigationEntry(history, entry(source, '#details'))
assert.equal(history.entries.length, 2, 'new local destinations truncate the forward branch and retain HTML location')
console.log('HTML links: local files/folders, web dispatcher, safe protocols, no executable fallback, query/fragment preservation and Back/Forward: ok')
