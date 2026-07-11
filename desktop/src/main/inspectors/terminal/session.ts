/**
 * Zyra - Terminal Session
 * Manages individual PTY sessions with security and monitoring
 */

import * as pty from 'node-pty'
import { homedir } from 'os'
import log from 'electron-log'
import type { TerminalSession as ITerminalSession } from './types'
import { getAugmentedEnv } from '../safe-exec'

export class TerminalSession {
    public readonly id: string
    public readonly name: string
    public readonly createdAt: number
    public lastActivity: number
    public status: 'active' | 'exited' | 'error' = 'active'

    private ptyProcess: pty.IPty | null = null
    private currentShell: string
    private currentCwd: string
    private outputCallback: ((data: string, type: 'stdout' | 'stderr') => void) | null = null
    private closeCallback: ((exitCode: number) => void) | null = null
    private lastError: string | null = null

    constructor(
        id: string,
        name: string,
        shell: string,
        cwd: string,
        onOutput: (data: string, type: 'stdout' | 'stderr') => void,
        onClose: (exitCode: number) => void
    ) {
        this.id = id
        this.name = name
        this.currentShell = shell
        this.currentCwd = cwd
        this.createdAt = Date.now()
        this.lastActivity = Date.now()
        this.outputCallback = onOutput
        this.closeCallback = onClose

        this.spawn()
    }

    public get info(): ITerminalSession {
        return {
            id: this.id,
            name: this.name,
            shell: this.currentShell,
            cwd: this.cwd,
            status: this.status,
            createdAt: this.createdAt,
            lastActivity: this.lastActivity,
            error: this.lastError || undefined
        }
    }

    public getError(): string | null {
        return this.lastError
    }

    public get cwd(): string {
        // Return the stored cwd - we track this ourselves since node-pty doesn't
        // provide a reliable way to get the current working directory
        return this.currentCwd
    }

    private spawn(): void {
        log.info(`[Terminal:${this.id}] Spawning ${this.currentShell} in ${this.currentCwd}`)

        try {
            // Pass full environment for maximum CLI tool compatibility
            // This ensures tools like npm, claude, gemini, node, etc. work correctly
            const augmentedEnv = getAugmentedEnv()
            const shellEnv = {
                ...augmentedEnv,
                // Ensure these are always set
                TERM: 'xterm-256color',
                COLORTERM: 'truecolor',
                FORCE_COLOR: '1',
                // Override NODE_ENV for dev tools
                NODE_ENV: process.env.NODE_ENV || 'development'
            }

            this.ptyProcess = pty.spawn(this.currentShell, [], {
                name: 'xterm-256color',
                cols: 80,
                rows: 30,
                cwd: this.currentCwd,
                env: shellEnv as any,
                // Windows-specific options
                useConpty: process.platform === 'win32',
                conptyInheritCursor: true
            })

            // Handle data output - forward ALL output to frontend
            this.ptyProcess.onData((data) => {
                this.lastActivity = Date.now()

                if (this.outputCallback) {
                    // Remove verbose logging that slows down output
                    this.outputCallback(data, 'stdout')
                }
            })

            // Handle exit
            this.ptyProcess.onExit((res) => {
                this.status = 'exited'
                log.info(`[Terminal:${this.id}] Exited with code ${res.exitCode}`)

                if (this.closeCallback) {
                    this.closeCallback(res.exitCode)
                }

                this.ptyProcess = null
            })

        } catch (err: any) {
            this.status = 'error'
            this.lastError = err.message || String(err)
            log.error(`[Terminal:${this.id}] Failed to spawn:`, err)
            throw err
        }
    }

    public write(data: string): void {
        if (this.ptyProcess && this.status === 'active') {
            this.lastActivity = Date.now()
            this.ptyProcess.write(data)
        } else {
            log.warn(`[Terminal:${this.id}] Cannot write - session not active`)
        }
    }

    public resize(cols: number, rows: number): void {
        if (this.ptyProcess && this.status === 'active') {
            try {
                this.ptyProcess.resize(cols, rows)
                log.debug(`[Terminal:${this.id}] Resized to ${cols}x${rows}`)
            } catch (err) {
                log.warn(`[Terminal:${this.id}] Resize failed:`, err)
            }
        }
    }

    public destroy(): void {
        log.info(`[Terminal:${this.id}] Destroying session`)

        if (this.ptyProcess) {
            try {
                this.ptyProcess.kill()
            } catch (err) {
                log.warn(`[Terminal:${this.id}] Kill failed:`, err)
            }
            this.ptyProcess = null
        }

        this.status = 'exited'
        this.outputCallback = null
        this.closeCallback = null
    }

    public isActive(): boolean {
        return this.status === 'active' && this.ptyProcess !== null
    }

    public getIdleTime(): number {
        return Date.now() - this.lastActivity
    }
}
