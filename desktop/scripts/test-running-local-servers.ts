import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import http from 'node:http'
import https from 'node:https'
import net from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { commandReferencesProjectPath, detectRunningLocalServers, sanitizeLocalServerProcessName } from '../src/main/inspectors/process-detector'

assert.equal(commandReferencesProjectPath('node C:\\Work\\App\\server.js', 'c:/work/app', 'win32'), true, 'Windows project matching is case-insensitive and separator-aware')
assert.equal(commandReferencesProjectPath('node C:\\Work\\Application\\server.js', 'C:/Work/App', 'win32'), false, 'project matching rejects sibling prefix collisions')
assert.equal(commandReferencesProjectPath('node /srv/App/server.js', '/srv/App', 'linux'), true, 'POSIX absolute project children match')
assert.equal(commandReferencesProjectPath('node /srv/app/server.js', '/srv/App', 'linux'), false, 'POSIX project matching preserves case')
assert.equal(sanitizeLocalServerProcessName('/Users/private/bin/node'), 'node', 'POSIX executable paths are reduced to a safe process basename')
assert.equal(sanitizeLocalServerProcessName('C:\\Users\\private\\bin\\bun.exe'), 'bun.exe', 'Windows executable paths are reduced to a safe process basename')
const detectorSource = readFileSync(new URL('../src/main/inspectors/process-detector.ts', import.meta.url), 'utf8')
assert.match(detectorSource, /execFileAsync\('powershell\.exe'/, 'Windows process inventory bypasses fragile shell quoting')
assert.match(detectorSource, /Get-WmiObject[\s\S]*falling back to known development ports/, 'process inventory retries and degrades without surfacing the PowerShell command failure')
assert.match(detectorSource, /const runningLocalServerScans = new Map[\s\S]*return cached\.promise/, 'simultaneous windows share one bounded local-server scan')
assert.match(detectorSource, /const listeners = await getPortListeners\(\)[\s\S]*if \(listeners\.size === 0\) return \[\][\s\S]*readProcessInventory/, 'failed listener discovery does not launch a second expensive process inventory')
assert.match(detectorSource, /processInventoryCache[\s\S]*expiresAt: Number\.POSITIVE_INFINITY, promise/, 'project and Browser consumers share one in-flight process inventory')
assert.match(detectorSource, /portInventoryCache[\s\S]*scanPortListeners[\s\S]*expiresAt: Number\.POSITIVE_INFINITY, promise/, 'project and Browser consumers share one in-flight listener inventory')

async function listenOnFirstAvailable(server: net.Server, ports: number[]): Promise<number> {
    for (const port of ports) {
        const opened = await new Promise<boolean>((resolve) => {
            const handleError = () => resolve(false)
            server.once('error', handleError)
            server.listen(port, '127.0.0.1', () => {
                server.off('error', handleError)
                resolve(true)
            })
        })
        if (opened) return port
    }
    throw new Error('No test development port was available.')
}

function createTestHttpsServer(): { directory: string; server: https.Server } | null {
    const directory = mkdtempSync(join(tmpdir(), 'zyra-local-server-test-'))
    const keyPath = join(directory, 'key.pem')
    const certPath = join(directory, 'cert.pem')
    const generated = spawnSync('openssl', [
        'req', '-x509', '-newkey', 'rsa:2048', '-sha256', '-nodes',
        '-keyout', keyPath,
        '-out', certPath,
        '-days', '1',
        '-subj', '/CN=localhost'
    ], { stdio: 'ignore' })
    if (generated.status !== 0) {
        rmSync(directory, { force: true, recursive: true })
        return null
    }
    return {
        directory,
        server: https.createServer({
            key: readFileSync(keyPath),
            cert: readFileSync(certPath)
        }, (_request, response) => {
            response.writeHead(204)
            response.end()
        })
    }
}

const httpServer = http.createServer((_request, response) => {
    response.writeHead(204)
    response.end()
})
const httpsFixture = createTestHttpsServer()
const nonHttpServer = net.createServer((socket) => socket.end('not-http'))

try {
    const httpPort = await listenOnFirstAvailable(httpServer, [3938, 3940, 3941])
    const httpsPort = httpsFixture ? await listenOnFirstAvailable(httpsFixture.server, [3942, 3943, 3944]) : null
    const tcpPort = await listenOnFirstAvailable(nonHttpServer, [4008, 4009, 4010])
    const [servers, sharedServers, thirdServers] = await Promise.all([
        detectRunningLocalServers(process.cwd()),
        detectRunningLocalServers(process.cwd()),
        detectRunningLocalServers(process.cwd())
    ])
    assert.equal(sharedServers, servers, 'concurrent local-server consumers share one resolved snapshot')
    assert.equal(thirdServers, servers, 'the bounded scan cache serves every simultaneous surface')
    const detectedHttp = servers.find((entry) => entry.port === httpPort)
    assert.ok(detectedHttp, 'a browser-openable local HTTP server is discovered even outside conventional development ports')
    assert.equal(detectedHttp.url, `http://localhost:${httpPort}/`)
    if (httpsPort) {
        assert.equal(servers.find((entry) => entry.port === httpsPort)?.url, `https://localhost:${httpsPort}/`, 'a self-signed local HTTPS development server is discovered without weakening public TLS')
    }
    assert.equal(servers.some((entry) => entry.port === tcpPort), false, 'a non-HTTP TCP listener is not presented as a Browser server')
    assert.ok(servers.every((entry) => entry.url.startsWith('http://') || entry.url.startsWith('https://')))
    assert.ok(servers.every((entry) => !('command' in entry) && !('projectPath' in entry)), 'renderer-facing server records never expose commands or private paths')
    console.log('Running local server discovery: ok')
} finally {
    await Promise.all([
        new Promise<void>((resolve) => httpServer.close(() => resolve())),
        ...(httpsFixture ? [new Promise<void>((resolve) => httpsFixture.server.close(() => resolve()))] : []),
        new Promise<void>((resolve) => nonHttpServer.close(() => resolve()))
    ])
    if (httpsFixture) rmSync(httpsFixture.directory, { force: true, recursive: true })
}
