/**
 * Zyra - Safe Command Execution
 * Whitelisted commands only - no shell injection
 */

import { execFile as execFileCallback } from 'child_process'
import { promisify } from 'util'
import log from 'electron-log'

const execFileAsync = promisify(execFileCallback)

// Cache for command existence checks (cleared on app restart)
const commandExistsCache = new Map<string, boolean>()
const versionCache = new Map<string, string | null>()
const commandPathCache = new Map<string, string | null>()

/**
 * Get environment with fixed PATH for common tools
 */
export function getAugmentedEnv(): NodeJS.ProcessEnv {
    const env = { ...process.env }

    // Add common tool paths if missing
    if (process.platform === 'win32') {
        const commonPaths = [
            'C:\\Program Files\\nodejs',
            'C:\\Program Files (x86)\\nodejs',
            process.env.APPDATA ? `${process.env.APPDATA}\\npm` : '',
            process.env.LOCALAPPDATA ? `${process.env.LOCALAPPDATA}\\Microsoft\\WindowsApps` : ''
        ].filter(Boolean)

        let pathKey = 'Path' // Windows checks case-insensitive, but env key might be Path or PATH
        if (!env[pathKey] && env.PATH) pathKey = 'PATH'
        if (!env[pathKey]) {
            env[pathKey] = ''
        }

        const currentPath = env[pathKey] || ''
        const missingPaths = commonPaths.filter(p => !currentPath.toLowerCase().includes(p.toLowerCase()))

        if (missingPaths.length > 0) {
            env[pathKey] = `${currentPath};${missingPaths.join(';')}`
        }
    } else {
        // macOS/Linux: Fix /usr/local/bin issues on macOS apps
        const commonPaths = ['/usr/local/bin', '/usr/bin', '/bin', '/usr/sbin', '/sbin']
        const currentPath = env.PATH || ''
        const missingPaths = commonPaths.filter(p => !currentPath.includes(p))

        if (missingPaths.length > 0) {
            env.PATH = `${currentPath}:${missingPaths.join(':')}`
        }
    }

    return env
}

/**
 * Whitelisted commands for security
 * Only these commands can be executed
 */
const ALLOWED_COMMANDS = new Set([
    // Languages & Runtimes
    'node', 'python', 'python3', 'py', 'java', 'dotnet', 'go', 'rustc', 'rust', 'ruby', 'php',
    // Package Managers
    'npm', 'pnpm', 'yarn', 'pip', 'pip3', 'poetry', 'conda', 'choco', 'chocolatey', 'winget', 'gem', 'composer',
    // Build Tools
    'cmake', 'make', 'gradle', 'mvn', 'maven', 'msbuild',
    // Containers
    'docker', 'podman', 'wsl',
    // Version Control
    'git', 'git-lfs',
    // AI & ML Runtimes
    'ollama', 'nvcc', 'nvidia-smi',
    // AI Agents & Coding Assistants
    'claude', 'gh', 'aider', 'cursor', 'cody', 'continue', 'q', 'tabnine', 'codeium',
    'goose', 'mentat', 'gpt-engineer', 'sweep', 'gemini', 'opencode', 'droid', 'interpreter',
    'fabric', 'sgpt', 'shell-gpt', 'plandex', 'openhands', 'windsurf', 'zed', 'amp', 'roo', 'cline', 'kilo',
    // System utilities & Shells
    'powershell', 'powershell.exe', 'pwsh', 'pwsh.exe', 'cmd', 'cmd.exe', 'bash', 'zsh', 'fish', 'sh', 'where', 'which', 'pgrep'
])

/**
 * Check if a command is whitelisted
 */
export function isCommandAllowed(command: string): boolean {
    const baseCommand = command.split(/[\\\/]/).pop()?.split('.')[0]?.toLowerCase() || ''
    return ALLOWED_COMMANDS.has(baseCommand) || ALLOWED_COMMANDS.has(command.toLowerCase())
}

/**
 * Safely execute a command with arguments
 * Uses execFile to prevent shell injection
 */
export async function safeExec(
    command: string,
    args: string[] = [],
    options: { timeout?: number; cwd?: string } = {}
): Promise<{ stdout: string; stderr: string }> {
    if (!isCommandAllowed(command)) {
        throw new Error(`Command not whitelisted: ${command}`)
    }

    try {
        const result = await execFileAsync(command, args, {
            timeout: options.timeout || 5000, // Reduced from 10s to 5s
            cwd: options.cwd,
            windowsHide: true,
            maxBuffer: 1024 * 1024, // 1MB
            env: getAugmentedEnv()
        })
        return {
            stdout: result.stdout?.toString() || '',
            stderr: result.stderr?.toString() || ''
        }
    } catch (error: any) {
        // Command not found or failed
        if (error.code === 'ENOENT') {
            return { stdout: '', stderr: `Command not found: ${command}` }
        }
        // Return stdout/stderr even on non-zero exit
        return {
            stdout: error.stdout?.toString() || '',
            stderr: error.stderr?.toString() || error.message
        }
    }
}

export async function findCommandPath(command: string, options?: { useCache?: boolean }): Promise<string | null> {
    const useCache = options?.useCache !== false
    if (useCache && commandPathCache.has(command)) {
        return commandPathCache.get(command) ?? null
    }

    try {
        const locateCmd = process.platform === 'win32' ? 'where' : 'which'
        const result = await safeExec(locateCmd, [command], { timeout: 3000 })
        const lines = String(result.stdout || '')
            .split(/\r?\n/)
            .map((line) => line.trim())
            .filter(Boolean)
        if (lines[0]) {
            commandPathCache.set(command, lines[0])
            return lines[0]
        }
    } catch {
        // Fall through.
    }

    commandPathCache.set(command, null)
    return null
}

/**
 * Check if a command exists on the system (with caching)
 */
export async function commandExists(command: string): Promise<boolean> {
    // Check cache first
    if (commandExistsCache.has(command)) {
        return commandExistsCache.get(command)!
    }

    const exists = Boolean(await findCommandPath(command))
    commandExistsCache.set(command, exists)
    return exists
}

/**
 * Get version from a command (with caching)
 */
export async function getCommandVersion(
    command: string,
    versionArg: string = '--version'
): Promise<string | null> {
    const cacheKey = `${command}:${versionArg}`

    // Check cache first
    if (versionCache.has(cacheKey)) {
        return versionCache.get(cacheKey)!
    }

    try {
        const result = await safeExec(command, [versionArg], { timeout: 5000 })
        const output = result.stdout || result.stderr

        // Try multiple version patterns
        const patterns = [
            /v?(\d+\.\d+\.\d+[-.\w]*)/i,           // Standard semver: 1.2.3, v1.2.3, 1.2.3-beta
            /version\s*[:\s]?\s*v?(\d+\.\d+\.?\d*[-.\w]*)/i, // "version: 1.2.3" or "version 1.2.3"
            /(\d+\.\d+\.?\d*)/,                     // Basic version: 1.2 or 1.2.3
            /build\s+(\d+)/i,                       // Build number fallback
        ]

        for (const pattern of patterns) {
            const match = output.match(pattern)
            if (match && match[1]) {
                versionCache.set(cacheKey, match[1])
                return match[1]
            }
        }

        versionCache.set(cacheKey, null)
        return null
    } catch (error) {
        log.debug(`Failed to get version for ${command}:`, error)
        versionCache.set(cacheKey, null)
        return null
    }
}

/**
 * Clear all caches (call on refresh)
 */
export function clearCommandCache(): void {
    commandExistsCache.clear()
    versionCache.clear()
    commandPathCache.clear()
}
