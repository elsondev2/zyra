/**
 * Zyra - Process Detector
 * Detects running development processes for a project
 * Checks for dev servers, node processes, and other development tools
 */

import { exec } from 'child_process'
import { promisify } from 'util'
import { normalize, resolve } from 'path'
import log from 'electron-log'
import net from 'net'

const execAsync = promisify(exec)

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

// Common development server ports
const DEV_SERVER_PORTS = [
    3000,  // React, Next.js, Express default
    3001,  // React alternate
    4200,  // Angular
    5173,  // Vite
    5174,  // Vite alternate
    5000,  // Flask, Various
    8000,  // Django, Python HTTP
    8080,  // Common dev server
    8081,  // Metro bundler (React Native)
    4000,  // Phoenix, GraphQL
    9000,  // PHP built-in
    1234,  // Parcel
    4321,  // Astro
    3333,  // Adonis
    5555,  // Expo
    19000, // Expo
    19001, // Expo
    19002, // Expo DevTools
]

/**
 * Check if a port is in use
 */
async function isPortInUse(port: number): Promise<boolean> {
    return new Promise((resolve) => {
        const server = net.createServer()

        server.once('error', (err: any) => {
            if (err.code === 'EADDRINUSE') {
                resolve(true)
            } else {
                resolve(false)
            }
        })

        server.once('listening', () => {
            server.close()
            resolve(false)
        })

        server.listen(port, '127.0.0.1')
    })
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
    const processes: ProcessInfo[] = []
    const normalizedPath = normalize(resolve(projectPath)).toLowerCase()

    try {
        // Use WMIC to get processes with their command line
        const { stdout } = await execAsync(
            'wmic process get processid,name,commandline /format:csv',
            { timeout: 5000, maxBuffer: 1024 * 1024 }
        )

        const lines = stdout.trim().split('\n').slice(1) // Skip header

        for (const line of lines) {
            if (!line.trim()) continue

            const parts = line.split(',')
            if (parts.length < 4) continue

            const commandLine = parts.slice(1, -2).join(',').toLowerCase()
            const name = parts[parts.length - 2]?.trim()
            const pid = parseInt(parts[parts.length - 1]?.trim(), 10)

            if (isNaN(pid) || !name) continue

            // Check if process is related to our project path
            if (commandLine.includes(normalizedPath)) {
                let type: ProcessInfo['type'] = 'other'

                if (name.toLowerCase().includes('node')) {
                    type = 'node'
                } else if (name.toLowerCase().includes('python')) {
                    type = 'python'
                }

                // Check if it's a dev server by checking command line
                if (
                    commandLine.includes('dev') ||
                    commandLine.includes('start') ||
                    commandLine.includes('serve') ||
                    commandLine.includes('vite') ||
                    commandLine.includes('next') ||
                    commandLine.includes('webpack')
                ) {
                    type = 'dev-server'
                }

                processes.push({
                    pid,
                    name,
                    command: commandLine.substring(0, 200), // Truncate
                    type
                })
            }
        }
    } catch (err) {
        log.warn('[ProcessDetector] Failed to get processes:', err)
    }

    return processes
}

/**
 * Get port listeners for specific ports (Windows)
 */
async function getPortListeners(ports: number[]): Promise<Map<number, number>> {
    const portToPid = new Map<number, number>()

    try {
        const { stdout } = await execAsync('netstat -ano -p TCP', { timeout: 5000 })
        const lines = stdout.trim().split('\n')

        for (const line of lines) {
            const match = line.match(/:(\d+)\s+.*LISTENING\s+(\d+)/)
            if (match) {
                const port = parseInt(match[1], 10)
                const pid = parseInt(match[2], 10)

                if (ports.includes(port)) {
                    portToPid.set(port, pid)
                }
            }
        }
    } catch (err) {
        log.warn('[ProcessDetector] Failed to get port listeners:', err)
    }

    return portToPid
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
 * Quick check if project has any running processes (faster than full detection)
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
