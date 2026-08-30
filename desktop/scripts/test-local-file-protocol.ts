import assert from 'node:assert/strict'
import { unlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { mock } from 'bun:test'

let handler: ((request: Request) => Response | Promise<Response>) | null = null
let registeredScheme = ''
let nextFetchResponse: Response | null = null
let nextFetchError: unknown = null
const fileSize = 1000
const fetchCalls: Array<{ input: string | Request; init?: RequestInit }> = []
const errorLogs: unknown[][] = []

mock.module('electron', () => ({
    nativeImage: {
        createEmpty: () => ({ isEmpty: () => true }),
        createFromPath: () => ({ isEmpty: () => true }),
        createThumbnailFromPath: async () => ({ isEmpty: () => true })
    },
    net: {
        fetch: async (input: string | Request, init?: RequestInit) => {
            fetchCalls.push({ input, init })
            if (nextFetchError) throw nextFetchError
            assert.ok(nextFetchResponse)
            return nextFetchResponse
        }
    },
    protocol: {
        handle: (scheme: string, nextHandler: typeof handler) => {
            registeredScheme = scheme
            handler = nextHandler
        }
    }
}))
mock.module('electron-log', () => ({
    default: { error: (...args: unknown[]) => errorLogs.push(args) }
}))

const { registerFileProtocol } = await import('../src/main/file-protocol')
registerFileProtocol('zyra')
assert.equal(registeredScheme, 'zyra')
assert.ok(handler)

const mediaPath = resolve(tmpdir(), `zyra protocol range sample-${process.pid}.mp4`)
await Bun.write(mediaPath, new Uint8Array(fileSize))
const mediaUrl = pathToFileURL(mediaPath).href.replace(/^file:/, 'zyra:')
const mediaBytes = new TextEncoder().encode('streamed-media')
const mediaStream = new ReadableStream<Uint8Array>({
    start(controller) {
        controller.enqueue(mediaBytes)
        // Leave the stream open: a handler that buffers the entire body would never return.
    }
})
nextFetchResponse = new Response(mediaStream, {
    status: 200,
    headers: { 'Content-Type': 'application/octet-stream' }
})

const rangeRequest = new Request(mediaUrl, {
    headers: {
        Range: `bytes=100-${99 + mediaBytes.byteLength}`,
        'If-Range': 'test-validator'
    }
})
let streamTimeout: ReturnType<typeof setTimeout> | undefined
const rangeResponse = await Promise.race([
    handler!(rangeRequest),
    new Promise<never>((_, reject) => {
        streamTimeout = setTimeout(() => reject(new Error('protocol handler buffered an open file response')), 250)
    })
])
clearTimeout(streamTimeout)
assert.equal(fetchCalls.length, 1)
assert.equal(fetchCalls[0]?.input, pathToFileURL(mediaPath).href)
assert.equal(fetchCalls[0]?.init?.method, 'GET')
const forwardedHeaders = new Headers(fetchCalls[0]?.init?.headers)
assert.equal(forwardedHeaders.get('range'), `bytes=100-${99 + mediaBytes.byteLength}`)
assert.equal(forwardedHeaders.get('if-range'), 'test-validator')
assert.equal(rangeResponse.status, 206)
assert.equal(rangeResponse.statusText, 'Partial Content')
assert.equal(rangeResponse.headers.get('accept-ranges'), 'bytes')
assert.equal(rangeResponse.headers.get('content-range'), `bytes 100-${99 + mediaBytes.byteLength}/1000`)
assert.equal(rangeResponse.headers.get('content-length'), String(mediaBytes.byteLength))
assert.equal(rangeResponse.headers.get('content-type'), 'video/mp4')
assert.equal(
    rangeResponse.headers.get('content-security-policy'),
    "default-src 'none'; base-uri 'none'; object-src 'none'"
)
assert.equal(rangeResponse.headers.get('permissions-policy')?.includes('microphone=()'), true)
assert.equal(rangeResponse.headers.get('referrer-policy'), 'no-referrer')
assert.equal(rangeResponse.headers.get('cross-origin-resource-policy'), 'same-origin')
assert.equal(rangeResponse.headers.get('x-content-type-options'), 'nosniff')
assert.ok(rangeResponse.body, 'the upstream file body remains a stream')
const rangeReader = rangeResponse.body.getReader()
assert.equal(new TextDecoder().decode((await rangeReader.read()).value), 'streamed-media')
await rangeReader.cancel()

const rejectedMethodResponse = await handler!(new Request(mediaUrl, { method: 'POST' }))
assert.equal(rejectedMethodResponse.status, 405)
assert.equal(rejectedMethodResponse.headers.get('allow'), 'GET, HEAD')
assert.equal(fetchCalls.length, 1, 'non-read methods are rejected before touching the local file')

const invalidRangeResponse = await handler!(new Request(mediaUrl, {
    headers: { Range: 'bytes=1000-' }
}))
assert.equal(invalidRangeResponse.status, 416)
assert.equal(invalidRangeResponse.headers.get('accept-ranges'), 'bytes')
assert.equal(invalidRangeResponse.headers.get('content-range'), 'bytes */1000')
assert.equal(invalidRangeResponse.headers.get('content-length'), '0')
assert.equal(fetchCalls.length, 1, 'unsatisfiable ranges are rejected before opening a file stream')

nextFetchResponse = null
nextFetchError = null
const missingPath = resolve(tmpdir(), 'zyra missing project icon.png')
const missingResponse = await handler!(new Request(pathToFileURL(missingPath).href.replace(/^file:/, 'zyra:')))
assert.equal(missingResponse.status, 404)
assert.equal((await missingResponse.arrayBuffer()).byteLength, 0)
assert.equal(errorLogs.length, 0, 'missing stale project icons are normal 404 fallbacks, not fatal file-read errors')

nextFetchError = Object.assign(new Error('permission denied'), { code: 'EACCES' })
const unreadableResponse = await handler!(new Request(mediaUrl))
assert.equal(unreadableResponse.status, 404)
assert.equal(errorLogs.length, 1, 'unexpected local file failures remain logged')

nextFetchError = null
const malformedResponse = await handler!(new Request('zyra:///%E0%A4%A'))
assert.equal(malformedResponse.status, 500)
assert.equal(errorLogs.length, 2, 'invalid protocol paths remain logged as resolution failures')

const htmlPath = resolve(tmpdir(), `zyra protocol unsafe preview-${process.pid}.html`)
const htmlSource = '<!doctype html><script>top.location="https://attacker.example"</script><img src="file:///private.txt"><img src="https://attacker.example/leak">'
await Bun.write(htmlPath, htmlSource)
nextFetchResponse = new Response(htmlSource, { status: 200, headers: { 'Content-Type': 'text/html' } })
const htmlResponse = await handler!(new Request(pathToFileURL(htmlPath).href.replace(/^file:/, 'zyra:')))
const htmlPolicy = htmlResponse.headers.get('content-security-policy') || ''
for (const directive of [
    'sandbox',
    "default-src 'none'",
    "frame-ancestors 'none'",
    "script-src 'none'",
    "connect-src 'none'",
    "frame-src 'none'",
    "form-action 'none'",
    'img-src data: blob:'
]) assert.equal(htmlPolicy.includes(directive), true, `HTML policy includes ${directive}`)
assert.equal(htmlPolicy.includes('http:'), false, 'HTML cannot request remote network resources')
assert.equal(htmlPolicy.includes('file:'), false, 'HTML cannot read arbitrary file URLs')
assert.equal(htmlPolicy.includes('zyra:'), false, 'HTML cannot pivot the local protocol into another file')
assert.equal(htmlPolicy.includes("'unsafe-eval'"), false)

const protocolSource = await Bun.file(new URL('../src/main/file-protocol.ts', import.meta.url)).text()
const htmlPreviewSource = await Bun.file(new URL('../src/renderer/src/components/ui/file-preview/HtmlRenderedPreview.tsx', import.meta.url)).text()
assert.doesNotMatch(protocolSource, /registerBufferProtocol|\breadFile\b/)
assert.match(htmlPreviewSource, /sandbox=""/, 'untrusted HTML receives every iframe sandbox restriction')
assert.match(htmlPreviewSource, /allow=""/, 'untrusted HTML receives no delegated permissions')
assert.match(htmlPreviewSource, /referrerPolicy="no-referrer"/)
assert.doesNotMatch(htmlPreviewSource, /allow-scripts|allow-same-origin|allow-popups|allow-top-navigation|allow-forms/)

const projectIconSource = await Bun.file(new URL('../src/renderer/src/components/ui/ProjectIcon.tsx', import.meta.url)).text()
assert.match(projectIconSource, /failedCustomIconPaths/, 'failed custom project icons are not requested repeatedly during the same app session')

await Promise.all([unlink(mediaPath), unlink(htmlPath)])
console.log('Local file protocol streaming, range forwarding, and error semantics: ok')
