import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

test('manifest uses explicit activeTab access without broad host or debugger permissions', async () => {
  const manifest = JSON.parse(await readFile(path.join(root, 'manifest.json'), 'utf8'))
  assert.equal(manifest.manifest_version, 3)
  assert.deepEqual(manifest.permissions, ['activeTab', 'scripting', 'storage', 'webNavigation'])
  assert.equal(manifest.host_permissions, undefined)
  assert.deepEqual(manifest.optional_host_permissions, ['http://127.0.0.1/*'])
  assert.equal(manifest.permissions.includes('debugger'), false)
  assert.equal(JSON.stringify(manifest).includes('<all_urls>'), false)
})

test('URL policy rejects browser-internal and non-http pages', async () => {
  const protocol = await import(pathToFileURL(path.join(root, 'dist', 'unpacked', 'protocol.js')).href)
  assert.equal(protocol.isAllowedPageUrl('https://example.com/path'), true)
  assert.equal(protocol.isAllowedPageUrl('http://127.0.0.1:5173/'), true)
  assert.equal(protocol.isAllowedPageUrl('chrome://settings'), false)
  assert.equal(protocol.isAllowedPageUrl('file:///C:/secret.txt'), false)
})

test('extension sources keep bearer credentials out of query strings and persistent local storage', async () => {
  const pairing = await readFile(path.join(root, 'src', 'pairing.ts'), 'utf8')
  assert.match(pairing, /authorization: `Bearer/)
  assert.doesNotMatch(pairing, /[?&](?:token|secret|credential)=/i)
  assert.match(pairing, /chrome\.storage\.session/)
  assert.doesNotMatch(pairing, /chrome\.storage\.local\.set/)
})

test('exact-tab and sensitive-field guards are present in executable sources', async () => {
  const tabGrants = await readFile(path.join(root, 'src', 'tab-grants.ts'), 'utf8')
  const serviceWorker = await readFile(path.join(root, 'src', 'service-worker.ts'), 'utf8')
  const observer = await readFile(path.join(root, 'src', 'content-observer.ts'), 'utf8')
  const action = await readFile(path.join(root, 'src', 'action-runner.ts'), 'utf8')
  assert.match(tabGrants, /requireExactTab/)
  assert.match(tabGrants, /documentId/)
  assert.match(tabGrants, /changeInfo\.url \|\| changeInfo\.status === 'loading'/)
  assert.match(tabGrants, /webNavigation\.onCommitted/)
  assert.match(tabGrants, /details\.frameId === 0/)
  assert.match(serviceWorker, /import \{[^}]*sendEvent[^}]*\} from '\.\/pairing\.js'/)
  assert.match(serviceWorker, /startPolling\(handleBrokerOperation, \(\) => revokeAllTabs\(\{ notify: false \}\)\)/)
  assert.match(serviceWorker, /sendEvent\(\{ type: 'session\.disconnect' \}\)/)
  assert.match(observer, /role === 'password'/)
  assert.match(action, /stale observation/)
  assert.match(action, /external side effect/)
})

test('same-URL top-level document commits revoke exact-tab grants', async () => {
  const values = {
    zyraExactTabGrantsV1: {
      '41': { tabId: 41, documentId: 'document:one', url: 'https://example.test/', grantedAt: Date.now() }
    }
  }
  let onCommitted
  globalThis.chrome = {
    storage: {
      session: {
        get: async (key) => ({ [key]: values[key] }),
        set: async (next) => Object.assign(values, next),
        remove: async (key) => { delete values[key] }
      }
    },
    tabs: {
      onRemoved: { addListener() {} },
      onUpdated: { addListener() {} }
    },
    webNavigation: { onCommitted: { addListener(listener) { onCommitted = listener } } }
  }
  try {
    const tabGrants = await import(`${pathToFileURL(path.join(root, 'dist', 'unpacked', 'tab-grants.js')).href}?document=${Date.now()}`)
    onCommitted({ tabId: 41, frameId: 1, url: 'https://example.test/' })
    await new Promise((resolve) => setTimeout(resolve, 0))
    assert.equal((await tabGrants.listTabGrants()).length, 1)
    onCommitted({ tabId: 41, frameId: 0, url: 'https://example.test/' })
    await new Promise((resolve) => setTimeout(resolve, 0))
    assert.deepEqual(await tabGrants.listTabGrants(), [])
  } finally {
    delete globalThis.chrome
  }
})

test('disconnect cleanup removes every exact-tab grant from session storage', async () => {
  const values = {
    zyraExactTabGrantsV1: {
      '41': { tabId: 41, documentId: 'document:one', url: 'https://example.test/', grantedAt: Date.now() },
      '42': { tabId: 42, documentId: 'document:two', url: 'http://127.0.0.1/', grantedAt: Date.now() }
    }
  }
  globalThis.chrome = {
    storage: {
      session: {
        get: async (key) => ({ [key]: values[key] }),
        set: async (next) => Object.assign(values, next),
        remove: async (key) => { delete values[key] }
      }
    },
    tabs: {
      onRemoved: { addListener() {} },
      onUpdated: { addListener() {} }
    },
    webNavigation: { onCommitted: { addListener() {} } }
  }
  try {
    const tabGrants = await import(`${pathToFileURL(path.join(root, 'dist', 'unpacked', 'tab-grants.js')).href}?cleanup=${Date.now()}`)
    assert.equal((await tabGrants.listTabGrants()).length, 2)
    assert.deepEqual(await tabGrants.revokeAllTabs({ notify: false }), { revoked: 2 })
    assert.deepEqual(await tabGrants.listTabGrants(), [])
    assert.equal(values.zyraExactTabGrantsV1, undefined)
  } finally {
    delete globalThis.chrome
  }
})
