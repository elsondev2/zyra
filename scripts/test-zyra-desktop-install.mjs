import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { desktopArtifactFor, installMatchingDesktop, launchInstalledDesktop } from '../src/desktop-app.mjs'

assert.equal(desktopArtifactFor('0.6.0', 'win32', 'x64'), 'Zyra-Desktop-0.6.0-Windows-x64.exe')
assert.equal(desktopArtifactFor('0.6.0', 'darwin', 'arm64'), 'Zyra-Desktop-0.6.0-macOS-universal.dmg')
assert.equal(desktopArtifactFor('0.6.0', 'linux', 'x64'), 'Zyra-Desktop-0.6.0-Linux-x64.AppImage')
assert.throws(() => desktopArtifactFor('0.6.0', 'linux', 'arm64'), /unavailable/)

const bytes = Buffer.from('verified desktop fixture')
const hash = createHash('sha256').update(bytes).digest('hex')
const artifactName = desktopArtifactFor('0.6.0', 'win32', 'x64')
const release = {
  draft: false,
  tag_name: 'v0.6.0',
  assets: [
    { name: artifactName, browser_download_url: `https://github.com/justelson/zyra/releases/download/v0.6.0/${artifactName}` },
    { name: 'SHA256SUMS', browser_download_url: 'https://github.com/justelson/zyra/releases/download/v0.6.0/SHA256SUMS' }
  ]
}
const fetch = async (url) => {
  if (String(url).includes('api.github.com')) return { ok: true, json: async () => release }
  if (String(url).endsWith('SHA256SUMS')) return { ok: true, text: async () => `${hash}  ${artifactName}\n` }
  return { ok: true, arrayBuffer: async () => bytes }
}
const temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), 'zyra-desktop-install-'))
const verified = await installMatchingDesktop({ version: '0.6.0', platform: 'win32', arch: 'x64', fetch, verifyNative: async () => undefined, dryRun: true, temporaryDirectory })
assert.equal(verified.verified, true)
await assert.rejects(() => installMatchingDesktop({ version: '0.6.0', platform: 'win32', arch: 'x64', fetch: async (url) => String(url).endsWith('SHA256SUMS') ? { ok: true, text: async () => `${'0'.repeat(64)}  ${artifactName}\n` } : String(url).includes('api.github.com') ? { ok: true, json: async () => release } : { ok: true, arrayBuffer: async () => bytes }, verifyNative: async () => undefined, dryRun: true, temporaryDirectory }), /checksum verification/)
let launched = null
await launchInstalledDesktop({
  registration: { version: 1, executable: process.execPath, appVersion: '0.6.0', platform: process.platform, architecture: process.arch },
  verifyNative: async () => undefined,
  spawn: (executable, args) => { launched = { executable, args }; return { unref() {} } }
})
assert.deepEqual(launched.args, ['--zyra-background-host'])
if (process.platform === 'win32') {
  const signedSystemExecutable = `${process.env.SystemRoot}\\System32\\WindowsPowerShell\\v1.0\\powershell.exe`
  await launchInstalledDesktop({
    registration: { version: 1, executable: signedSystemExecutable, appVersion: '0.6.0', platform: process.platform, architecture: process.arch },
    spawn: () => ({ unref() {} })
  })
}
await rm(temporaryDirectory, { recursive: true, force: true })
console.log('Zyra Desktop install contract: ok')
