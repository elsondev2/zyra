import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { BrowserBookmarksStore, getBrowserBookmarksFilePath } from '../src/main/browser-bookmarks-store'

const root = await mkdtemp(join(tmpdir(), 'zyra-browser-bookmarks-'))
const filePath = getBrowserBookmarksFilePath(root)

try {
    const store = new BrowserBookmarksStore(filePath)
    assert.deepEqual(await store.list(), [])
    assert.equal(await store.save({ url: 'file:///private.txt', title: 'Private' }), null)
    const saved = await store.save({
        url: 'https://user:secret@example.com/docs?access_token=secret#fragment',
        title: 'Private auth title',
        faviconUrl: 'https://user:secret@example.com/favicon.ico?token=secret'
    })
    assert.equal(saved?.url, 'https://example.com/docs')
    assert.equal(saved?.title, 'example.com')
    assert.equal(saved?.faviconUrl, 'https://example.com/favicon.ico')
    await store.save({ url: 'https://example.com/docs', title: 'Documentation' })
    assert.equal((await store.list()).length, 1, 'saving a matching URL updates rather than duplicates it')
    assert.equal((await store.list())[0].title, 'Documentation')

    const restored = new BrowserBookmarksStore(filePath)
    assert.equal((await restored.list())[0].title, 'Documentation', 'bookmarks survive restart')
    assert.doesNotMatch(await readFile(filePath, 'utf8'), /secret|fragment|Private auth title/, 'auth data is not persisted')
    assert.equal(await restored.remove('https://example.com/docs'), true)
    assert.deepEqual(await restored.list(), [])
    assert.equal(await restored.remove('https://example.com/docs'), false)
} finally {
    await rm(root, { recursive: true, force: true })
}

console.log('Browser bookmarks store tests passed')
