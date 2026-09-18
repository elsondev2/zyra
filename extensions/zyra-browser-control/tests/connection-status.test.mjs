import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { transform } from 'esbuild'

const root = new URL('../', import.meta.url)
const source = async (path) => readFile(new URL(path, root), 'utf8')

test('reused loopback addresses cannot silently select another installation', async () => {
  const { code } = await transform(await source('src/connection-identity.ts'), { loader: 'ts', format: 'esm' })
  const { readConnectionIdentity } = await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'))
  const metadata = { instance: { namespaceId: 'dev-123' }, installation: { kind: 'development', label: 'Development-worktree', token: 'private' } }
  assert.equal(readConnectionIdentity(metadata, 'dev-123').runtimeStatus.installation.label, 'Development-worktree')
  assert.equal(readConnectionIdentity({ installation: { kind: 'development', label: 'Development', namespaceId: 'dev-123' } }, 'dev-123').namespaceId, 'dev-123', 'the host identifies its installation even before its service starts')
  assert.throws(() => readConnectionIdentity(metadata, 'prod-456'), /different Zyra instance/)
  assert.throws(() => readConnectionIdentity({}, 'dev-123'), /different Zyra instance/)
  assert.ok(!JSON.stringify(readConnectionIdentity(metadata)).includes('private'))
})

test('cached pairing remains connecting until an authenticated poll confirms it', async () => {
  const worker = await source('src/service-worker.ts')
  const pairing = await source('src/pairing.ts')

  assert.match(worker, /Stored credentials establish only a reconnect attempt/)
  assert.match(worker, /connecting = true; beginPolling\(\)/)
  assert.doesNotMatch(worker, /if \(session && !paused\) \{ connected = true/)
  assert.match(pairing, /const result = await authenticatedPost\(session, '\/v1\/poll', \{\}\)/)
  assert.match(pairing, /await handleConfirmed\?\.\(session\)/)
  assert.match(worker, /connected = true; connecting = false; lastError = null; lastConfirmedAt = new Date\(\)\.toISOString\(\)/)
})

test('poll failure clears liveness and automatic reconnect stays on the selected broker', async () => {
  const worker = await source('src/service-worker.ts')
  const pairing = await source('src/pairing.ts')

  assert.match(pairing, /await clearPairingSession\(\)/)
  assert.match(worker, /lastError = reason instanceof Error \? reason\.message : 'Zyra Desktop is unavailable\.'/)
  assert.match(worker, /await disconnect\(false\)/)
  assert.match(pairing, /const candidates = requestedOrigin \? \[requestedOrigin\] : \['http:\/\/127\.0\.0\.1:47821','http:\/\/127\.0\.0\.1:47822'\]/)
  assert.match(worker, /expectedNamespaceId: selectedNamespaceId/)
  assert.match(worker, /selectedZyraNamespace/, 'the selected installation survives a service-worker restart')
})

test('connection copy identifies browser sharing rather than agent chat state', async () => {
  const view = await source('src/ui/ConnectionView.tsx')

  assert.match(view, /Browser sharing connected/)
  assert.match(view, /Desktop service: \$\{state\.clientOrigin\}/)
  assert.match(view, /not whether a Zyra chat or agent is running/)
})
