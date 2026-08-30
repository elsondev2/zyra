import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { BrowserHistoryStore, isSensitiveBrowserHistoryQueryKey } from '../src/main/browser-history-store'

for (const key of ['client_secret', 'oauth_token', 'credential', 'x-amz-signature', 'X-Amz-Security-Token', 'authorization_code', 'state', 'private_key', 'access_key_id', 'aws_access_key_id']) {
    assert.equal(isSensitiveBrowserHistoryQueryKey(key), true, `${key} is treated as sensitive history state`)
}
assert.equal(isSensitiveBrowserHistoryQueryKey('client_id'), false, 'public OAuth client identifiers can remain in a useful history URL')
assert.equal(isSensitiveBrowserHistoryQueryKey('query'), false)

const root = await mkdtemp(join(tmpdir(), 'zyra-browser-history-'))
const filePath = join(root, 'browser-preview', 'history-v1.json')

try {
    const store = new BrowserHistoryStore(filePath)
    const first = await store.record({
        url: 'https://user:secret@example.com/docs?q=zyra&access_token=query-secret&client_secret=client-secret&oauth_token=oauth-secret&credential=credential-secret&x-amz-signature=signature-secret#fragment-secret',
        title: '  Example\nDocs  ',
        faviconUrl: 'https://icon-user:icon-secret@example.com/favicon.ico?token=favicon-secret&client_secret=icon-client-secret&oauth_token=icon-oauth-secret&credential=icon-credential-secret&x-amz-signature=icon-signature-secret#private-fragment'
    })
    assert.equal(first?.url, 'https://example.com/docs', 'a URL containing authentication material drops its complete query, credentials, and fragment before persistence')
    assert.equal(first?.title, 'example.com', 'titles accompanying authentication-bearing URLs are reduced to the site identity')
    assert.equal(first?.visitCount, 1)
    assert.equal(first?.faviconUrl, 'https://example.com/favicon.ico', 'favicon URLs receive the same credential and token stripping as page URLs')
    assert.equal(await store.record({ url: 'file:///private.txt', title: 'Private' }), null, 'non-web schemes never enter history')

    await Promise.all([
        store.record({ url: 'https://example.com/docs', title: 'Example Docs' }),
        store.record({ url: 'https://example.com/docs', title: 'Example Docs' })
    ])
    const counted = (await store.list({ query: 'example docs', limit: 5 }))[0]
    assert.equal(counted?.visitCount, 3, 'serialized concurrent visits preserve their complete count')

    const beforeMetadataUpdate = counted?.lastVisitedAt
    await store.record({
        url: 'https://example.com/docs',
        title: 'Updated documentation',
        faviconUrl: 'https://example.com/new.ico',
        incrementVisit: false
    })
    const metadataUpdated = (await store.list({ query: 'updated', limit: 5 }))[0]
    assert.equal(metadataUpdated?.visitCount, 3, 'late title and favicon updates do not invent visits')
    assert.equal(metadataUpdated?.lastVisitedAt, beforeMetadataUpdate, 'metadata updates preserve recency')
    assert.equal(metadataUpdated?.faviconUrl, 'https://example.com/new.ico')

    await store.record({ url: 'http://localhost:5174/', title: 'Local app' })
    assert.deepEqual((await store.list({ limit: 2 })).map((entry) => entry.title), ['Local app', 'Updated documentation'])

    const restoredStore = new BrowserHistoryStore(filePath)
    assert.equal((await restoredStore.list({ query: 'localhost', limit: 5 }))[0]?.title, 'Local app', 'history survives a store restart')

    const persisted = JSON.parse(await readFile(filePath, 'utf8')) as { version: number; entries: unknown[] }
    assert.equal(persisted.version, 1)
    assert.equal(Array.isArray(persisted.entries), true)
    assert.doesNotMatch(JSON.stringify(persisted), /secret/, 'persisted history never retains URL credentials')

    await restoredStore.clear()
    assert.deepEqual(await restoredStore.list(), [], 'explicit clear removes all Browser history')
    assert.equal(await restoredStore.record({ url: 'https://example.com/docs', title: 'Late metadata', incrementVisit: false }), null, 'late metadata cannot recreate history after an explicit clear')

    const suppressionStore = new BrowserHistoryStore(join(root, 'browser-preview', 'suppressed-history-v1.json'))
    suppressionStore.suppressRecordingFor(50)
    assert.equal(await suppressionStore.record({ url: 'https://example.com/during-clear', title: 'During clear' }), null, 'profile-reset suppression rejects racing visits in main')
    await new Promise((resolve) => setTimeout(resolve, 60))
    assert.equal((await suppressionStore.record({ url: 'https://example.com/after-clear', title: 'After clear' }))?.title, 'After clear', 'history recording resumes after the bounded reset window')

    const multiProfileStore = new BrowserHistoryStore(join(root, 'browser-preview', 'multi-profile-history-v1.json'))
    const earlyRows = Array.from({ length: 50_001 }, () => ({ url: 'https://first-profile.example/', title: 'First profile', visitCount: 1, lastVisitedAt: '2026-01-01T00:00:00.000Z' }))
    await multiProfileStore.importEntries([...earlyRows, { url: 'https://later-profile.example/', title: 'Later selected profile', visitCount: 2, lastVisitedAt: '2026-02-01T00:00:00.000Z' }])
    assert.equal((await multiProfileStore.list({ query: 'later selected', limit: 5 }))[0]?.url, 'https://later-profile.example/', 'rows from later selected profiles cannot disappear behind a 50k profile-order cutoff')

    const authenticationMigrationPath = join(root, 'browser-preview', 'authentication-migration-v1.json')
    await writeFile(authenticationMigrationPath, JSON.stringify({
        version: 1,
        entries: [{
            url: 'https://accounts.google.com/signin/oauth/consent?client_id=public-client&part=provider-state&rapt=one-time-proof&flowName=OAuthFlow',
            title: '654321 - your login code - person@example.com',
            faviconUrl: null,
            lastVisitedAt: '2026-02-01T00:00:00.000Z',
            visitCount: 1
        }, {
            url: 'https://app.example/finish?SAMLResponse=encoded-assertion',
            title: '987654 - temporary access for account@example.com',
            faviconUrl: null,
            lastVisitedAt: '2026-02-02T00:00:00.000Z',
            visitCount: 1
        }]
    }), 'utf8')
    const authenticationMigrationStore = new BrowserHistoryStore(authenticationMigrationPath)
    const migratedAuthenticationEntries = await authenticationMigrationStore.list()
    assert.equal(migratedAuthenticationEntries.find((entry) => entry.url.includes('accounts.google.com'))?.url, 'https://accounts.google.com/signin/oauth/consent', 'authentication history drops the complete provider query')
    assert.equal(migratedAuthenticationEntries.find((entry) => entry.url.includes('accounts.google.com'))?.title, 'accounts.google.com', 'authentication history never persists codes or account labels from page titles')
    assert.equal(migratedAuthenticationEntries.find((entry) => entry.url.includes('app.example'))?.url, 'https://app.example/finish', 'query-only SAML flows are classified as authentication metadata')
    assert.equal(migratedAuthenticationEntries.find((entry) => entry.url.includes('app.example'))?.title, 'app.example', 'query-only authentication titles are reduced to their site identity')
    const migratedAuthenticationFile = await readFile(authenticationMigrationPath, 'utf8')
    assert.doesNotMatch(migratedAuthenticationFile, /654321|987654|provider-state|one-time-proof|encoded-assertion|person@example\.com|account@example\.com/, 'read-only history access eagerly rewrites legacy authentication metadata')

    const boundedPath = join(root, 'browser-preview', 'bounded-history-v1.json')
    await writeFile(boundedPath, JSON.stringify({
        version: 1,
        entries: Array.from({ length: 1_005 }, (_, index) => ({
            url: `https://example.com/page-${index}`,
            title: `Page ${index}`,
            faviconUrl: null,
            lastVisitedAt: new Date(Date.UTC(2026, 0, 1, 0, 0, index)).toISOString(),
            visitCount: 1
        }))
    }), 'utf8')
    const boundedStore = new BrowserHistoryStore(boundedPath)
    await boundedStore.record({ url: 'https://example.com/newest', title: 'Newest' })
    const boundedFile = JSON.parse(await readFile(boundedPath, 'utf8')) as { entries: unknown[] }
    assert.equal(boundedFile.entries.length, 1_000, 'history persistence never exceeds its hard entry bound')

    await writeFile(filePath, '{broken json', 'utf8')
    const corruptStore = new BrowserHistoryStore(filePath)
    assert.deepEqual(await corruptStore.list(), [], 'corrupt optional history fails closed without breaking Browser startup')

    console.log('Browser history store: ok')
} finally {
    await rm(root, { force: true, recursive: true })
}
