/**
 * Zyra - Terminal Manager
 * Manages multiple terminal sessions with limits and monitoring
 */

import { homedir } from 'os'
import log from 'electron-log'
import { TerminalSession } from './session'
import type { TerminalInfo, TerminalConfig } from './types'
import type { BrowserWindow } from 'electron'

const DEFAULT_CONFIG: TerminalConfig = {
    maxSessions: 10,
    defaultShell: 'powershell',
    timeout: 4 * 60 * 60 * 1000, // 4 hours idle timeout (long-running sessions like node servers)
    maxOutputBuffer: 500000, // 500KB buffer for large outputs
    batchInterval: 16 // Batch output every 16ms (~60fps) for smooth rendering
}

export class TerminalManager {
    private sessions = new Map<string, TerminalSession>()
    private config: TerminalConfig
    private mainWindow: BrowserWindow | null = null
    private cleanupInterval: NodeJS.Timeout | null = null
    private outputBuffer = new Map<string, string[]>()
    private batchTimer: NodeJS.Timeout | null = null
    private outputCallback: ((id: string, data: string) => void) | null = null

    constructor(config: Partial<TerminalConfig> = {}) {
        this.config = { ...DEFAULT_CONFIG, ...config }
        this.startCleanupMonitor()
        this.startOutputBatcher()
    }

    public setMainWindow(window: BrowserWindow): void {
        this.mainWindow = window
    }

    /**
     * Set a callback to receive all terminal output (used by AgentScope)
     */
    public setOutputCallback(callback: (id: string, data: string) => void): void {
        this.outputCallback = callback
    }

    public createSession(
        name?: string,
        cwd?: string,
        shellPreference?: 'cmd' | 'powershell'
    ): TerminalInfo {
        // Check session limit
        if (this.sessions.size >= this.config.maxSessions) {
            throw new Error(`Maximum session limit reached (${this.config.maxSessions})`)
        }

        const id = `term_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`
        const sessionName = name || `Terminal ${this.sessions.size + 1}`
        const sessionCwd = cwd || homedir()

        // Resolve shell
        const shell = this.resolveShell(shellPreference || this.config.defaultShell)

        // Create session with callbacks
        const session = new TerminalSession(
            id,
            sessionName,
            shell,
            sessionCwd,
            (data, type) => this.handleOutput(id, data, type),
            (exitCode) => this.handleClose(id, exitCode)
        )

        this.sessions.set(id, session)
        log.info(`[TerminalManager] Created session ${id} (${this.sessions.size}/${this.config.maxSessions})`)

        return session.info
    }

    public getSession(id: string): TerminalSession | undefined {
        return this.sessions.get(id)
    }

    public getAllSessions(): TerminalInfo[] {
        return Array.from(this.sessions.values()).map(s => s.info)
    }

    public killSession(id: string): boolean {
        const session = this.sessions.get(id)
        if (session) {
            session.destroy()
            this.sessions.delete(id)
            log.info(`[TerminalManager] Killed session ${id} (${this.sessions.size} remaining)`)
            return true
        }
        return false
    }

    public write(id: string, data: string): void {
        const session = this.sessions.get(id)
        if (session) {
            session.write(data)
        } else {
            log.warn(`[TerminalManager] Session ${id} not found for write`)
        }
    }

    public resize(id: string, cols: number, rows: number): void {
        const session = this.sessions.get(id)
        if (session) {
            session.resize(cols, rows)
        }
    }

    public cleanup(): void {
        log.info('[TerminalManager] Cleaning up all sessions')

        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval)
            this.cleanupInterval = null
        }

        if (this.batchTimer) {
            clearInterval(this.batchTimer)
            this.batchTimer = null
        }

        // Flush any remaining buffered output
        this.flushOutputBuffer()

        for (const [id, session] of this.sessions.entries()) {
            session.destroy()
            this.sessions.delete(id)
        }
    }

    private handleOutput(id: string, data: string, type: 'stdout' | 'stderr'): void {
        // Buffer output instead of sending immediately
        if (!this.outputBuffer.has(id)) {
            this.outputBuffer.set(id, [])
        }
        this.outputBuffer.get(id)!.push(data)
    }

    private flushOutputBuffer(): void {
        if (!this.mainWindow || this.mainWindow.isDestroyed()) return

        for (const [id, chunks] of this.outputBuffer.entries()) {
            if (chunks.length === 0) continue

            // Combine all chunks into a single string
            const combinedData = chunks.join('')

            // Forward to output callback (for AgentScope)
            if (this.outputCallback) {
                this.outputCallback(id, combinedData)
            }

            this.mainWindow.webContents.send('devscope:terminal:output', {
                id,
                data: combinedData,
                type: 'stdout'
            })
        }

        // Clear the buffer
        this.outputBuffer.clear()
    }

    private startOutputBatcher(): void {
        // Batch output every 16ms (~60fps) for smooth rendering without overwhelming IPC
        this.batchTimer = setInterval(() => {
            this.flushOutputBuffer()
        }, this.config.batchInterval || 16)
    }

    private handleClose(id: string, exitCode: number): void {
        if (this.mainWindow && !this.mainWindow.isDestroyed()) {
            this.mainWindow.webContents.send('devscope:terminal:output', {
                id,
                data: `\n[Process exited with code ${exitCode}]\n`,
                type: 'close',
                exitCode
            })
        }

        // Auto-cleanup exited sessions after 5 seconds
        setTimeout(() => {
            const session = this.sessions.get(id)
            if (session && session.status === 'exited') {
                this.sessions.delete(id)
                log.info(`[TerminalManager] Auto-removed exited session ${id}`)
            }
        }, 5000)
    }

    private resolveShell(preference: 'cmd' | 'powershell'): string {
        if (process.platform === 'win32') {
            return preference === 'powershell' ? 'powershell.exe' : 'cmd.exe'
        }
        // Fallback for non-Windows (shouldn't happen in Zyra)
        return process.env.SHELL || 'bash'
    }

    private startCleanupMonitor(): void {
        // Check for idle sessions every 5 minutes
        this.cleanupInterval = setInterval(() => {
            const now = Date.now()
            let cleaned = 0

            for (const [id, session] of this.sessions.entries()) {
                const idleTime = session.getIdleTime()

                // Remove sessions idle for longer than timeout
                if (idleTime > this.config.timeout) {
                    log.info(`[TerminalManager] Removing idle session ${id} (idle: ${Math.round(idleTime / 1000)}s)`)
                    session.destroy()
                    this.sessions.delete(id)
                    cleaned++
                }
            }

            if (cleaned > 0) {
                log.info(`[TerminalManager] Cleaned ${cleaned} idle sessions`)
            }
        }, 5 * 60 * 1000) // Every 5 minutes
    }
}

// Singleton instance
let managerInstance: TerminalManager | null = null

export function getTerminalManager(): TerminalManager {
    if (!managerInstance) {
        managerInstance = new TerminalManager()
    }
    return managerInstance
}

export function cleanupTerminalManager(): void {
    if (managerInstance) {
        managerInstance.cleanup()
        managerInstance = null
    }
}
