import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtemp, mkdir, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import electron from 'electron'

const desktop = dirname(dirname(fileURLToPath(import.meta.url)))
const root = await mkdtemp(join(tmpdir(), 'zyra-google-profile-test-'))
async function run(profile, mode) {
    const env = { ...process.env, ZYRA_CREDENTIAL_TEST_PROFILE: join(root, profile), ZYRA_CREDENTIAL_TEST_FILE: join(root, 'registration.enc'), ZYRA_CREDENTIAL_TEST_MODE: mode }
    delete env.ELECTRON_RUN_AS_NODE
    await mkdir(env.ZYRA_CREDENTIAL_TEST_PROFILE, { recursive: true })
    return new Promise((resolve, reject) => {
        const child = spawn(electron, [join(desktop, 'scripts/fixtures/plugin-credential-profile-electron.cjs')], { cwd: desktop, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
        let output = ''
        child.stdout.on('data', chunk => { output += chunk })
        child.stderr.resume()
        const timer = setTimeout(() => { child.kill(); reject(new Error('Credential profile fixture timed out.')) }, 20_000)
        child.once('error', error => { clearTimeout(timer); reject(error) })
        child.once('exit', code => { clearTimeout(timer); code === 0 ? resolve(output.trim()) : reject(new Error(`Credential profile fixture exited ${code}.`)) })
    })
}
try {
    if (process.platform === 'win32') {
        assert.equal(await run('abrupt', 'write-abrupt'), 'ENCRYPTED')
        assert.equal(await run('abrupt', 'read'), 'UNREADABLE', 'app.exit can lose a newly generated Windows profile key')
    }
    assert.equal(await run('provisioner', 'write'), 'ENCRYPTED')
    assert.equal(await run('provisioner', 'read'), 'READABLE')
    if (process.platform === 'win32') assert.equal(await run('zyra', 'read'), 'UNREADABLE', 'Windows safeStorage keys belong to the Chromium profile')
    const source = await readFile(join(desktop, 'scripts/configure-google-plugin-mcp-client.ts'), 'utf8')
    const profileSelection = source.indexOf("app.setPath('userData',")
    assert.ok(profileSelection >= 0 && profileSelection < source.indexOf('app.whenReady()'), 'provisioning must select the Zyra profile before Electron initializes encryption')
    assert.match(source, /join\(app\.getPath\('userData'\), 'assistant', 'plugins', 'credentials', 'google-mcp-client\.enc'\)/u, 'registration must be saved in the encryption profile')
    assert.match(source, /app\.quit\(\)/u, 'provisioning must flush the encryption key on graceful shutdown')
    assert.doesNotMatch(source, /app\.exit\(0\)/u, 'successful provisioning must not bypass profile persistence')
    console.log('Google MCP provisioning encryption-profile and shutdown regressions passed.')
} finally { await rm(root, { recursive: true, force: true }) }
