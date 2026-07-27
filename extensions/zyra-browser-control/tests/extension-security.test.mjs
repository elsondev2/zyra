import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

test('manifest uses explicit activeTab access without broad host or debugger permissions', async () => {
  const manifest = JSON.parse(await readFile(path.join(root, 'manifest.json'), 'utf8'))
  assert.equal(manifest.manifest_version, 3)
  assert.deepEqual(manifest.permissions, ['activeTab', 'scripting', 'storage'])
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
  const observer = await readFile(path.join(root, 'src', 'content-observer.ts'), 'utf8')
  const action = await readFile(path.join(root, 'src', 'action-runner.ts'), 'utf8')
  assert.match(tabGrants, /requireExactTab/)
  assert.match(tabGrants, /documentId/)
  assert.match(tabGrants, /if \(changeInfo\.url\) void revokeTab\(tabId\)/)
  assert.match(observer, /role === 'password'/)
  assert.match(action, /stale observation/)
  assert.match(action, /external side effect/)
})
