/**
 * Zyra - Process Detector
 * Detects running development processes for a project
 * Checks for dev servers, node processes, and other development tools
 */

import { exec, execFile } from 'child_process'
import { promisify } from 'util'
import { normalize, posix, resolve, win32 } from 'path'
import log from 'electron-log'
import net from 'net'
import { request as httpRequest } from 'node:http'
import { request as httpsRequest } from 'node:https'

const execAsync = promisify(exec)
const execFileAsync = promisify(execFile)
const LOCAL_SERVER_SCAN_TTL_MS = 10_000
const LOCAL_SERVER_SCAN_CACHE_LIMIT = 8
const PROCESS_INVENTORY_TTL_MS = 5_000
const PORT_INVENTORY_TTL_MS = 3_000

export interface ProcessInfo {
    pid: number
    name: string
    port?: number
    command?: string
    type: 'dev-server' | 'node' | 'python' | 'other'
}

export interface ProjectProcessStatus {
    isLive: boolean
    processes: ProcessInfo[]
    activePorts: number[]
}

export interface RunningLocalServer {
    pid: number | null
    port: number
    url: string
    processName: string
    attachedToProject: boolean
}

type DetectedProcess = {
    pid: number
    parentPid: number | null
    name: string
    command: string
}

let processInventoryCache: { expiresAt: number; promise: Promise<DetectedProcess[]> } | null = null
let portInventoryCache: { expiresAt: number; promise: Promise<Map<number, number>> } | null = null

export function commandReferencesProjectPath(command: string, projectPath: string, platform = process.platform): boolean {
    if (!String(command || '').trim() || !String(projectPath || '').trim()) return false
    const pathApi = platform === 'win32' ? win32 : posix
    const normalizeForMatch = (value: string) => {
        const normalized = pathApi.normalize(pathApi.resolve(value)).replace(/\\/g, '/')
        return platform === 'win32' ? normalized.toLowerCase() : normalized
    }
    const target = normalizeForMatch(projectPath).replace(/\/$/, '')
    const haystack = (platform === 'win32' ? command.toLowerCase() : command).replace(/\\/g, '/')
    let index = haystack.indexOf(target)
    while (index >= 0) {
        const before = haystack[index - 1] || ''
        const after = haystack[index + target.length] || ''
        const startsAtBoundary = !before || /[\s"'=(:,;]/.test(before)
        const endsAtBoundary = !after || after === '/' || /[\s"',;:)]/.test(after)
        if (startsAtBoundary && endsAtBoundary) return true
        index = haystack.indexOf(target, index + 1)
    }
    return false
}

function isProcessAttachedToProject(pid: number, processByPid: Map<number, DetectedProcess>, projectPath: string): boolean {
    if (!projectPath) return false
    const visited = new Set<number>()
    let currentPid: number | null = pid
    for (let depth = 0; currentPid && depth < 12 && !visited.has(currentPid); depth += 1) {
        visited.add(currentPid)
        const row = processByPid.get(currentPid)
        if (!row) return false
        if (commandReferencesProjectPath(row.command, projectPath)) return true
        currentPid = row.parentPid
    }
    return false
}

function portRange(start: number, end: number): number[] {
    return Array.from({ length: end - start + 1 }, (_, index) => start + index)
}

// Common defaults plus the short auto-increment ranges used by local development tools.
const DEV_SERVER_PORTS = [...new Set([
    1234,
    ...portRange(3000, 3010),
    3333,
    ...portRange(4000, 4010),
    4173,
    4200,
    4321,
    ...portRange(5000, 5010),
    ...portRange(5173, 5180),
    5555,
    6006,
    7007,
    7860,
    ...portRange(8000, 8010),
    ...portRange(8080, 8090),
    8501,
    8787,
    8888,
    ...portRange(9000, 9010),
    19000,
    19001,
    19002
])]

/**
 * Check if a port is in use
 */
async function isPortInUse(port: number): Promise<boolean> {
    const probe = (host: string) => new Promise<boolean>((resolve) => {
        const socket = net.createConnection({ host, port })
        let settled = false
        const finish = (open: boolean) => {
            if (settled) return
            settled = true
            socket.destroy()
            resolve(open)
        }
        socket.setTimeout(180, () => finish(false))
        socket.once('connect', () => finish(true))
        socket.once('error', () => finish(false))
    })
    const results = await Promise.all([probe('127.0.0.1'), probe('::1')])
    return results.some(Boolean)
}

/**
 * Get active ports from common dev server ports
 */
export async function getActivePorts(): Promise<number[]> {
    const activePorts: number[] = []

    // Check ports in parallel (batched to avoid too many simultaneous connections)
    const batchSize = 10
    for (let i = 0; i < DEV_SERVER_PORTS.length; i += batchSize) {
        const batch = DEV_SERVER_PORTS.slice(i, i + batchSize)
        const results = await Promise.all(
            batch.map(async (port) => ({ port, inUse: await isPortInUse(port) }))
        )

        for (const { port, inUse } of results) {
            if (inUse) {
                activePorts.push(port)
            }
        }
    }

    return activePorts
}

/**
 * Get processes running in a specific directory (Windows)
 */
async function getProcessesInDirectory(projectPath: string): Promise<ProcessInfo[]> {
    const resolvedProjectPath = normalize(resolve(projectPath))
    try {
        const rows = await readProcessInventory()
        const processByPid = new Map(rows.map((row) => [row.pid, row]))
        return rows.flatMap((row): ProcessInfo[] => {
            const commandLine = row.command.toLowerCase()
            if (!isProcessAttachedToProject(row.pid, processByPid, resolvedProjectPath)) return []
            let type: ProcessInfo['type'] = row.name.toLowerCase().includes('node') || row.name.toLowerCase().includes('bun')
                ? 'node'
                : row.name.toLowerCase().includes('python')
                    ? 'python'
                    : 'other'
            if (/\b(?:dev|start|serve|vite|next|webpack|parcel|astro|nuxt|uvicorn|gunicorn)\b/i.test(commandLine)) {
                type = 'dev-server'
            }
            return [{
                pid: row.pid,
                name: row.name,
                command: row.command.slice(0, 200),
                type
            }]
        })
    } catch (err) {
        log.warn('[ProcessDetector] Project process inventory unavailable', { errorType: err instanceof Error ? err.name : 'UnknownError' })
        return []
    }
}

async function readWindowsProcesses(): Promise<DetectedProcess[]> {
    const commands = [
        "$ErrorActionPreference='Stop'; @(Get-CimInstance -ClassName Win32_Process -ErrorAction Stop | Select-Object ProcessId,ParentProcessId,Name,CommandLine) | ConvertTo-Json -Compress -Depth 3",
        "$ErrorActionPreference='Stop'; @(Get-WmiObject -Class Win32_Process -ErrorAction Stop | Select-Object ProcessId,ParentProcessId,Name,CommandLine) | ConvertTo-Json -Compress -Depth 3"
    ]
    let stdout = ''
    let lastError: unknown = null
    for (const command of commands) {
        try {
            const result = await execFileAsync('powershell.exe', [
                '-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', command
            ], {
                timeout: 12_000,
                maxBuffer: 8 * 1024 * 1024,
                windowsHide: true
            })
            stdout = result.stdout
            if (stdout.trim()) break
        } catch (error) {
            lastError = error
            await new Promise((resolve) => setTimeout(resolve, 120))
        }
    }
    if (!stdout.trim()) throw lastError instanceof Error ? lastError : new Error('Windows process inventory is unavailable.')
    const parsed = JSON.parse(stdout || '[]') as unknown
    const rows = Array.isArray(parsed) ? parsed : parsed ? [parsed] : []
    return rows.flatMap((entry): DetectedProcess[] => {
        if (!entry || typeof entry !== 'object') return []
        const row = entry as Record<string, unknown>
        const pid = Number(row['ProcessId'])
        const parentPid = Number(row['ParentProcessId'])
        const name = String(row['Name'] || '').trim()
        if (!Number.isInteger(pid) || pid <= 0 || !name) return []
        return [{
            pid,
            parentPid: Number.isInteger(parentPid) && parentPid > 0 ? parentPid : null,
            name,
            command: String(row['CommandLine'] || name)
        }]
    })
}

async function readProcessInventory(): Promise<DetectedProcess[]> {
    const now = Date.now()
    if (processInventoryCache && processInventoryCache.expiresAt > now) return processInventoryCache.promise
    const promise = (process.platform === 'win32' ? readWindowsProcesses() : readPosixProcesses()).then((rows) => {
        processInventoryCache = { expiresAt: Date.now() + PROCESS_INVENTORY_TTL_MS, promise: Promise.resolve(rows) }
        return rows
    }, (error) => {
        processInventoryCache = null
        throw error
    })
    processInventoryCache = { expiresAt: Number.POSITIVE_INFINITY, promise }
    return promise
}

async function readPosixProcesses(): Promise<DetectedProcess[]> {
    const { stdout } = await execAsync('ps -axo pid=,ppid=,comm=,args=', { timeout: 5_000, maxBuffer: 4 * 1024 * 1024 })
    return stdout.split(/\r?\n/).flatMap((line): DetectedProcess[] => {
        const match = line.match(/^\s*(\d+)\s+(\d+)\s+(\S+)\s*(.*)$/)
        if (!match) return []
        const parentPid = Number(match[2])
        return [{
            pid: Number(match[1]),
            parentPid: Number.isInteger(parentPid) && parentPid > 0 ? parentPid : null,
            name: match[3],
            command: match[4] || match[3]
        }]
    })
}

/**
 * Get port listeners for specific ports (Windows)
 */
async function scanPortListeners(): Promise<Map<number, number>> {
    const portToPid = new Map<number, number>()

    try {
        const { stdout } = process.platform === 'win32'
            ? await execAsync('netstat -ano', { timeout: 5_000 })
            : await execAsync('lsof -nP -iTCP -sTCP:LISTEN', { timeout: 5_000 })
        for (const line of stdout.split(/\r?\n/)) {
            const match = process.platform === 'win32'
                ? line.match(/:(\d+)\s+\S+\s+LISTENING\s+(\d+)/i)
                : line.match(/^\S+\s+(\d+)\s+.*:(\d+)\s+\(LISTEN\)\s*$/i)
            if (!match) continue
            const port = Number(process.platform === 'win32' ? match[1] : match[2])
            const pid = Number(process.platform === 'win32' ? match[2] : match[1])
            if (Number.isInteger(pid) && pid > 0) portToPid.set(port, pid)
        }
    } catch (err) {
        if (process.platform !== 'win32') {
            try {
                const { stdout } = await execAsync('ss -ltnp', { timeout: 5_000 })
                for (const line of stdout.split(/\r?\n/)) {
                    const match = line.match(/:(\d+)\s+.*pid=(\d+)/i)
                    if (!match) continue
                    const port = Number(match[1])
                    const pid = Number(match[2])
                    if (Number.isInteger(pid) && pid > 0) portToPid.set(port, pid)
                }
            } catch {
                log.warn('[ProcessDetector] Failed to get port listeners:', err)
            }
        } else {
            log.warn('[ProcessDetector] Failed to get port listeners:', err)
        }
    }

    return portToPid
}

async function getPortListeners(ports?: number[]): Promise<Map<number, number>> {
    const now = Date.now()
    if (!portInventoryCache || portInventoryCache.expiresAt <= now) {
        const promise = scanPortListeners().then((listeners) => {
            portInventoryCache = { expiresAt: Date.now() + PORT_INVENTORY_TTL_MS, promise: Promise.resolve(listeners) }
            return listeners
        }, (error) => {
            portInventoryCache = null
            throw error
        })
        portInventoryCache = { expiresAt: Number.POSITIVE_INFINITY, promise }
    }
    const listeners = await portInventoryCache.promise
    if (!ports) return listeners
    const requested = new Set(ports)
    return new Map([...listeners].filter(([port]) => requested.has(port)))
}

async function detectLocalHttpProtocol(port: number): Promise<'http' | 'https' | null> {
    const probe = (protocol: 'http' | 'https', host: string) => new Promise<boolean>((resolve) => {
        const request = (protocol === 'https' ? httpsRequest : httpRequest)({
            host,
            port,
            path: '/',
            method: 'HEAD',
            timeout: 450,
            ...(protocol === 'https' ? { rejectUnauthorized: false } : {})
        }, (response) => {
            response.resume()
            request.destroy()
            resolve(true)
        })
        request.once('timeout', () => {
            request.destroy()
            resolve(false)
        })
        request.once('error', () => resolve(false))
        request.end()
    })
    for (const protocol of ['http', 'https'] as const) {
        const results = await Promise.all([probe(protocol, '127.0.0.1'), probe(protocol, '::1')])
        if (results.some(Boolean)) return protocol
    }
    return null
}

export function sanitizeLocalServerProcessName(value: string): string {
    const basename = String(value || '').split(/[\\/]/).pop()?.trim().replace(/[\u0000-\u001f\u007f]/g, '') || ''
    return basename.slice(0, 96) || 'Local development server'
}

function isLocalDevelopmentServerCandidate(port: number, processRow: { name: string; command: string } | undefined): boolean {
    if (DEV_SERVER_PORTS.includes(port)) return true
    if (!processRow) return false
    const name = sanitizeLocalServerProcessName(processRow.name).toLowerCase().replace(/\.exe$/, '')
    const command = processRow.command.toLowerCase()
    if (/\b(?:zyra-ui-bridge|browser-assistant-bridge|agent-server[\\/](?:main|bridge-worker))\b/.test(command)) return false
    if (/^(?:node|bun|deno|python\d*|pythonw|ruby|php|java|dotnet|go)$/.test(name)) return true
    return /(?:server|serve|api|caddy|nginx|httpd|jupyter|streamlit|gradio)/.test(name)
        || /\b(?:vite|next|webpack|parcel|astro|nuxt|storybook|uvicorn|gunicorn|flask|django|rails)\b/.test(command)
}

/**
 * Detect all running processes for a project
 */
export async function detectProjectProcesses(projectPath: string): Promise<ProjectProcessStatus> {
    log.debug(`[ProcessDetector] Checking processes for: ${projectPath}`)

    const [activePorts, projectProcesses] = await Promise.all([
        getActivePorts(),
        getProcessesInDirectory(projectPath)
    ])

    // Get PIDs listening on active ports
    const portListeners = await getPortListeners(activePorts)

    // Check if any of our project processes are listening on ports
    for (const [port, pid] of portListeners) {
        const existingProcess = projectProcesses.find(p => p.pid === pid)
        if (existingProcess) {
            existingProcess.port = port
            existingProcess.type = 'dev-server'
        }
    }

    const isLive = projectProcesses.length > 0 || activePorts.length > 0

    log.debug(`[ProcessDetector] Found ${projectProcesses.length} processes, ${activePorts.length} active ports`)

    return {
        isLive,
        processes: projectProcesses,
        activePorts
    }
}

/**
 * Find browser-openable local development servers and classify the selected project's listeners.
 */
const runningLocalServerScans = new Map<string, { expiresAt: number; promise: Promise<RunningLocalServer[]> }>()

async function scanRunningLocalServers(resolvedProjectPath: string): Promise<RunningLocalServer[]> {
    const listeners = await getPortListeners()
    if (listeners.size === 0) return []
    const processRows = await readProcessInventory().catch((error) => {
        log.warn('[ProcessDetector] Process inventory unavailable; falling back to known development ports', { errorType: error instanceof Error ? error.name : 'UnknownError' })
        return []
    })
    const processByPid = new Map(processRows.map((entry) => [entry.pid, entry]))
    const attachedByPid = new Map<number, boolean>()
    const isAttached = (pid: number) => {
        const cached = attachedByPid.get(pid)
        if (cached !== undefined) return cached
        const attached = isProcessAttachedToProject(pid, processByPid, resolvedProjectPath)
        attachedByPid.set(pid, attached)
        return attached
    }
    const candidates = [...listeners.entries()]
        .filter(([port, pid]) => port >= 1_024 && isLocalDevelopmentServerCandidate(port, processByPid.get(pid)))
        .sort(([leftPort, leftPid], [rightPort, rightPid]) => {
            const leftAttached = isAttached(leftPid)
            const rightAttached = isAttached(rightPid)
            return Number(rightAttached) - Number(leftAttached) || leftPort - rightPort
        })
        .slice(0, 128)
    const protocolRows = await Promise.all(candidates.map(async ([port, pid]) => ({
        port,
        pid,
        protocol: await detectLocalHttpProtocol(port)
    })))

    return protocolRows.flatMap((entry): RunningLocalServer[] => {
        if (!entry.protocol) return []
        const processRow = processByPid.get(entry.pid)
        return [{
            pid: entry.pid,
            port: entry.port,
            url: `${entry.protocol}://localhost:${entry.port}/`,
            processName: sanitizeLocalServerProcessName(processRow?.name || ''),
            attachedToProject: isAttached(entry.pid)
        }]
    })
}

export async function detectRunningLocalServers(projectPath?: string): Promise<RunningLocalServer[]> {
    const resolvedProjectPath = String(projectPath || '').trim()
        ? normalize(resolve(String(projectPath)))
        : ''
    const cacheKey = process.platform === 'win32' ? resolvedProjectPath.toLowerCase() : resolvedProjectPath
    const now = Date.now()
    const cached = runningLocalServerScans.get(cacheKey)
    if (cached && cached.expiresAt > now) {
        runningLocalServerScans.delete(cacheKey)
        runningLocalServerScans.set(cacheKey, cached)
        return cached.promise
    }
    const entry = {
        expiresAt: now + LOCAL_SERVER_SCAN_TTL_MS,
        promise: scanRunningLocalServers(resolvedProjectPath)
    }
    runningLocalServerScans.set(cacheKey, entry)
    while (runningLocalServerScans.size > LOCAL_SERVER_SCAN_CACHE_LIMIT) {
        const oldestKey = runningLocalServerScans.keys().next().value
        if (typeof oldestKey !== 'string') break
        runningLocalServerScans.delete(oldestKey)
    }
    return entry.promise
}

/**
 * Quick check if a project has any running processes (faster than full detection).
 */
export async function isProjectLive(projectPath: string): Promise<boolean> {
    const normalizedPath = normalize(resolve(projectPath)).toLowerCase()

    try {
        // Quick check using tasklist with filter
        const { stdout } = await execAsync(
            `tasklist /v /fo csv | findstr /i "${normalizedPath.replace(/\\/g, '\\\\')}"`,
            { timeout: 3000 }
        )

        return stdout.trim().length > 0
    } catch {
        // findstr returns error code if no match - this is expected
        return false
    }
}
