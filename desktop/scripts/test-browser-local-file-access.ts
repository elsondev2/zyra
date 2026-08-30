import assert from 'node:assert/strict'
import { mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { mock } from 'bun:test'

let dialogSelection: string[] = []
let dialogCalls = 0

mock.module('electron', () => ({
    dialog: {
        showOpenDialog: async () => {
            dialogCalls += 1
            return { canceled: dialogSelection.length === 0, filePaths: dialogSelection }
        }
    },
    nativeImage: {
        createEmpty: () => ({ isEmpty: () => true }),
        createFromPath: () => ({ isEmpty: () => true }),
        createThumbnailFromPath: async () => ({ isEmpty: () => true })
    },
    net: {
        fetch: async (input: string | Request) => {
            const bytes = await readFile(fileURLToPath(String(input)))
            return new Response(new Uint8Array(bytes), { status: 200 })
        }
    },
    protocol: { handle: () => undefined }
}))
mock.module('electron-log', () => ({ default: { error: () => undefined } }))

const {
    authorizeBrowserLocalFile,
    chooseBrowserLocalFile,
    ensureBrowserLocalFileProtocol,
    getBrowserLocalFilePresentation,
    isAuthorizedBrowserLocalFileUrl,
    revokeBrowserLocalFilesForTab
} = await import('../src/main/browser-local-file-service')

type ProtocolHandler = (request: Request) => Promise<Response> | Response
let handler: ProtocolHandler | null = null
let registrations = 0
const browserSession = {
    protocol: {
        handle: (scheme: string, nextHandler: ProtocolHandler) => {
            assert.equal(scheme, 'zyra-local')
            registrations += 1
            handler = nextHandler
        }
    }
} as Electron.Session

const tempRoot = await mkdtemp(join(tmpdir(), 'zyra-browser-local-file-'))
try {
    const htmlPath = join(tempRoot, 'safe page.html')
    const executablePath = join(tempRoot, 'unsafe.exe')
    const html = '<!doctype html><title>Safe local page</title><script>fetch("https://attacker.example")</script><h1>Local</h1>'
    await Promise.all([
        writeFile(htmlPath, html, 'utf8'),
        writeFile(executablePath, 'not executable test data', 'utf8')
    ])

    ensureBrowserLocalFileProtocol(browserSession)
    ensureBrowserLocalFileProtocol(browserSession)
    assert.equal(registrations, 1, 'a Browser session installs one private local-file handler')
    assert.ok(handler)

    const selection = await authorizeBrowserLocalFile(browserSession, 'browser:one', htmlPath)
    assert.match(selection.url, /^zyra-local:\/\/file\/[A-Za-z0-9_-]{32}\/safe%20page\.html$/)
    assert.equal(selection.displayAddress, 'Local file · safe page.html')
    assert.equal(selection.url.includes(encodeURIComponent(await realpath(tempRoot))), false, 'the capability URL never contains its directory')
    assert.equal(selection.url.includes(tempRoot.replaceAll('\\', '/')), false, 'the capability URL never contains a raw disk path')
    assert.equal(isAuthorizedBrowserLocalFileUrl(browserSession, 'browser:one', selection.url), true)
    assert.equal(isAuthorizedBrowserLocalFileUrl(browserSession, 'browser:one', `${selection.url}#section`), true, 'same-document anchors retain access')
    assert.equal(isAuthorizedBrowserLocalFileUrl(browserSession, 'browser:two', selection.url), false, 'capabilities stay bound to one tab')
    assert.equal(isAuthorizedBrowserLocalFileUrl(browserSession, 'browser:one', `file://${htmlPath}`), false, 'raw file URLs never become authorized')
    assert.deepEqual(getBrowserLocalFilePresentation(browserSession, 'browser:one', selection.url), {
        displayAddress: 'Local file · safe page.html',
        fileName: 'safe page.html'
    })

    const response = await handler!(new Request(selection.url))
    assert.equal(response.status, 200)
    assert.equal(await response.text(), html)
    assert.equal(response.headers.get('content-type'), 'text/html')
    assert.equal(response.headers.get('cross-origin-resource-policy'), 'same-origin')
    const policy = response.headers.get('content-security-policy') || ''
    for (const directive of [
        'sandbox',
        "default-src 'none'",
        "frame-ancestors 'none'",
        "script-src 'none'",
        "connect-src 'none'",
        "form-action 'none'"
    ]) assert.equal(policy.includes(directive), true, `local Browser HTML includes ${directive}`)

    const rejectedMethod = await handler!(new Request(selection.url, { method: 'POST' }))
    assert.equal(rejectedMethod.status, 405)
    assert.equal(rejectedMethod.headers.get('allow'), 'GET, HEAD')
    const unknownCapability = await handler!(new Request('zyra-local://file/not-a-capability/safe%20page.html'))
    assert.equal(unknownCapability.status, 404)
    const alteredPath = await handler!(new Request(selection.url.replace('safe%20page.html', 'other.html')))
    assert.equal(alteredPath.status, 404, 'a valid token cannot be reused for another path')

    await assert.rejects(
        () => authorizeBrowserLocalFile(browserSession, 'browser:one', executablePath),
        /cannot preview this file type safely/
    )
    await assert.rejects(
        () => authorizeBrowserLocalFile(browserSession, 'browser:one', tempRoot),
        /Choose a file, not a folder/
    )

    dialogSelection = [htmlPath]
    const picked = await chooseBrowserLocalFile({} as Electron.BrowserWindow, browserSession, 'browser:picker')
    assert.equal(dialogCalls, 1)
    assert.equal(picked?.fileName, 'safe page.html', 'the native picker is the only path-bearing input')

    revokeBrowserLocalFilesForTab(browserSession, 'browser:one')
    assert.equal(isAuthorizedBrowserLocalFileUrl(browserSession, 'browser:one', selection.url), false)
    assert.equal((await handler!(new Request(selection.url))).status, 404)
} finally {
    await rm(tempRoot, { recursive: true, force: true })
}

console.log('Browser local-file capability isolation and sandboxing: ok')
