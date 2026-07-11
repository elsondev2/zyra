import * as pty from 'node-pty'
import { dirname, resolve } from 'path'
import { stat } from 'fs/promises'
import log from 'electron-log'
import type { DevScopePreviewTerminalSessionSummary } from '../../../shared/contracts/devscope-api'
import { getAugmentedEnv } from '../../inspectors/safe-exec'

export const PREVIEW_TERMINAL_EVENT_CHANNEL = 'devscope:previewTerminal:event'

type PreviewTerminalEventPayload = {
    sessionId: string
    type: 'started' | 'output' | 'exit' | 'error' | 'title'
    data?: string
    message?: string
    shell?: string
    cwd?: string
    title?: string
    groupKey?: string
    status?: 'running' | 'exited' | 'error'
    exitCode?: number
}

type PreviewTerminalSession = {
    sessionId: string
    key: string
    senderId: number
    proc: pty.IPty | null
    webContents: Electron.WebContents
    shell: string
    cwd: string
    groupKey: string
    status: 'running' | 'exited' | 'error'
    title: string
    startedAt: number
    lastActivityAt: number
    exitCode: number | null
    outputBuffer: string
    lastKnownProcessLabel: string | null
    oscTitleCarryover: string
}

const previewTerminalSessions = new Map<string, PreviewTerminalSession>()
const MAX_OUTPUT_BUFFER_CHARS = 60_000

function normalizeSessionId(raw: unknown): string {
    const value = String(raw || '').trim()
    return value.length > 0 ? value : ''
}

function getSessionKey(senderId: number, sessionId: string): string {
    return `${senderId}:${sessionId}`
}

function normalizeGroupKey(cwd: string): string {
    const normalized = resolve(cwd).replace(/\\/g, '/')
    return process.platform === 'win32' ? normalized.toLowerCase() : normalized
}

function shellLabelFromPreference(shell: 'powershell' | 'cmd'): string {
    return shell === 'cmd' ? 'CMD' : 'PowerShell'
}

function buildSessionTitle(
    preferredShell: 'powershell' | 'cmd',
    groupKey: string,
    senderId: number,
    requestedTitle?: string
): string {
    const normalizedRequested = String(requestedTitle || '').trim()
    if (normalizedRequested) return normalizedRequested

    const ordinal = Array.from(previewTerminalSessions.values()).filter((session) => (
        session.senderId === senderId && session.groupKey === groupKey
    )).length + 1

    return `${shellLabelFromPreference(preferredShell)} ${ordinal}`
}

function normalizeProcessLabel(value: string | null | undefined): string | null {
    const normalized = String(value || '')
        .replace(/\.exe$/i, '')
        .replace(/\s+/g, ' ')
        .trim()
    if (!normalized) return null
    if (/^(cmd|powershell|pwsh)$/i.test(normalized)) return null
    return normalized
}

function isGenericShellTitle(title: string): boolean {
    const normalized = String(title || '').trim()
    return /^(powershell|cmd)( \d+)?$/i.test(normalized)
}

function appendOutputBuffer(session: PreviewTerminalSession, chunk: string): void {
    session.outputBuffer = `${session.outputBuffer}${chunk}`.slice(-MAX_OUTPUT_BUFFER_CHARS)
}

function readOscTerminator(source: string, searchStart: number): { end: number; width: number } | null {
    const bellIndex = source.indexOf('\x07', searchStart)
    const stIndex = source.indexOf('\x1b\\', searchStart)

    if (bellIndex === -1 && stIndex === -1) return null
    if (bellIndex === -1) return { end: stIndex, width: 2 }
    if (stIndex === -1) return { end: bellIndex, width: 1 }
    return bellIndex < stIndex
        ? { end: bellIndex, width: 1 }
        : { end: stIndex, width: 2 }
}

function extractOscTitles(
    chunk: string,
    carryover: string
): { titles: string[]; nextCarryover: string } {
    const source = `${carryover}${chunk}`
    const titles: string[] = []
    let cursor = 0
    let nextCarryover = ''

    while (cursor < source.length) {
        const start = source.indexOf('\x1b]', cursor)
        if (start === -1) break

        const terminator = readOscTerminator(source, start + 2)
        if (!terminator) {
            nextCarryover = source.slice(start).slice(-1024)
            break
        }

        const payload = source.slice(start + 2, terminator.end)
        const separatorIndex = payload.indexOf(';')
        if (separatorIndex > 0) {
            const code = payload.slice(0, separatorIndex).trim()
            if (code === '0' || code === '2') {
                const title = payload.slice(separatorIndex + 1).trim()
                if (title) titles.push(title)
            }
        }

        cursor = terminator.end + terminator.width
    }

    if (!nextCarryover) {
        if (source.endsWith('\x1b]')) {
            nextCarryover = '\x1b]'
        } else if (source.endsWith('\x1b')) {
            nextCarryover = '\x1b'
        }
    }

    return { titles, nextCarryover }
}

function summarizeCommandSubmission(raw: string): string | null {
    if (!/[\r\n]/.test(raw)) return null

    const candidate = raw
        .replace(/\r/g, '\n')
        .split('\n')
        .map((part) => part.replace(/\x1b\[[0-9;]*[A-Za-z]/g, '').trim())
        .filter(Boolean)
        .at(-1)

    if (!candidate) return null
    if (candidate.length <= 1) return null

    return candidate.slice(0, 56)
}

function serializeSession(session: PreviewTerminalSession): DevScopePreviewTerminalSessionSummary {
    return {
        sessionId: session.sessionId,
        title: session.title,
        shell: session.shell,
        cwd: session.cwd,
        groupKey: session.groupKey,
        status: session.status,
        startedAt: session.startedAt,
        lastActivityAt: session.lastActivityAt,
        exitCode: session.exitCode,
        recentOutput: session.outputBuffer
    }
}

function listSessionsForSender(senderId: number, groupKey?: string): PreviewTerminalSession[] {
    return Array.from(previewTerminalSessions.values())
        .filter((session) => session.senderId === senderId && (!groupKey || session.groupKey === groupKey))
        .sort((a, b) => {
            if (a.status === 'running' && b.status !== 'running') return -1
            if (a.status !== 'running' && b.status === 'running') return 1
            return b.lastActivityAt - a.lastActivityAt
        })
}

function emitTerminalEvent(session: PreviewTerminalSession, payload: PreviewTerminalEventPayload): void {
    if (session.webContents.isDestroyed()) return
    session.webContents.send(PREVIEW_TERMINAL_EVENT_CHANNEL, payload)
}

function emitSessionTitle(session: PreviewTerminalSession): void {
    emitTerminalEvent(session, {
        sessionId: session.sessionId,
        type: 'title',
        title: session.title,
        cwd: session.cwd,
        shell: session.shell,
        groupKey: session.groupKey,
        status: session.status
    })
}

function updateSessionTitle(session: PreviewTerminalSession, nextTitle: string): boolean {
    const normalized = String(nextTitle || '').trim()
    if (!normalized || normalized === session.title) return false
    session.title = normalized
    session.lastActivityAt = Date.now()
    emitSessionTitle(session)
    return true
}

function syncSessionProcessLabel(session: PreviewTerminalSession): void {
    const nextProcessLabel = normalizeProcessLabel(session.proc?.process)
    if (!nextProcessLabel) return
    if (nextProcessLabel === session.lastKnownProcessLabel) return

    const shouldApply = !session.lastKnownProcessLabel
        ? isGenericShellTitle(session.title)
        : session.title === session.lastKnownProcessLabel || isGenericShellTitle(session.title)

    session.lastKnownProcessLabel = nextProcessLabel
    if (shouldApply) {
        updateSessionTitle(session, nextProcessLabel)
    }
}

async function resolveTerminalCwd(targetPathInput?: string): Promise<string> {
    const targetPath = String(targetPathInput || '').trim()
    if (!targetPath) return process.cwd()

    const resolved = resolve(targetPath)
    try {
        const targetStats = await stat(resolved)
        if (targetStats.isDirectory()) return resolved
        return dirname(resolved)
    } catch {
        return process.cwd()
    }
}

function destroyTerminalProcess(session: PreviewTerminalSession): boolean {
    if (!session.proc) return false
    try {
        session.proc.kill()
        session.proc = null
        return true
    } catch {
        return false
    }
}

function removeSession(sessionKey: string): void {
    const existing = previewTerminalSessions.get(sessionKey)
    if (!existing) return
    destroyTerminalProcess(existing)
    previewTerminalSessions.delete(sessionKey)
}

export async function handleListPreviewTerminalSessions(
    event: Electron.IpcMainInvokeEvent,
    input?: { targetPath?: string }
) {
    try {
        const cwd = input?.targetPath ? await resolveTerminalCwd(input.targetPath) : undefined
        const groupKey = cwd ? normalizeGroupKey(cwd) : undefined
        const sessions = listSessionsForSender(event.sender.id, groupKey).map(serializeSession)
        return {
            success: true,
            cwd,
            groupKey,
            sessions
        }
    } catch (err: any) {
        log.error('Failed to list preview terminals:', err)
        return { success: false, error: err?.message || 'Failed to list preview terminals.' }
    }
}

export async function handleCreatePreviewTerminal(
    event: Electron.IpcMainInvokeEvent,
    input: {
        sessionId: string
        targetPath?: string
        preferredShell?: 'powershell' | 'cmd'
        cols?: number
        rows?: number
        title?: string
    }
) {
    const sessionId = normalizeSessionId(input?.sessionId)
    const preferredShell = input?.preferredShell === 'cmd' ? 'cmd' : 'powershell'
    log.info('IPC: createPreviewTerminal', { sessionId, preferredShell, targetPath: input?.targetPath || null })

    try {
        if (!sessionId) {
            return { success: false, error: 'Session ID is required.' }
        }

        const senderId = event.sender.id
        const sessionKey = getSessionKey(senderId, sessionId)
        removeSession(sessionKey)

        const cwd = await resolveTerminalCwd(input?.targetPath)
        const groupKey = normalizeGroupKey(cwd)
        let shell = process.platform === 'win32'
            ? (preferredShell === 'cmd' ? 'cmd.exe' : 'powershell.exe')
            : (process.env.SHELL || 'bash')
        let args: string[] = []

        if (process.platform === 'win32') {
            shell = preferredShell === 'cmd' ? 'cmd.exe' : 'powershell.exe'
            args = preferredShell === 'cmd'
                ? ['/k']
                : ['-NoLogo', '-NoExit']
        }
        const cols = Math.max(40, Math.floor(Number(input?.cols) || 100))
        const rows = Math.max(10, Math.floor(Number(input?.rows) || 28))

        const terminalOptions: pty.IPtyForkOptions & {
            useConpty?: boolean
            conptyInheritCursor?: boolean
        } = {
            name: 'xterm-256color',
            cwd,
            cols,
            rows,
            env: {
                ...getAugmentedEnv(),
                TERM: 'xterm-256color',
                COLORTERM: 'truecolor',
                FORCE_COLOR: '1'
            } as any
        }
        if (process.platform === 'win32') {
            terminalOptions.useConpty = true
            terminalOptions.conptyInheritCursor = true
        }

        const startedAt = Date.now()
        const session: PreviewTerminalSession = {
            sessionId,
            key: sessionKey,
            senderId,
            proc: null,
            webContents: event.sender,
            shell,
            cwd,
            groupKey,
            status: 'running',
            title: buildSessionTitle(preferredShell, groupKey, senderId, input?.title),
            startedAt,
            lastActivityAt: startedAt,
            exitCode: null,
            outputBuffer: '',
            lastKnownProcessLabel: null,
            oscTitleCarryover: ''
        }

        const terminalProc = pty.spawn(shell, args, terminalOptions)
        session.proc = terminalProc
        previewTerminalSessions.set(sessionKey, session)

        terminalProc.onData((data: string) => {
            const chunk = String(data || '')
            session.lastActivityAt = Date.now()
            syncSessionProcessLabel(session)
            const { titles, nextCarryover } = extractOscTitles(chunk, session.oscTitleCarryover)
            session.oscTitleCarryover = nextCarryover
            const nextTitle = titles.at(-1)
            if (nextTitle) {
                updateSessionTitle(session, nextTitle)
            }
            appendOutputBuffer(session, chunk)
            emitTerminalEvent(session, {
                sessionId,
                type: 'output',
                data: chunk,
                title: session.title,
                cwd: session.cwd,
                shell: session.shell,
                groupKey: session.groupKey,
                status: session.status
            })
        })

        emitTerminalEvent(session, {
            sessionId,
            type: 'started',
            shell,
            cwd,
            title: session.title,
            groupKey,
            status: session.status
        })

        terminalProc.onExit((result) => {
            session.proc = null
            session.status = result?.exitCode === 0 ? 'exited' : 'error'
            session.exitCode = Number(result?.exitCode ?? 0)
            session.lastActivityAt = Date.now()
            emitTerminalEvent(session, {
                sessionId,
                type: 'exit',
                exitCode: session.exitCode ?? 0,
                title: session.title,
                cwd: session.cwd,
                shell: session.shell,
                groupKey: session.groupKey,
                status: session.status
            })
        })

        return {
            success: true,
            shell,
            cwd,
            groupKey,
            session: serializeSession(session)
        }
    } catch (err: any) {
        log.error('Failed to create preview terminal:', err)
        return { success: false, error: err?.message || 'Failed to create preview terminal.' }
    }
}

export async function handleWritePreviewTerminal(
    event: Electron.IpcMainInvokeEvent,
    input: {
        sessionId: string
        data: string
    }
) {
    const sessionId = normalizeSessionId(input?.sessionId)
    try {
        if (!sessionId) {
            return { success: false, error: 'Session ID is required.' }
        }
        const sessionKey = getSessionKey(event.sender.id, sessionId)
        const session = previewTerminalSessions.get(sessionKey)
        if (!session || !session.proc) {
            return { success: false, error: 'Preview terminal session not found.' }
        }

        const rawInput = String(input?.data || '')
        session.lastActivityAt = Date.now()
        const submittedCommand = summarizeCommandSubmission(rawInput)
        if (submittedCommand) {
            updateSessionTitle(session, submittedCommand)
        }
        session.proc.write(rawInput)
        return { success: true }
    } catch (err: any) {
        log.error('Failed to write preview terminal input:', err)
        return { success: false, error: err?.message || 'Failed to write terminal input.' }
    }
}

export async function handleSetPreviewTerminalTitle(
    event: Electron.IpcMainInvokeEvent,
    input: {
        sessionId: string
        title: string
    }
) {
    const sessionId = normalizeSessionId(input?.sessionId)
    try {
        if (!sessionId) {
            return { success: false, error: 'Session ID is required.' }
        }
        const sessionKey = getSessionKey(event.sender.id, sessionId)
        const session = previewTerminalSessions.get(sessionKey)
        if (!session) {
            return { success: false, error: 'Preview terminal session not found.' }
        }

        const normalizedTitle = String(input?.title || '').trim()
        if (!normalizedTitle) {
            return { success: false, error: 'Title is required.' }
        }

        updateSessionTitle(session, normalizedTitle)
        return { success: true, title: session.title }
    } catch (err: any) {
        log.error('Failed to update preview terminal title:', err)
        return { success: false, error: err?.message || 'Failed to update preview terminal title.' }
    }
}

export async function handleResizePreviewTerminal(
    event: Electron.IpcMainInvokeEvent,
    input: {
        sessionId: string
        cols: number
        rows: number
    }
) {
    const sessionId = normalizeSessionId(input?.sessionId)
    try {
        if (!sessionId) {
            return { success: false, error: 'Session ID is required.' }
        }
        const sessionKey = getSessionKey(event.sender.id, sessionId)
        const session = previewTerminalSessions.get(sessionKey)
        if (!session || !session.proc) {
            return { success: false, error: 'Preview terminal session not found.' }
        }
        const cols = Math.max(40, Math.floor(Number(input?.cols) || 100))
        const rows = Math.max(10, Math.floor(Number(input?.rows) || 28))
        session.proc.resize(cols, rows)
        return { success: true }
    } catch (err: any) {
        log.error('Failed to resize preview terminal:', err)
        return { success: false, error: err?.message || 'Failed to resize preview terminal.' }
    }
}

export async function handleClosePreviewTerminal(
    event: Electron.IpcMainInvokeEvent,
    sessionIdInput: string
) {
    const sessionId = normalizeSessionId(sessionIdInput)
    try {
        if (!sessionId) {
            return { success: false, error: 'Session ID is required.' }
        }
        const sessionKey = getSessionKey(event.sender.id, sessionId)
        const session = previewTerminalSessions.get(sessionKey)
        if (!session) {
            return { success: true, closed: false }
        }

        const closed = destroyTerminalProcess(session)
        previewTerminalSessions.delete(sessionKey)
        return { success: true, closed }
    } catch (err: any) {
        log.error('Failed to close preview terminal:', err)
        return { success: false, error: err?.message || 'Failed to close preview terminal.' }
    }
}
