import { execFile } from 'node:child_process'
import { chmod, readFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { app } from 'electron'
import { writeBytesAtomically } from './setup/atomic-json'

const execFileAsync = promisify(execFile)
const MARKER = 'zyra-desktop-managed-launcher:v1'

export type TerminalCommandStatus = {
    path: string
    installed: boolean
    managed: boolean
    pathConfigured: boolean
}

export async function getTerminalCommandStatus(): Promise<TerminalCommandStatus> {
    const target = launcherPath()
    let contents = ''
    try { contents = await readFile(target, 'utf8') } catch {}
    return {
        path: target,
        installed: Boolean(contents),
        managed: contents.includes(MARKER) || contents.includes('zyra-managed-launcher:v1'),
        pathConfigured: pathEntries().includes(path.dirname(target).toLowerCase())
    }
}

export async function installTerminalCommand(): Promise<TerminalCommandStatus> {
    const current = await getTerminalCommandStatus()
    if (current.installed && !current.managed) throw new Error(`Refusing to replace an unmanaged command at ${current.path}.`)
    const executable = process.platform === 'linux' && process.env.APPIMAGE ? process.env.APPIMAGE : app.getPath('exe')
    const contents = process.platform === 'win32'
        ? `@echo off\r\nrem ${MARKER}\r\nset "ZYRA_ROOT=${escapeBatchPath(path.join(process.resourcesPath, 'zyra-runtime'))}"\r\nset "ZYRA_DATA_ROOT=%USERPROFILE%"\r\nset "ZYRA_DISTRIBUTION=desktop-bundle"\r\n"${escapeBatchPath(path.join(process.resourcesPath, 'zyra-node', 'node.exe'))}" "${escapeBatchPath(path.join(process.resourcesPath, 'zyra-runtime', 'bin', 'zyra.mjs'))}" %*\r\nexit /b %ERRORLEVEL%\r\n`
        : `#!/bin/sh\n# ${MARKER}\nexec "${escapeShellDoubleQuoted(executable)}" --tui "$@"\n`
    await writeBytesAtomically(current.path, contents)
    if (process.platform !== 'win32') await chmod(current.path, 0o755)
    if (process.platform === 'win32' && !current.pathConfigured) await addWindowsUserPath(path.dirname(current.path))
    return getTerminalCommandStatus()
}

export async function removeTerminalCommand(): Promise<TerminalCommandStatus> {
    const current = await getTerminalCommandStatus()
    if (current.installed && !current.managed) throw new Error(`Refusing to remove an unmanaged command at ${current.path}.`)
    await rm(current.path, { force: true })
    if (process.platform === 'win32' && current.pathConfigured) await removeWindowsUserPath(path.dirname(current.path))
    return getTerminalCommandStatus()
}

function launcherPath(): string {
    if (process.platform === 'win32') return path.join(process.env.LOCALAPPDATA || app.getPath('userData'), 'Zyra', 'bin', 'zyra.cmd')
    return path.join(os.homedir(), '.local', 'bin', 'zyra')
}

function pathEntries(): string[] {
    return String(process.env.PATH || '').split(path.delimiter).filter(Boolean).map((entry) => path.resolve(entry).toLowerCase())
}

async function addWindowsUserPath(directory: string): Promise<void> {
    const script = [
        '$dir=$args[0]',
        '$current=[Environment]::GetEnvironmentVariable("Path","User")',
        '$parts=@($current -split ";" | Where-Object { $_ })',
        'if($parts -notcontains $dir){[Environment]::SetEnvironmentVariable("Path",(($parts+$dir)-join ";"),"User")}'
    ].join(';')
    await execFileAsync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script, directory], { windowsHide: true })
    if (!pathEntries().includes(path.resolve(directory).toLowerCase())) process.env.PATH = `${process.env.PATH || ''}${path.delimiter}${directory}`
}

async function removeWindowsUserPath(directory: string): Promise<void> {
    const script = [
        '$dir=$args[0]',
        '$current=[Environment]::GetEnvironmentVariable("Path","User")',
        '$parts=@($current -split ";" | Where-Object { $_ -and $_ -ne $dir })',
        '[Environment]::SetEnvironmentVariable("Path",($parts -join ";"),"User")'
    ].join(';')
    await execFileAsync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script, directory], { windowsHide: true })
    process.env.PATH = String(process.env.PATH || '').split(path.delimiter).filter((entry) => path.resolve(entry).toLowerCase() !== path.resolve(directory).toLowerCase()).join(path.delimiter)
}

function escapeBatchPath(value: string): string {
    return value.replaceAll('%', '%%')
}

function escapeShellDoubleQuoted(value: string): string {
    return value.replace(/[\\"$`]/g, '\\$&')
}
