import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import electronPath from 'electron'
import { build } from 'esbuild'

const scriptsDirectory = dirname(fileURLToPath(import.meta.url))
const desktopDirectory = resolve(scriptsDirectory, '..')
const temporaryDirectory = await mkdtemp(join(tmpdir(), 'zyra-html-preview-'))
const argumentValue = (name) => {
    const index = process.argv.indexOf(name)
    return index >= 0 ? process.argv[index + 1] : undefined
}
const externalSourcePath = argumentValue('--source')
const hiddenSelector = argumentValue('--hidden-selector') || ''
const followTargets = (argumentValue('--follow') || '').split(',').filter(Boolean)
const sourcePath = externalSourcePath ? resolve(externalSourcePath) : join(temporaryDirectory, 'preview.html')
const cssPath = join(temporaryDirectory, 'fixture.css')
const syntheticSource = '<!doctype html><html><head><link rel="stylesheet" href="./fixture.css"></head><body><header data-preview-paint>Rendered header</header><nav><a id="local-link" href="./linked.html">Local page</a><a id="keyboard-link" href="./keyboard.html">Keyboard page</a><a id="fragment-link" href="#target">Fragment</a><a id="external-link" href="https://example.test/path?q=1">External page</a><a id="fast-link" target="_blank" href="https://example.test/fast">Fast external page</a><button id="ordinary-button" onclick="document.body.dataset.buttonClicked=1">Page control</button><a id="dangerous-link" href="javascript:document.body.dataset.dangerousRan=1">Dangerous link</a></nav><main><section class="page-transition">Script-gated section</section><section id="target" style="margin-top:1200px">Fragment target</section></main><footer>Rendered footer</footer><form action="https://preview-form.invalid/" method="post"></form><script>localStorage.setItem("preview-fixture", "yes");document.body.dataset.fixtureScriptRan=localStorage.getItem("preview-fixture");document.querySelector(".page-transition").style.opacity="1";fetch("https://preview-connect.invalid/").catch(()=>{});setTimeout(()=>document.querySelector("#local-link").click(),20);setTimeout(()=>{location.href="./scripted.html"},40)</script></body></html>'
let server

function runElectron(url, mainPath, preloadPath) {
    return new Promise((resolvePromise, rejectPromise) => {
        const child = spawn(electronPath, [mainPath], {
            cwd: desktopDirectory,
            env: {
                ...process.env,
                ELECTRON_DISABLE_SECURITY_WARNINGS: 'true',
                ZYRA_HTML_PREVIEW_URL: url,
                ZYRA_HTML_PREVIEW_PRELOAD: preloadPath,
                ZYRA_HTML_PREVIEW_USER_DATA: join(temporaryDirectory, 'profile'),
                ZYRA_HTML_PREVIEW_HIDDEN_SELECTOR: hiddenSelector,
                ZYRA_HTML_PREVIEW_LINK_FIXTURE: externalSourcePath ? 'false' : 'true',
                ZYRA_HTML_PREVIEW_FOLLOW: JSON.stringify(followTargets)
            },
            stdio: ['ignore', 'pipe', 'pipe'],
            windowsHide: true
        })
        let stdout = ''
        let stderr = ''
        child.stdout.on('data', (chunk) => { stdout += chunk.toString() })
        child.stderr.on('data', (chunk) => { stderr += chunk.toString() })
        const timeout = setTimeout(() => {
            child.kill()
            rejectPromise(new Error(`HTML preview fixture timed out.\n${stderr}\n${stdout}`))
        }, 30_000)
        child.once('error', rejectPromise)
        child.once('exit', (code) => {
            clearTimeout(timeout)
            if (code !== 0) return rejectPromise(new Error(`HTML preview Electron fixture failed (${code}).\n${stderr}\n${stdout}`))
            const line = stdout.trim().split(/\r?\n/).reverse().find((value) => value.startsWith('{'))
            if (!line) return rejectPromise(new Error(`HTML preview fixture returned no result.\n${stderr}\n${stdout}`))
            resolvePromise(JSON.parse(line))
        })
    })
}

try {
    if (!externalSourcePath) {
        await Promise.all([
            writeFile(sourcePath, syntheticSource),
            writeFile(join(temporaryDirectory, 'linked.html'), '<!doctype html><title>Linked fixture</title>'),
            writeFile(join(temporaryDirectory, 'keyboard.html'), '<!doctype html><title>Keyboard fixture</title>'),
            writeFile(cssPath, '[data-preview-paint] { color: rgb(12, 34, 56); background: rgb(205, 220, 235); min-height: 120px; } nav { display:flex;gap:16px;padding:16px; } footer { background: rgb(28, 38, 48); color: white; min-height: 80px; } .page-transition { opacity: 0; }')
        ])
    }
    const source = await readFile(sourcePath, 'utf8')
    const rendererPath = join(temporaryDirectory, 'renderer.js')
    const mainPath = join(temporaryDirectory, 'main.cjs')
    const preloadPath = join(temporaryDirectory, 'preload.cjs')
    await Promise.all([
        build({
            entryPoints: [join(scriptsDirectory, 'fixtures/html-rendered-preview.tsx')],
            outfile: rendererPath,
            bundle: true,
            platform: 'browser',
            format: 'iife',
            alias: {
                '@': join(desktopDirectory, 'src/renderer/src'),
                '@shared': join(desktopDirectory, 'src/shared')
            },
            define: { 'process.env.NODE_ENV': '"test"' }
        }),
        build({
            entryPoints: [join(scriptsDirectory, 'fixtures/html-rendered-preview-main.ts')],
            outfile: mainPath,
            bundle: true,
            platform: 'node',
            format: 'cjs',
            external: ['electron']
        }),
        build({
            stdin: {
                contents: "import { contextBridge } from 'electron'; import { createNativeOverlayAdapter } from '../src/preload/adapters/native-overlay-adapter'; contextBridge.exposeInMainWorld('devscope', {...createNativeOverlayAdapter(), getPathInfo: async path => ({success:true,exists:true,type:'file',path})});",
                resolveDir: scriptsDirectory,
                loader: 'ts'
            },
            outfile: preloadPath,
            bundle: true,
            platform: 'node',
            format: 'cjs',
            external: ['electron']
        })
    ])
    const shell = await readFile(join(scriptsDirectory, 'fixtures/html-rendered-preview.html'))
    const renderer = await readFile(rendererPath)
    server = createServer(async (request, response) => {
        if (request.url?.startsWith('/__html-preview-source')) {
            const target = new URL(request.url, 'http://localhost').searchParams.get('path')
            response.setHeader('Content-Type', 'text/html; charset=utf-8')
            if (!target) { response.end(source); return }
            const local = relative(dirname(sourcePath), resolve(target))
            if (local.startsWith('..') || !/\.html?$/i.test(local)) { response.writeHead(403); response.end(); return }
            try { response.end(await readFile(resolve(target), 'utf8')) }
            catch { response.writeHead(404); response.end() }
            return
        }
        if (request.url?.startsWith('/renderer.js')) {
            response.setHeader('Content-Type', 'application/javascript; charset=utf-8')
            response.end(renderer)
            return
        }
        response.setHeader('Content-Type', 'text/html; charset=utf-8')
        response.end(shell)
    })
    await new Promise((resolvePromise) => server.listen(0, '127.0.0.1', resolvePromise))
    const address = server.address()
    if (!address || typeof address === 'string') throw new Error('HTML preview fixture server has no TCP address')
    const fixtureUrl = new URL(`http://127.0.0.1:${address.port}/`)
    fixtureUrl.searchParams.set('path', sourcePath)
    if (followTargets.length) fixtureUrl.searchParams.set('follow', 'true')
    const result = await runElectron(fixtureUrl.toString(), mainPath, preloadPath)

    if (followTargets.length) {
        assert.equal(result.flow?.passed, true, JSON.stringify(result.flow))
        console.log('Original site navigation and Back/Forward through the native preview: ok', JSON.stringify(result.flow))
    } else {
    assert.equal(result.loadResult, 'loaded', `the preview owner must finish loading: ${JSON.stringify(result)}`)
    assert.equal(result.parent?.fixtureError, '', 'the renderer loads the selected HTML source')
    assert.equal(result.parent?.sourceCharacters, source.length, 'the component receives the selected source content')
    assert.ok(result.parent?.width > 0 && result.parent?.height > 0, `the iframe inside NativeOverlayPortal has visible bounds: ${JSON.stringify(result)}`)
    assert.equal(result.parent?.sandbox, 'allow-scripts allow-same-origin', 'local scripts keep an isolated origin with no navigation, popup or form grants')
    assert.equal(result.parent?.allow, '', 'the actual preview iframe delegates no permissions')
    assert.equal(result.parent?.referrerPolicy, 'no-referrer')
    assert.equal(result.protocolResponses.some((entry) => entry.statusCode === 200), true, `the local protocol serves the preview URL: ${JSON.stringify(result)}`)
    assert.ok(result.child?.bodyElements > 0, `Chromium builds the selected HTML DOM inside the native overlay: ${JSON.stringify(result)}`)
    assert.ok(result.child?.headerElements > 0 && result.child?.header?.width > 0 && result.child?.header?.height > 0 && result.child?.header?.opacity !== '0', 'header DOM has visible layout bounds')
    assert.ok(result.child?.footerElements > 0 && result.child?.footer?.width > 0 && result.child?.footer?.height > 0 && result.child?.footer?.opacity !== '0', 'footer DOM has visible layout bounds')
    assert.ok(result.painted?.width > 0 && result.painted?.height > 0 && result.painted?.nonWhite > 50, `the iframe paints non-white initial content: ${JSON.stringify(result)}`)
    assert.ok(result.footerPainted?.nonWhite > 50, `the scrolled footer paints non-white content: ${JSON.stringify(result)}`)
    if (!externalSourcePath) assert.equal(result.child?.scriptMarker, 'yes', 'approved local preview scripts execute')
    assert.equal(result.child?.appAccess, false, 'local scripts cannot access the parent app')
    assert.equal(result.child?.nodeAccess, false, 'local scripts receive no Node or preload bridge')
    assert.equal(result.security.popupCreated, false, 'preview popups remain blocked')
    assert.equal(result.security.frameUrlUnchanged, true, 'remote and repeated local frame navigation remain blocked after the intended load')
    assert.equal(result.security.mainFrameUrlUnchanged, true, 'the native overlay main frame remains navigation-locked')
    if (!externalSourcePath) {
    assert.equal(result.links?.ordinaryClicked, '1', `ordinary page controls retain their click events: ${JSON.stringify(result.links)}`)
    assert.equal(result.links?.ownerControlClicked, '1', 'app controls above the HTML frame retain their click events')
    assert.equal(result.links?.targets?.length, 5, `only the three native user activations cross the owner bridge: ${JSON.stringify(result.links)}`)
    assert.match(result.links?.targets?.[0] || '', /\/linked\.html$/)
    assert.match(result.links?.targets?.[1] || '', /\/keyboard\.html$/)
    assert.equal(result.links?.targets?.[2], 'https://example.test/path?q=1')
    assert.match(result.links?.targets?.[3] || '', /\/linked\.html$/, 'links still work after a fragment jump')
    assert.equal(result.links?.targets?.[4], 'https://example.test/fast', 'quick target-blank clicks survive delayed capture')
    assert.equal(result.links?.fragmentScrolled, true, 'fragment anchors stay in the page and scroll normally')
    assert.equal(result.links?.dangerousDelivered, false, 'dangerous schemes never reach the owner callback')
    assert.equal(result.links?.dangerousRan, '', 'dangerous anchor activation is suppressed')
    assert.equal(result.links?.syntheticDelivered, false, 'synthetic clicks and scripted redirects cannot request a host open')
    assert.equal(result.links?.staleActivationQueued, true, 'the fixture queues a real mouse activation before owner teardown')
    assert.equal(result.links?.afterCloseDelivered, false, 'queued activation is discarded when the preview closes')
    }
    assert.deepEqual(result.security.remoteRequests, [], 'ordinary resources, fetch, forms and navigation emit no remote requests')
    assert.equal(result.security.sandbox, true)
    assert.equal(result.security.contextIsolation, true)
    assert.equal(result.security.nodeIntegration, false)
    assert.equal(result.security.webviewTag, false, 'webview creation stays disabled')
    for (const directive of ["script-src 'self' 'unsafe-inline'", "connect-src 'none'", "frame-src 'none'", "form-action 'none'"]) {
        assert.ok(result.security.previewPolicy.includes(directive), `preview response retains ${directive}`)
    }
    if (!externalSourcePath) assert.equal(result.child?.relativeStyleApplied, true, 'relative local stylesheet assets render inside the native overlay')
    if (hiddenSelector) {
        assert.ok(result.child?.hidden.length > 0, `expected hidden-selector matches for ${hiddenSelector}`)
        assert.ok(result.scriptSections.length > 0 && result.scriptSections.every(entry => Number(entry.opacity) > 0.95 && entry.width > 0 && entry.height > 0), 'page scripts reveal their main sections when scrolled into view')
    }

    assert.equal(result.closeLifecycle.preventedClose, true, 'the first native close is cancelled by the file-preview guard')
    assert.equal(result.closeLifecycle.overlayPreserved, true, 'cancelled close preserves the native surface needed by save/close dialogs')
    assert.equal(result.closeLifecycle.finalClosed, true, 'the approved retry closes normally without forced destruction')
    console.log(JSON.stringify({
        closeLifecycle: result.closeLifecycle,
        source: externalSourcePath ? basename(sourcePath) : 'synthetic',
        nativeOverlay: true,
        iframeBounds: result.parent && { x: result.parent.x, y: result.parent.y, width: result.parent.width, height: result.parent.height },
        dom: result.child && { headerElements: result.child.headerElements, footerElements: result.child.footerElements, bodyElements: result.child.bodyElements, header: result.child.header, footer: result.child.footer, hidden: result.child.hidden, scriptSections: result.scriptSections, appAccess: result.child.appAccess, nodeAccess: result.child.nodeAccess, webRtcBlocked: result.child.webRtcBlocked },
        paint: { initial: result.painted, footer: result.footerPainted },
        security: result.security
    }))
    console.log('HTML rendered preview through NativeOverlayPortal: ok')
    }
} finally {
    if (server) await new Promise((resolvePromise) => server.close(resolvePromise))
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 250))
    await rm(temporaryDirectory, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })
}
