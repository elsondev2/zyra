import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
    BROWSER_ASSISTANT_BRIDGE_CAPABILITY_HEADER,
    BROWSER_ASSISTANT_BRIDGE_HEADER,
    BROWSER_ASSISTANT_BRIDGE_HEADER_VALUE,
    BROWSER_ASSISTANT_BRIDGE_PROXY_PREFIX,
    BROWSER_FILE_BRIDGE_PATH
} from '../src/shared/browser-assistant-bridge'
import { BrowserClientHost } from '../src/main/browser-client-host'

const capability = 'browser-client-host-test-capability'
const staticRoot = await mkdtemp(join(tmpdir(), 'zyra-browser-client-host-'))
await mkdir(join(staticRoot, 'assets'), { recursive: true })
await writeFile(join(staticRoot, 'index.html'), '<!doctype html><main>Zyra browser client</main>')
await writeFile(join(staticRoot, 'assets', 'app.js'), 'globalThis.__zyraBrowserHost = true')

let expectedOrigin = ''
const upstream = createServer((request, response) => {
    assert.equal(request.headers.origin, expectedOrigin, 'the host must bind bridge requests to its own local origin')
    assert.equal(request.headers[BROWSER_ASSISTANT_BRIDGE_HEADER], BROWSER_ASSISTANT_BRIDGE_HEADER_VALUE)
    assert.equal(request.headers[BROWSER_ASSISTANT_BRIDGE_CAPABILITY_HEADER], capability, 'the capability must stay in the trusted host process')
    if (request.url?.startsWith(BROWSER_FILE_BRIDGE_PATH)) {
        assert.equal(request.headers.range, 'bytes=2-5')
        response.statusCode = 206
        response.setHeader('Accept-Ranges', 'bytes')
        response.setHeader('Content-Range', 'bytes 2-5/8')
        response.setHeader('Content-Length', '4')
        response.setHeader('Content-Type', 'image/png')
        response.end('file')
        return
    }
    if (request.url === '/v1/devscope/events') {
        response.statusCode = 200
        response.setHeader('Content-Type', 'text/event-stream; charset=utf-8')
        response.write('data: {"event":"previewTerminal","payload":{"data":"ready"}}\n\n')
        response.end()
        return
    }
    const chunks: Buffer[] = []
    request.on('data', (chunk) => chunks.push(Buffer.from(chunk)))
    request.on('end', () => {
        response.statusCode = 200
        response.setHeader('Content-Type', 'application/json; charset=utf-8')
        response.end(JSON.stringify({ ok: true, path: request.url, body: Buffer.concat(chunks).toString('utf8') }))
    })
})
await new Promise<void>((resolve, reject) => {
    upstream.once('error', reject)
    upstream.listen(0, '127.0.0.1', () => resolve())
})
const upstreamAddress = upstream.address()
assert.ok(upstreamAddress && typeof upstreamAddress !== 'string')

const host = new BrowserClientHost({
    bridge: {
        host: '127.0.0.1',
        port: upstreamAddress.port,
        capability
    },
    staticRoot,
    port: 0
})

try {
    const address = await host.start()
    expectedOrigin = address.origin

    const indexResponse = await fetch(`${address.origin}/`)
    assert.equal(indexResponse.status, 200)
    assert.equal(await indexResponse.text(), '<!doctype html><main>Zyra browser client</main>')
    assert.equal(indexResponse.headers.get('cache-control'), 'no-cache')
    assert.equal(indexResponse.headers.get('x-content-type-options'), 'nosniff')
    assert.equal(indexResponse.headers.get('permissions-policy')?.includes('microphone=(self)'), true, 'same-device browser Voice must be allowed to request this origin\'s microphone')
    assert.equal(indexResponse.headers.get('permissions-policy')?.includes('camera=()'), true, 'browser Voice must not broaden unrelated camera access')

    const localhostOrigin = address.origin.replace('127.0.0.1', 'localhost')
    const canonicalResponse = await fetch(`${localhostOrigin}/assistant?source=bookmark`, { redirect: 'manual' })
    assert.equal(canonicalResponse.status, 308)
    assert.equal(
        canonicalResponse.headers.get('location'),
        `${address.origin}/assistant?source=bookmark`,
        'localhost bookmarks must converge on the canonical 127.0.0.1 origin'
    )

    const routeResponse = await fetch(`${address.origin}/assistant/chat/session-1`)
    assert.equal(routeResponse.status, 200, 'client-side routes must fall back to the renderer entry point')
    assert.equal((await routeResponse.text()).includes('Zyra browser client'), true)

    const assetResponse = await fetch(`${address.origin}/assets/app.js`)
    assert.equal(assetResponse.status, 200)
    assert.equal(assetResponse.headers.get('content-type'), 'text/javascript; charset=utf-8')
    assert.equal(assetResponse.headers.get('cache-control')?.includes('immutable'), true)

    const invokeResponse = await fetch(`${address.origin}${BROWSER_ASSISTANT_BRIDGE_PROXY_PREFIX}/v1/devscope/invoke`, {
        method: 'POST',
        headers: {
            Origin: address.origin,
            'Content-Type': 'application/json',
            [BROWSER_ASSISTANT_BRIDGE_HEADER]: BROWSER_ASSISTANT_BRIDGE_HEADER_VALUE
        },
        body: JSON.stringify({ path: ['getUserHomePath'], args: [] })
    })
    assert.equal(invokeResponse.status, 200)
    const invokePayload = await invokeResponse.json() as { path: string; body: string }
    assert.equal(invokePayload.path, '/v1/devscope/invoke')
    assert.equal(invokePayload.body.includes('getUserHomePath'), true)

    const eventResponse = await fetch(`${address.origin}${BROWSER_ASSISTANT_BRIDGE_PROXY_PREFIX}/v1/devscope/events`, {
        headers: {
            Origin: address.origin,
            [BROWSER_ASSISTANT_BRIDGE_HEADER]: BROWSER_ASSISTANT_BRIDGE_HEADER_VALUE
        }
    })
    assert.equal(eventResponse.status, 200)
    assert.equal((await eventResponse.text()).includes('previewTerminal'), true, 'event streams must pass through the production host')

    const browserFileResponse = await fetch(
        `${address.origin}${BROWSER_ASSISTANT_BRIDGE_PROXY_PREFIX}${BROWSER_FILE_BRIDGE_PATH}?source=zyra%3A%2F%2F%2Ftest.png`,
        {
            headers: {
                Origin: address.origin,
                Range: 'bytes=2-5',
                'Sec-Fetch-Site': 'same-origin'
            }
        }
    )
    assert.equal(browserFileResponse.status, 206, 'same-origin media elements must reach protected host files without custom headers')
    assert.equal(await browserFileResponse.text(), 'file')
    assert.equal(browserFileResponse.headers.get('content-range'), 'bytes 2-5/8')

    const missingHeader = await fetch(`${address.origin}${BROWSER_ASSISTANT_BRIDGE_PROXY_PREFIX}/v1/health`, {
        headers: { Origin: address.origin }
    })
    assert.equal(missingHeader.status, 403)

    const rejectedOrigin = await fetch(`${address.origin}${BROWSER_ASSISTANT_BRIDGE_PROXY_PREFIX}/v1/health`, {
        headers: {
            Origin: 'https://example.com',
            [BROWSER_ASSISTANT_BRIDGE_HEADER]: BROWSER_ASSISTANT_BRIDGE_HEADER_VALUE
        }
    })
    assert.equal(rejectedOrigin.status, 403, 'cross-origin pages must not proxy into Desktop')

    const missingAsset = await fetch(`${address.origin}/assets/missing.js`)
    assert.equal(missingAsset.status, 404)

    let rendererRequestUrl = ''
    const renderer = createServer((request, response) => {
        rendererRequestUrl = request.url || ''
        response.statusCode = 200
        response.setHeader('Content-Type', 'text/javascript; charset=utf-8')
        response.end('globalThis.__zyraViteProxy = true')
    })
    await new Promise<void>((resolve, reject) => {
        renderer.once('error', reject)
        renderer.listen(0, '127.0.0.1', () => resolve())
    })
    const rendererAddress = renderer.address()
    assert.ok(rendererAddress && typeof rendererAddress !== 'string')
    const devHost = new BrowserClientHost({
        bridge: {
            host: '127.0.0.1',
            port: upstreamAddress.port,
            capability
        },
        devRendererUrl: `http://127.0.0.1:${rendererAddress.port}`,
        port: 0
    })
    try {
        const devAddress = await devHost.start()
        const devAsset = await fetch(`${devAddress.origin}/@vite/client?stable=1`)
        assert.equal(devAsset.status, 200)
        assert.equal(await devAsset.text(), 'globalThis.__zyraViteProxy = true')
        assert.equal(rendererRequestUrl, '/@vite/client?stable=1', 'the stable browser origin must proxy development renderer assets')
    } finally {
        await devHost.stop()
        await new Promise<void>((resolve) => renderer.close(() => resolve()))
    }

    console.log('Browser client host: ok')
} finally {
    await host.stop()
    await new Promise<void>((resolve) => upstream.close(() => resolve()))
    await rm(staticRoot, { recursive: true, force: true })
}
