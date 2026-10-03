import { build } from 'esbuild'
import { spawn } from 'node:child_process'
import { cp, mkdtemp, rm, writeFile, readFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { dirname, join, resolve, basename } from 'node:path'
import electronPath from 'electron'

const desktop = resolve(import.meta.dirname, '..')
const temporary = await mkdtemp(join(tmpdir(), 'zyra-app-component-'))
let server
try {
    const view = await build({ entryPoints: [join(desktop, 'scripts/fixtures/plugin-app-view-test-view.ts')], bundle: true, minify: true, write: false, format: 'iife', platform: 'browser' })
    const host = await build({ entryPoints: [join(desktop, 'scripts/fixtures/plugin-app-view-component.tsx')], bundle: true, format: 'esm', splitting: true, metafile: true,
        outdir: temporary, entryNames: 'fixture', platform: 'browser', jsx: 'automatic', tsconfig: join(desktop, 'tsconfig.json'),
        define: { __TEST_VIEW_SCRIPT__: JSON.stringify(view.outputFiles[0].text) } })
    await cp(join(desktop, 'src/renderer/mcp-app-sandbox.html'), join(temporary, 'mcp-app-sandbox.html'))
    await writeFile(join(temporary, 'index.html'), '<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="default-src \'self\'; script-src \'self\'; frame-src \'self\' file:; style-src \'unsafe-inline\'"></head><body><div id="root"></div><script type="module" src="./fixture.js"></script></body></html>')
    const sdkOutput = Object.entries(host.metafile.outputs).find(([_name, output]) => output.entryPoint?.includes('ext-apps') && output.entryPoint.includes('app-bridge'))
    if (!sdkOutput) throw Error('Could not identify the deferred SDK output')
    const sdkChunk = basename(sdkOutput[0])
    let sdkReleased = false
    let pausedSdk
    server = createServer(async (request, response) => {
        const name = new URL(request.url, 'http://127.0.0.1').pathname.slice(1) || 'index.html'
        if (name === '__sdk-status') { response.setHeader('content-type', 'application/json'); response.end(JSON.stringify({ paused: !!pausedSdk })); return }
        if (name === '__release-sdk') {
            sdkReleased = true
            if (pausedSdk) pausedSdk.response.end(pausedSdk.content)
            response.end('released'); return
        }
        if (name !== basename(name)) { response.writeHead(404).end(); return }
        const content = await readFile(join(temporary, name)).catch(() => null)
        if (!content) { response.writeHead(404).end(); return }
        response.setHeader('content-type', name.endsWith('.js') ? 'text/javascript' : 'text/html')
        if (name === sdkChunk && !sdkReleased) { pausedSdk = { response, content }; return }
        response.end(content)
    })
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
    const env = { ...process.env, ZYRA_APP_COMPONENT_TEST_DIR: temporary, ZYRA_APP_COMPONENT_SDK_CHUNK: sdkChunk,
        ZYRA_APP_COMPONENT_TEST_URL: `http://127.0.0.1:${server.address().port}` }
    delete env.ELECTRON_RUN_AS_NODE
    process.exitCode = await new Promise((done, reject) => {
        const child = spawn(electronPath, [join(desktop, 'scripts/fixtures/plugin-app-view-component-electron.cjs')], { cwd: desktop, env, stdio: 'inherit', windowsHide: true })
        child.once('error', reject)
        child.once('exit', code => done(code ?? 1))
    })
} finally {
    if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)) }
    if (dirname(resolve(temporary)) !== resolve(tmpdir()) || !basename(temporary).startsWith('zyra-app-component-')) throw Error('Unexpected cleanup path')
    await rm(temporary, { recursive: true, force: true })
}
