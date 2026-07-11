/**
 * Zyra - Terminal Capabilities Detection
 * Detects available shells and their features
 */

import { commandExists, getCommandVersion } from '../safe-exec'
import type { TerminalCapability } from './types'
import log from 'electron-log'

/**
 * Detect available shells on the system
 */
export async function detectTerminalCapabilities(): Promise<TerminalCapability[]> {
    log.info('[Terminal] Detecting shell capabilities...')

    const shells: Array<{ shell: string; displayName: string; versionArg?: string }> = []

    if (process.platform === 'win32') {
        shells.push(
            { shell: 'powershell.exe', displayName: 'PowerShell', versionArg: '-Command $PSVersionTable.PSVersion.ToString()' },
            { shell: 'cmd.exe', displayName: 'Command Prompt', versionArg: '/c ver' },
            { shell: 'pwsh.exe', displayName: 'PowerShell Core' }
        )
    } else {
        shells.push(
            { shell: 'bash', displayName: 'Bash' },
            { shell: 'zsh', displayName: 'Zsh' },
            { shell: 'fish', displayName: 'Fish' },
            { shell: 'sh', displayName: 'Bourne Shell' }
        )
    }

    const capabilities: TerminalCapability[] = []

    for (const { shell, displayName, versionArg } of shells) {
        const available = await commandExists(shell)
        let version: string | null = null

        if (available) {
            version = await getCommandVersion(shell, versionArg)
        }

        capabilities.push({
            shell,
            displayName,
            version,
            path: available ? shell : null,
            available,
            isDefault: shell === 'powershell.exe' || shell === 'bash'
        })
    }

    const availableCount = capabilities.filter(c => c.available).length
    log.info(`[Terminal] Found ${availableCount} available shells`)

    return capabilities
}

/**
 * Get terminal banner with system info
 */
export function getTerminalBanner(username: string, hostname: string, cwd?: string): string {
    const ascii = `\x1b[36m
    ██
 ██████╗ ███████╗██╗   ██╗███████╗ ██████╗ ██████╗ ██████╗ ███████╗
 ██╔══██╗██╔════╝██║   ██║██╔════╝██╔════╝██╔═══██╗██╔══██╗██╔════╝
 ██║  ██║█████╗  ██║   ██║███████╗██║     ██║   ██║██████╔╝█████╗
 ██║  ██║██╔══╝  ╚██╗ ██╔╝╚════██║██║     ██║   ██║██╔═══╝ ██╔══╝
 ██████╔╝███████╗ ╚████╔╝ ███████║╚██████╗╚██████╔╝██║     ███████╗
 ╚═════╝ ╚══════╝  ╚═══╝  ╚══════╝ ╚═════╝ ╚═════╝ ╚═╝     ╚══════╝\x1b[0m\r\n`

    let banner = ascii
    banner += `\r\n\x1b[36m╭─ Zyra Shell\x1b[0m\r\n`
    banner += `\x1b[36m├─\x1b[0m \x1b[32m${username}@${hostname}\x1b[0m\r\n`
    if (cwd) {
        banner += `\x1b[36m╰─\x1b[0m \x1b[33mRunning from:\x1b[0m ${cwd}`
    } else {
        banner += `\x1b[36m╰─\x1b[0m Ready`
    }
    return banner
}
