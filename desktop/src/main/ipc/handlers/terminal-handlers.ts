import { app } from 'electron'
import { spawn } from 'child_process'
import { access, stat, unlink, writeFile } from 'fs/promises'
import { dirname, join } from 'path'
import log from 'electron-log'
import { buildLinuxTerminalLaunchCommands, buildMacTerminalScript } from './platform-terminal-launcher'

function launchDetached(executable: string, args: string[], cwd: string): Promise<void> {
    return new Promise((resolve, reject) => {
        const child = spawn(executable, args, {
            cwd,
            detached: true,
            stdio: 'ignore'
        })
        child.once('spawn', () => {
            child.unref()
            resolve()
        })
        child.once('error', reject)
    })
}

export async function handleOpenInTerminal(
    _event: Electron.IpcMainInvokeEvent,
    targetPath: string,
    preferredShell: 'powershell' | 'cmd' = 'powershell',
    initialCommand?: string
) {
    log.info('IPC: openInTerminal', { targetPath, preferredShell, hasCommand: Boolean(initialCommand?.trim()) })

    try {
        if (!targetPath) {
            return { success: false, error: 'Path is required' }
        }

        let cwd = targetPath
        const targetStats = await stat(targetPath)
        if (!targetStats.isDirectory()) {
            cwd = dirname(targetPath)
        }

        await access(cwd)

        if (process.platform === 'darwin') {
            const commandToRun = initialCommand?.trim()
            if (!commandToRun) {
                await launchDetached('open', ['-a', 'Terminal', cwd], cwd)
                return { success: true }
            }

            const tempScriptPath = join(app.getPath('temp'), `zyra-run-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.command`)
            await writeFile(tempScriptPath, buildMacTerminalScript({
                cwd,
                initialCommand: commandToRun,
                shellPath: process.env.SHELL
            }), { encoding: 'utf-8', mode: 0o700 })
            await launchDetached('open', ['-a', 'Terminal', tempScriptPath], cwd)
            setTimeout(() => unlink(tempScriptPath).catch(() => undefined), 60_000)
            return { success: true }
        }

        if (process.platform === 'linux') {
            const candidates = buildLinuxTerminalLaunchCommands({
                cwd,
                initialCommand,
                shellPath: process.env.SHELL
            })
            let lastError: unknown = null
            for (const candidate of candidates) {
                try {
                    await launchDetached(candidate.executable, candidate.args, cwd)
                    return { success: true }
                } catch (error) {
                    lastError = error
                }
            }
            const detail = lastError instanceof Error ? ` ${lastError.message}` : ''
            return { success: false, error: `No supported graphical terminal was found.${detail}` }
        }

        if (process.platform !== 'win32') {
            return { success: false, error: `Opening a terminal is unavailable on ${process.platform}.` }
        }

        const normalizedShell: 'powershell' | 'cmd' = preferredShell === 'cmd' ? 'cmd' : 'powershell'
        const commandToRun = initialCommand?.trim()
        const hasCommand = Boolean(commandToRun)

        let executable = normalizedShell === 'cmd' ? 'cmd.exe' : 'powershell.exe'
        let args: string[] = []
        let tempScriptPath: string | null = null

        if (hasCommand) {
            const scriptSuffix = normalizedShell === 'cmd' ? 'cmd' : 'ps1'
            const scriptName = `devscope-run-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${scriptSuffix}`
            tempScriptPath = join(app.getPath('temp'), scriptName)

            if (normalizedShell === 'cmd') {
                const cmdScript = [
                    '@echo off',
                    `cd /d "${cwd}"`,
                    commandToRun!,
                    ''
                ].join('\r\n')
                await writeFile(tempScriptPath, cmdScript, 'utf-8')
                executable = 'cmd.exe'
                args = ['/k', tempScriptPath]
            } else {
                const escapedCwd = cwd.replace(/'/g, "''")
                const psScript = [
                    `$ErrorActionPreference = 'Continue'`,
                    `Set-Location -LiteralPath '${escapedCwd}'`,
                    commandToRun!,
                    ''
                ].join('\r\n')
                await writeFile(tempScriptPath, psScript, 'utf-8')
                executable = 'powershell.exe'
                args = ['-NoExit', '-ExecutionPolicy', 'Bypass', '-File', tempScriptPath]
            }
        } else {
            if (normalizedShell === 'cmd') {
                args = ['/k', `cd /d "${cwd}"`]
            } else {
                const escapedCwd = cwd.replace(/'/g, "''")
                args = ['-NoExit', '-Command', `Set-Location -LiteralPath '${escapedCwd}'`]
            }
        }

        const launcherArgs = ['/d', '/s', '/c', 'start', '""', executable, ...args]
        await new Promise<void>((resolve, reject) => {
            const launcher = spawn('cmd.exe', launcherArgs, {
                cwd,
                stdio: 'ignore',
                windowsHide: true
            })

            launcher.once('error', (error) => {
                reject(error)
            })

            launcher.once('close', (code) => {
                if (code === 0) {
                    resolve()
                    return
                }
                reject(new Error(`Terminal launcher exited with code ${code}`))
            })
        })

        if (tempScriptPath) {
            setTimeout(() => {
                unlink(tempScriptPath!).catch(() => undefined)
            }, 20000)
        }

        return { success: true }
    } catch (err: any) {
        log.error('Failed to open terminal:', err)
        return { success: false, error: err.message }
    }
}
