import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
const root = '../src/renderer/src/components/ui/file-preview/'
for (const file of ['PreviewModalHeader.tsx', 'PreviewExpandedHeaderBar.tsx']) {
    const source = readFileSync(new URL(root + file, import.meta.url), 'utf8')
    assert.doesNotMatch(source, /navigator\.clipboard/, `${file} must not copy through the unfocused opener document`)
    assert.match(source, /usePreviewPathCopy\(file\.path\)/)
}
const { copyPreviewPath } = await import('../src/renderer/src/components/ui/file-preview/copy-preview-path')
const calls: string[] = []
assert.equal(await copyPreviewPath('C:/fixture/contact.html', async path => { calls.push(path); return { success: true } }), true)
assert.deepEqual(calls, ['C:/fixture/contact.html'])
assert.equal(await copyPreviewPath('C:/fixture/contact.html', async () => ({ success: false })), false)
assert.equal(await copyPreviewPath('C:/fixture/contact.html', async () => { throw new Error('Document is not focused') }), false)
console.log('Preview path copy: trusted bridge wiring, exact path, confirmed success and handled failures: ok')
