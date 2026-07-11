import { spawn } from 'child_process'
import { access, stat } from 'fs/promises'
import { dirname, extname, join, resolve } from 'path'
import log from 'electron-log'
import { commandExists, getAugmentedEnv } from '../../inspectors/safe-exec'

export const PYTHON_PREVIEW_EVENT_CHANNEL = 'devscope:pythonPreview:event'

type PythonPreviewEventPayload = {
    sessionId: string
    type: 'started' | 'stdout' | 'stderr' | 'exit' | 'error'
    text?: string
    code?: number | null
    signal?: string | null
    pid?: number | null
    interpreter?: string
    command?: string
    stopped?: boolean
}

type RunningPythonPreview = {
    sessionId: string
    key: string
    proc: ReturnType<typeof spawn>
    webContents: Electron.WebContents
    stopRequested: boolean
}

type InterpreterResolution = {
    command: string
    baseArgs: string[]
    label: string
}

const pythonPreviewRuns = new Map<string, RunningPythonPreview>()

function normalizeSessionId(raw: unknown): string {
    const value = String(raw || '').trim()
    return value.length > 0 ? value : ''
}

function getRunKey(senderId: number, sessionId: string): string {
    return `${senderId}:${sessionId}`
}

function emitPreviewEvent(run: RunningPythonPreview, payload: PythonPreviewEventPayload): void {
    if (run.webContents.isDestroyed()) return
    run.webContents.send(PYTHON_PREVIEW_EVENT_CHANNEL, payload)
}

async function isFilePath(pathValue: string): Promise<boolean> {
    try {
        const stats = await stat(pathValue)
        return stats.isFile()
    } catch {
        return false
    }
}

async function resolvePythonInterpreter(projectPath?: string): Promise<InterpreterResolution | null> {
    const normalizedProjectPath = String(projectPath || '').trim()
    const candidates: string[] = []

    if (normalizedProjectPath) {
        if (process.platform === 'win32') {
            candidates.push(
                join(normalizedProjectPath, '.venv', 'Scripts', 'python.exe'),
                join(normalizedProjectPath, 'venv', 'Scripts', 'python.exe')
            )
        } else {
            candidates.push(
                join(normalizedProjectPath, '.venv', 'bin', 'python'),
                join(normalizedProjectPath, 'venv', 'bin', 'python')
            )
        }
    }

    for (const candidate of candidates) {
        if (await isFilePath(candidate)) {
            return {
                command: candidate,
                baseArgs: [],
                label: candidate
            }
        }
    }

    if (process.platform === 'win32' && await commandExists('py')) {
        return {
            command: 'py',
            baseArgs: ['-3'],
            label: 'py -3'
        }
    }

    if (await commandExists('python')) {
        return {
            command: 'python',
            baseArgs: [],
            label: 'python'
        }
    }

    if (await commandExists('python3')) {
        return {
            command: 'python3',
            baseArgs: [],
            label: 'python3'
        }
    }

    return null
}

function stopRun(run: RunningPythonPreview): boolean {
    if (run.proc.killed) return false
    run.stopRequested = true

    try {
        run.proc.kill()
    } catch {
        return false
    }

    const hardKillTimer = setTimeout(() => {
        if (run.proc.killed) return
        try {
            run.proc.kill('SIGKILL')
        } catch {
            // ignore hard-kill errors
        }
    }, 1500)

    run.proc.once('exit', () => {
        clearTimeout(hardKillTimer)
    })

    return true
}

async function stopExistingRunIfNeeded(runKey: string): Promise<void> {
    const existing = pythonPreviewRuns.get(runKey)
    if (!existing) return
    stopRun(existing)
}

export async function handleRunPythonPreview(
    event: Electron.IpcMainInvokeEvent,
    input: { sessionId: string; filePath: string; projectPath?: string }
) {
    const sessionId = normalizeSessionId(input?.sessionId)
    const filePath = resolve(String(input?.filePath || ''))
    const providedProjectPath = String(input?.projectPath || '').trim()

    log.info('IPC: runPythonPreview', { sessionId, filePath, projectPath: providedProjectPath || null })

    try {
        if (!sessionId) {
            return { success: false, error: 'Session ID is required.' }
        }

        if (!filePath) {
            return { success: false, error: 'File path is required.' }
        }

        if (extname(filePath).toLowerCase() !== '.py') {
            return { success: false, error: 'Only Python (.py) files can be run from preview.' }
        }

        await access(filePath)
        const fileStats = await stat(filePath)
        if (!fileStats.isFile()) {
            return { success: false, error: 'Target path is not a file.' }
        }

        let cwd = dirname(filePath)
        if (providedProjectPath) {
            try {
                const normalizedProjectPath = resolve(providedProjectPath)
                const projectStats = await stat(normalizedProjectPath)
                if (projectStats.isDirectory()) {
                    cwd = normalizedProjectPath
                }
            } catch {
                // Fall back to file directory when project path is invalid.
            }
        }

        const interpreter = await resolvePythonInterpreter(cwd)
        if (!interpreter) {
            return { success: false, error: 'No Python interpreter found. Install Python or create a virtual environment.' }
        }

        const senderId = event.sender.id
        const runKey = getRunKey(senderId, sessionId)
        await stopExistingRunIfNeeded(runKey)

        const commandArgs = [...interpreter.baseArgs, filePath]
        const proc = spawn(interpreter.command, commandArgs, {
            cwd,
            windowsHide: true,
            env: getAugmentedEnv(),
            stdio: ['ignore', 'pipe', 'pipe']
        })

        const run: RunningPythonPreview = {
            sessionId,
            key: runKey,
            proc,
            webContents: event.sender,
            stopRequested: false
        }
        pythonPreviewRuns.set(runKey, run)

        emitPreviewEvent(run, {
            sessionId,
            type: 'started',
            pid: typeof proc.pid === 'number' ? proc.pid : null,
            interpreter: interpreter.label,
            command: [interpreter.command, ...commandArgs].join(' ')
        })

        proc.stdout?.on('data', (chunk: Buffer | string) => {
            emitPreviewEvent(run, {
                sessionId,
                type: 'stdout',
                text: String(chunk ?? '')
            })
        })

        proc.stderr?.on('data', (chunk: Buffer | string) => {
            emitPreviewEvent(run, {
                sessionId,
                type: 'stderr',
                text: String(chunk ?? '')
            })
        })

        proc.on('error', (error) => {
            emitPreviewEvent(run, {
                sessionId,
                type: 'error',
                text: error?.message || 'Failed to start Python process.'
            })
        })

        proc.on('close', (code, signal) => {
            const activeRun = pythonPreviewRuns.get(runKey)
            if (activeRun && activeRun.proc === proc) {
                pythonPreviewRuns.delete(runKey)
            }

            emitPreviewEvent(run, {
                sessionId,
                type: 'exit',
                code: typeof code === 'number' ? code : null,
                signal: signal || null,
                stopped: run.stopRequested
            })
        })

        return {
            success: true,
            pid: typeof proc.pid === 'number' ? proc.pid : null,
            interpreter: interpreter.label,
            command: [interpreter.command, ...commandArgs].join(' ')
        }
    } catch (err: any) {
        log.error('Failed to run Python preview:', err)
        return { success: false, error: err?.message || 'Failed to run Python preview.' }
    }
}

export async function handleStopPythonPreview(
    event: Electron.IpcMainInvokeEvent,
    sessionIdInput: string
) {
    const sessionId = normalizeSessionId(sessionIdInput)
    log.info('IPC: stopPythonPreview', { sessionId })

    try {
        if (!sessionId) {
            return { success: false, error: 'Session ID is required.' }
        }

        const runKey = getRunKey(event.sender.id, sessionId)
        const run = pythonPreviewRuns.get(runKey)
        if (!run) {
            return { success: true, stopped: false }
        }

        const stopped = stopRun(run)
        return { success: true, stopped }
    } catch (err: any) {
        log.error('Failed to stop Python preview:', err)
        return { success: false, error: err?.message || 'Failed to stop Python preview.' }
    }
}
