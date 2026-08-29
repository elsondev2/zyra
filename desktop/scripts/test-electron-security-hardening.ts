import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { TrustedIpcSenderPolicy, type TrustedIpcSender } from '../src/main/ipc/trusted-ipc-policy'

const desktopRoot = path.resolve(import.meta.dirname, '..')
const read = (relativePath: string) => readFileSync(path.join(desktopRoot, relativePath), 'utf8')

type TestSender = TrustedIpcSender & {
    destroyed: boolean
    mainFrame: { url: string }
}

function sender(id: number, url: string): TestSender {
    return {
        id,
        destroyed: false,
        mainFrame: { url },
        isDestroyed() { return this.destroyed }
    }
}

const policy = new TrustedIpcSenderPolicy()
const shell = sender(7, 'file:///C:/Zyra/resources/app.asar/out/renderer/index.html#/assistant')
policy.register(shell, (url) => url.startsWith('file:///C:/Zyra/resources/app.asar/out/renderer/index.html'))

assert.deepEqual(policy.decide({ sender: shell, senderFrame: shell.mainFrame }), { trusted: true })

const websiteGuest = sender(8, 'https://evil.example/steal')
assert.deepEqual(
    policy.decide({ sender: websiteGuest, senderFrame: websiteGuest.mainFrame }),
    { trusted: false, reason: 'unregistered-sender' },
    'a remote website guest cannot invoke Zyra privileged IPC'
)

const forgedReusedId = sender(shell.id, shell.mainFrame.url)
assert.deepEqual(
    policy.decide({ sender: forgedReusedId, senderFrame: forgedReusedId.mainFrame }),
    { trusted: false, reason: 'unregistered-sender' },
    'WebContents ids are not authority without exact object identity'
)

assert.deepEqual(
    policy.decide({ sender: shell, senderFrame: { url: shell.mainFrame.url } }),
    { trusted: false, reason: 'non-main-frame' },
    'iframes inside a trusted shell cannot invoke privileged IPC'
)

shell.mainFrame.url = 'https://evil.example/renderer-takeover'
assert.deepEqual(
    policy.decide({ sender: shell, senderFrame: shell.mainFrame }),
    { trusted: false, reason: 'untrusted-location' },
    'a trusted WebContents loses IPC authority if it navigates away from the local renderer'
)
shell.mainFrame.url = 'file:///C:/Zyra/resources/app.asar/out/renderer/index.html'
shell.destroyed = true
assert.deepEqual(policy.decide({ sender: shell, senderFrame: shell.mainFrame }), { trusted: false, reason: 'destroyed-sender' })

function sourceFiles(root: string): string[] {
    const files: string[] = []
    for (const entry of readdirSync(root, { withFileTypes: true })) {
        const target = path.join(root, entry.name)
        if (entry.isDirectory()) files.push(...sourceFiles(target))
        else if (entry.isFile() && /\.(?:ts|tsx)$/.test(entry.name)) files.push(target)
    }
    return files
}

const mainSourceRoot = path.join(desktopRoot, 'src', 'main')
const mainSource = read('src/main/index.ts')
const browserViewSource = read('src/main/browser-view-manager.ts')
const popupSource = read('src/main/browser-popup-manager.ts')
const trustedIpcSource = read('src/main/ipc/trusted-ipc.ts')
const preloadEntrySource = read('src/preload/index.ts')
const preloadBuildSource = read('electron.vite.config.ts')

assert.match(mainSource, /app\.enableSandbox\(\)/, 'all renderer processes must be sandboxed globally')
assert.equal((mainSource.match(/sandbox:\s*true/g) || []).length >= 4, true, 'every Zyra-owned BrowserWindow must opt into the sandbox')
assert.doesNotMatch(mainSource, /sandbox:\s*false/, 'Zyra shell windows must never disable the sandbox')
assert.match(mainSource, /registerTrustedIpcSender\(window\.webContents, isTrustedRendererLocation\)/)
assert.match(mainSource, /will-navigate[\s\S]{0,180}isTrustedRendererLocation[\s\S]{0,100}preventDefault/)
assert.match(mainSource, /additionalArguments:\s*\[BROWSER_POPUP_PRELOAD_ARGUMENT\]/, 'popup authority must come from a main-process argument')
assert.match(browserViewSource, /preload:\s*undefined[\s\S]{0,180}sandbox:\s*true[\s\S]{0,180}nodeIntegration:\s*false/)
assert.match(popupSource, /preload:\s*undefined[\s\S]{0,180}sandbox:\s*true[\s\S]{0,180}nodeIntegration:\s*false/)
assert.match(trustedIpcSource, /assertTrustedIpcEvent\(event\)/)
assert.match(preloadEntrySource, /process\.argv\.includes\(BROWSER_POPUP_PRELOAD_ARGUMENT\)/)
assert.match(preloadBuildSource, /format:\s*'cjs'/, 'sandboxed preload must use CommonJS rather than unsupported ESM')
assert.match(preloadBuildSource, /entryFileNames:\s*'\[name\]\.cjs'/)
assert.doesNotMatch(preloadBuildSource, /'browser-popup':/, 'the sandboxed preload must remain a single self-contained bundle')

for (const file of sourceFiles(mainSourceRoot)) {
    const source = readFileSync(file, 'utf8')
    if (!/ipcMain\.(?:handle|on)\(/.test(source) || file.endsWith(`${path.sep}trusted-ipc.ts`)) continue
    assert.match(
        source,
        /trusted-ipc/,
        `privileged IPC registrations must use the trusted facade: ${path.relative(desktopRoot, file)}`
    )
}

for (const file of sourceFiles(path.join(desktopRoot, 'src', 'preload'))) {
    const source = readFileSync(file, 'utf8')
    assert.doesNotMatch(source, /(?:from\s+['"]node:|require\s*\()/, `sandboxed preload cannot require Node APIs: ${path.relative(desktopRoot, file)}`)
}

const desktopPackage = JSON.parse(read('package.json'))
const build = desktopPackage.build
assert.equal(build.asar, true, 'packaging must explicitly retain app.asar')
assert.deepEqual(build.electronFuses, {
    runAsNode: true,
    enableCookieEncryption: true,
    enableNodeOptionsEnvironmentVariable: false,
    enableNodeCliInspectArguments: false,
    enableEmbeddedAsarIntegrityValidation: true,
    onlyLoadAppFromAsar: true
})
assert.equal(build.electronFuses.runAsNode, true, 'the packaged Unix TUI bridge currently requires ELECTRON_RUN_AS_NODE')

const releaseValidator = read('scripts/release/validate-packaged-app.mjs')
assert.match(releaseValidator, /getCurrentFuseWire/)
assert.match(releaseValidator, /EnableEmbeddedAsarIntegrityValidation/)
assert.match(releaseValidator, /OnlyLoadAppFromAsar/)

console.log('Electron sandbox, IPC sender, guest isolation, and package fuse hardening: ok')
