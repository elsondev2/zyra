import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
import electron from 'electron'

const desktop = dirname(dirname(fileURLToPath(import.meta.url)))
const root = await mkdtemp(join(tmpdir(), 'zyra-google-import-test-'))
const bundle = join(root, 'provisioning.cjs')
const json = join(root, 'synthetic-client.json')
const id = '123456789012-abcdefghijklmnopqrst.apps.googleusercontent.com'
const secret = 'synthetic-desktop-client-secret'
const credentials = join(root, 'Zyra-dev', 'assistant', 'plugins', 'credentials')
const store = join(credentials, 'google-mcp-client.enc')
const tokenFile = join(credentials, 'mcp-oauth.enc')
async function run(args, cancel = false) {
    const env = { ...process.env, ZYRA_IMPORT_TEST_APPDATA: root, ZYRA_IMPORT_TEST_JSON: json, ZYRA_IMPORT_TEST_BUNDLE: bundle, ZYRA_IMPORT_TEST_CANCEL: cancel ? '1' : '0', ZYRA_GOOGLE_DESKTOP_CLIENT_ID: id, ZYRA_DEV_INSTANCE_SUFFIX: '' }
    delete env.ELECTRON_RUN_AS_NODE
    return new Promise((resolve, reject) => {
        const child = spawn(electron, [join(desktop, 'scripts/fixtures/google-registration-import-electron.cjs'), ...args], { cwd: desktop, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
        let output = ''
        child.stdout.on('data', data => { output += data })
        child.stderr.on('data', data => { output += data })
        const timer = setTimeout(() => { child.kill(); reject(new Error('Synthetic Google import timed out.')) }, 20_000)
        child.once('error', error => { clearTimeout(timer); reject(error) })
        child.once('exit', code => { clearTimeout(timer); assert.equal(output.includes(secret), false, 'credentials never enter process output'); resolve(code) })
    })
}
try {
    await mkdir(credentials, { recursive: true })
    await writeFile(tokenFile, 'synthetic-existing-encrypted-plugin-tokens')
    await build({ entryPoints: [join(desktop, 'scripts/configure-google-plugin-mcp-client.ts')], outfile: bundle, bundle: true, platform: 'node', format: 'cjs', external: ['electron'], logLevel: 'silent' })
    await writeFile(json, JSON.stringify({ installed: { client_id: id, client_secret: secret, token_uri: 'https://attacker.example/token' } }))
    assert.equal(await run(['--import-client']), 0)
    assert.equal(await run(['--verify']), 0, 'registration remains readable in a fresh Electron process')
    const bytes = await readFile(store)
    assert.equal(bytes.includes(Buffer.from(id)), false)
    assert.equal(bytes.includes(Buffer.from(secret)), false)
    assert.equal((await readFile(tokenFile, 'utf8')), 'synthetic-existing-encrypted-plugin-tokens')
    assert.equal(await run(['--import-client'], true), 0)
    assert.deepEqual(await readFile(store), bytes, 'cancelled picker preserves registration')
    await writeFile(json, JSON.stringify({ installed: { client_id: '999999999999-abcdefghijklmnopqrst.apps.googleusercontent.com', client_secret: secret } }))
    assert.equal(await run(['--import-client']), 1, 'import cannot replace another client identity')
    assert.deepEqual(await readFile(store), bytes)
    await writeFile(json, JSON.stringify({ web: { client_id: id, client_secret: secret } }))
    assert.equal(await run(['--import-client']), 1, 'web-client credentials cannot be imported as a Desktop registration')
    assert.deepEqual(await readFile(store), bytes)
    await writeFile(json, JSON.stringify({ installed: { client_id: id } }))
    assert.equal(await run(['--import-client']), 1, 'missing client secret is rejected before writing')
    assert.deepEqual(await readFile(store), bytes)
    await writeFile(json, JSON.stringify({ installed: { client_id: id, client_secret: `${secret}-new` } }))
    assert.equal(await run(['--enter-secret']), 0, 'human-only masked entry must finish its encrypted write before closing')
    assert.equal(await run(['--verify']), 0)
    const enteredBytes = await readFile(store)
    assert.equal(enteredBytes.includes(Buffer.from(secret)), false)
    assert.equal(await run(['--enter-secret'], true), 0)
    assert.deepEqual(await readFile(store), enteredBytes, 'cancelled masked entry preserves registration')
    assert.equal((await readFile(tokenFile, 'utf8')), 'synthetic-existing-encrypted-plugin-tokens')
    console.log('Native Google registration import and masked input: encryption, fresh-process verification, unchanged tokens, cancellation and identity validation passed.')
} finally { await rm(root, { recursive: true, force: true }) }
