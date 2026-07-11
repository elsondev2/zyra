import { app } from 'electron'
import { execFile } from 'child_process'
import log from 'electron-log'
import { promisify } from 'util'
import { clearAiDebugLogs, getAiDebugLogs } from '../../ai/ai-debug-log'
import { generateGitCommitMessageWithProvider, testGitTextProviderConnection } from '../../ai/git-text'
import type { DevScopeInstalledPackageRuntime, DevScopePackageRuntimeId } from '../../../shared/contracts/devscope-api'
import type { DevScopeGitTextProvider } from '../../../shared/contracts/devscope-git-contracts'

type CommitAIProvider = DevScopeGitTextProvider
const execFileAsync = promisify(execFile)

const PACKAGE_RUNTIME_DEFINITIONS: Array<{ id: DevScopePackageRuntimeId; name: string; command: string }> = [
    { id: 'node', name: 'Node.js', command: 'node' },
    { id: 'npm', name: 'npm', command: 'npm' },
    { id: 'pnpm', name: 'pnpm', command: 'pnpm' },
    { id: 'yarn', name: 'Yarn', command: 'yarn' },
    { id: 'bun', name: 'Bun', command: 'bun' }
]

export async function handleSetStartupSettings(_event: Electron.IpcMainInvokeEvent, settings: { openAtLogin: boolean; openAsHidden: boolean }) {
    log.info('IPC: setStartupSettings', settings)

    try {
        app.setLoginItemSettings({
            openAtLogin: settings.openAtLogin,
            openAsHidden: settings.openAsHidden
        })
        return { success: true }
    } catch (err: any) {
        log.error('Failed to set startup settings:', err)
        return { success: false, error: err.message }
    }
}

export async function handleGetStartupSettings() {
    log.info('IPC: getStartupSettings')

    try {
        const startupSettings = app.getLoginItemSettings()
        return {
            success: true,
            settings: {
                openAtLogin: startupSettings.openAtLogin,
                openAsHidden: startupSettings.openAsHidden
            }
        }
    } catch (err: any) {
        log.error('Failed to get startup settings:', err)
        return { success: false, error: err.message }
    }
}

async function detectPackageRuntime(command: string): Promise<{ installed: boolean; version?: string; path?: string }> {
    try {
        const versionResult = process.platform === 'win32'
            ? await execFileAsync('cmd.exe', ['/d', '/s', '/c', `${command} --version`], { timeout: 2500, windowsHide: true })
            : await execFileAsync(command, ['--version'], { timeout: 2500 })
        let path: string | undefined
        try {
            const pathResult = process.platform === 'win32'
                ? await execFileAsync('where.exe', [command], { timeout: 2500, windowsHide: true })
                : await execFileAsync('which', [command], { timeout: 2500 })
            path = String(pathResult.stdout || '').split(/\r?\n/).map((line) => line.trim()).find(Boolean)
        } catch {
            path = undefined
        }
        return {
            installed: true,
            version: String(versionResult.stdout || versionResult.stderr || '').trim().split(/\r?\n/)[0],
            path
        }
    } catch {
        return { installed: false }
    }
}

export async function handleListInstalledPackageRuntimes() {
    log.info('IPC: listInstalledPackageRuntimes')
    try {
        const runtimes: DevScopeInstalledPackageRuntime[] = await Promise.all(PACKAGE_RUNTIME_DEFINITIONS.map(async (definition) => ({
            ...definition,
            ...await detectPackageRuntime(definition.command)
        })))
        return { success: true, runtimes }
    } catch (err: any) {
        log.error('Failed to list package runtimes:', err)
        return { success: false, error: err.message }
    }
}

export async function handleTestGroqConnection(_event: Electron.IpcMainInvokeEvent, apiKey: string) {
    log.info('IPC: testGroqConnection')
    return await testGitTextProviderConnection({ provider: 'groq', apiKey })
}

export async function handleTestGeminiConnection(_event: Electron.IpcMainInvokeEvent, apiKey: string) {
    log.info('IPC: testGeminiConnection')
    return await testGitTextProviderConnection({ provider: 'gemini', apiKey })
}

export async function handleTestCodexConnection(_event: Electron.IpcMainInvokeEvent, model?: string) {
    log.info('IPC: testCodexConnection')
    return await testGitTextProviderConnection({ provider: 'codex', model })
}

export async function handleGenerateCommitMessage(
    _event: Electron.IpcMainInvokeEvent,
    provider: CommitAIProvider,
    apiKey: string,
    diff: string,
    model?: string
) {
    log.info('IPC: generateCommitMessage', { provider, model })
    return await generateGitCommitMessageWithProvider({ provider, apiKey, diff, model })
}

export async function handleGetAiDebugLogs(_event: Electron.IpcMainInvokeEvent, limit?: number) {
    log.info('IPC: getAiDebugLogs', { limit })
    try {
        const logs = await getAiDebugLogs(limit)
        return { success: true, logs }
    } catch (err: any) {
        log.error('Failed to get AI debug logs:', err)
        return { success: false, error: err.message }
    }
}

export async function handleClearAiDebugLogs() {
    log.info('IPC: clearAiDebugLogs')
    try {
        await clearAiDebugLogs()
        return { success: true }
    } catch (err: any) {
        log.error('Failed to clear AI debug logs:', err)
        return { success: false, error: err.message }
    }
}
