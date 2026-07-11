/**
 * Zyra - Terminal Types
 */

export interface TerminalInfo {
    id: string
    name: string
    shell: string
    cwd: string
    status: 'active' | 'exited' | 'error'
    createdAt: number
    lastActivity: number
    error?: string
}

export interface TerminalSession {
    id: string
    name: string
    shell: string
    cwd: string
    status: 'active' | 'exited' | 'error'
    createdAt: number
    lastActivity: number
    error?: string
}

export interface TerminalCapability {
    shell: string
    displayName: string
    version: string | null
    path: string | null
    available: boolean
    isDefault: boolean
}

export interface TerminalConfig {
    maxSessions: number
    defaultShell: 'powershell' | 'cmd'
    timeout: number
    maxOutputBuffer: number
    batchInterval?: number // Milliseconds between output batches (default: 16ms for ~60fps)
}

export interface TerminalOutputPayload {
    id: string
    data: string
    type: 'stdout' | 'stderr' | 'close'
    exitCode?: number
}
