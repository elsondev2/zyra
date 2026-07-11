import http from 'node:http'
import { createReadStream } from 'node:fs'
import { access, readdir, stat } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..', '..')

function parseArgs(argv) {
    const parsed = {}
    for (let index = 0; index < argv.length; index += 1) {
        const entry = argv[index]
        if (!entry.startsWith('--')) continue
        const key = entry.slice(2)
        const next = argv[index + 1]
        if (!next || next.startsWith('--')) {
            parsed[key] = 'true'
            continue
        }
        parsed[key] = next
        index += 1
    }
    return parsed
}

function getContentType(filePath) {
    const ext = path.extname(filePath).toLowerCase()
    if (ext === '.yml' || ext === '.yaml') return 'text/yaml; charset=utf-8'
    if (ext === '.blockmap') return 'application/octet-stream'
    if (ext === '.exe') return 'application/vnd.microsoft.portable-executable'
    return 'application/octet-stream'
}

function resolveRequestPath(feedDir, requestUrl) {
    const url = new URL(requestUrl, 'http://127.0.0.1')
    const decodedPath = decodeURIComponent(url.pathname)
    const relativePath = path.normalize(decodedPath).replace(/^[/\\]+/, '')
    const resolvedPath = path.resolve(feedDir, relativePath || 'latest.yml')
    const feedRoot = path.resolve(feedDir)
    if (resolvedPath !== feedRoot && !resolvedPath.startsWith(`${feedRoot}${path.sep}`)) {
        return null
    }
    return resolvedPath
}

async function assertFeedDir(feedDir) {
    const entries = await readdir(feedDir)
    const hasLatestYml = entries.some((entry) => entry.toLowerCase() === 'latest.yml')
    const hasInstaller = entries.some((entry) => entry.toLowerCase().endsWith('.exe'))
    const hasBlockmap = entries.some((entry) => entry.toLowerCase().endsWith('.exe.blockmap'))

    if (!hasLatestYml || !hasInstaller || !hasBlockmap) {
        throw new Error(
            `Update feed directory must contain latest.yml, an installer .exe, and an .exe.blockmap. Got: ${entries.join(', ')}`
        )
    }
}

async function main() {
    const args = parseArgs(process.argv.slice(2))
    const packageJson = await import(pathToFileURL(path.join(rootDir, 'package.json')).href, {
        with: { type: 'json' }
    })
    const version = packageJson.default.version
    const feedDir = path.resolve(rootDir, args.dir || path.join('dist', 'releases', `v${version}`))
    const host = args.host || '127.0.0.1'
    const port = Number(args.port || 45841)

    await access(feedDir)
    await assertFeedDir(feedDir)

    const server = http.createServer(async (request, response) => {
        const resolvedPath = resolveRequestPath(feedDir, request.url || '/latest.yml')
        if (!resolvedPath) {
            response.writeHead(403)
            response.end('Forbidden')
            return
        }

        try {
            const fileStat = await stat(resolvedPath)
            if (!fileStat.isFile()) {
                response.writeHead(404)
                response.end('Not found')
                return
            }

            response.writeHead(200, {
                'Content-Type': getContentType(resolvedPath),
                'Content-Length': fileStat.size,
                'Cache-Control': 'no-store'
            })
            if (request.method === 'HEAD') {
                response.end()
                return
            }
            createReadStream(resolvedPath).pipe(response)
        } catch {
            response.writeHead(404)
            response.end('Not found')
        }
    })

    server.listen(port, host, () => {
        const feedUrl = `http://${host}:${port}/`
        console.log('Zyra local update feed')
        console.log(`dir: ${feedDir}`)
        console.log(`url: ${feedUrl}`)
        console.log('')
        console.log('Launch a packaged older build from PowerShell with:')
        console.log(`$env:ZYRA_DESKTOP_UPDATE_FEED_URL='${feedUrl}'`)
        console.log("& '<path-to-older-win-unpacked>\\Zyra.exe'")
        console.log('')
        console.log('Keep this process running while checking/downloading the update.')
    })
}

main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
})
