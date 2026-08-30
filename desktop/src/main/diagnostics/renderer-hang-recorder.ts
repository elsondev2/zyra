import {
    app,
    BrowserWindow,
    webContents as electronWebContents,
    type WebContents
} from 'electron'
import { ipcMain } from '../ipc/trusted-ipc'
import log from 'electron-log'
import { appendFileSync, mkdirSync, renameSync, rmSync, statSync } from 'node:fs'
import { readdir, unlink, writeFile } from 'node:fs/promises'
import { basename, join } from 'node:path'
import {
    RENDERER_DIAGNOSTIC_SIGNAL_CHANNEL,
    type RendererDiagnosticSignal
} from '../../shared/renderer-diagnostics'

const RECENT_EVENT_LIMIT = 80
const ACTIVE_IPC_LIMIT = 64
const REPORT_FILE_MAX_BYTES = 5 * 1024 * 1024
const WATCHDOG_INTERVAL_MS = 2_000
const VISIBLE_HEARTBEAT_STALL_MS = 8_000
const MAIN_EVENT_LOOP_SAMPLE_MS = 1_000
const SEVERE_STALL_MS = 2_000
const INCIDENT_THROTTLE_MS = 15_000
const SYSTEM_SUSPEND_LIMIT_MS = 30_000
// Electron reports process CPU as a share of the whole machine; roughly one busy
// core is ~5% on the primary Windows development system.
const HIGH_CPU_THRESHOLD_PERCENT = 4.5
const HIGH_CPU_CONSECUTIVE_SAMPLES = 3
const CPU_PROFILE_DURATION_MS = 5_000
const CPU_PROFILE_COOLDOWN_MS = 120_000
const CPU_PROFILE_MAX_BYTES = 20 * 1024 * 1024
const CPU_PROFILE_RETAIN_COUNT = 3

export type AssistantHangDiagnosticContext = {
    selectedSessionId: string | null
    activeThreadId: string | null
    threadState: string | null
    latestTurnState: string | null
    messageCount: number
    activityCount: number
    clientSurfaces: string[]
}

type RendererRecentEvent = {
    at: number
    kind: string
    data: Record<string, unknown>
}

type ActiveIpc = {
    requestId: string
    channel: string
    startedAt: number
    context: Record<string, unknown> | null
}

type RendererHealthState = {
    webContentsId: number
    createdAt: number
    lastHeartbeatReceivedAt: number
    lastHeartbeat: Extract<RendererDiagnosticSignal, { kind: 'heartbeat' }> | null
    recentEvents: RendererRecentEvent[]
    activeIpc: Map<string, ActiveIpc>
    watchdogCaptured: boolean
    unresponsiveStartedAt: number | null
    lastSevereCaptureAt: number
    highCpuSamples: number
    cpuProfileInFlight: boolean
    lastCpuProfileAt: number
}

type RecorderOptions = {
    userDataPath: string
    getAssistantContext?: () => AssistantHangDiagnosticContext | null
    onIncident?: (incident: { reason: string; processKind: 'main' | 'renderer' | 'other'; webContentsId: number | null; durationMs?: number }) => void
}

function cpuProfileCapturedAt(fileName: string): number {
    const match = fileName.match(/-(\d+)\.cpuprofile$/)
    return match ? Number(match[1]) : 0
}

function finiteNumber(value: unknown, fallback = 0): number {
    return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function safeString(value: unknown, maxLength = 256): string | null {
    if (typeof value !== 'string') return null
    return value.slice(0, maxLength)
}

function sanitizeIpcContext(value: unknown): Record<string, unknown> | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null
    const input = value as Record<string, unknown>
    const context: Record<string, unknown> = {}
    for (const key of ['threadId', 'sessionId', 'turnId', 'tabId'] as const) {
        const identifier = safeString(input[key], 160)
        if (identifier) context[key] = identifier
    }
    const operation = safeString(input.operation, 32)
    if (operation && ['ensure', 'navigate', 'back', 'forward', 'reload', 'stop', 'focus', 'blur', 'control-overlay'].includes(operation)) {
        context.operation = operation
    }
    if (input.direction === 'older' || input.direction === 'newer' || input.direction === 'latest') {
        context.direction = input.direction
    }
    if (typeof input.turnLimit === 'number' && Number.isFinite(input.turnLimit)) {
        context.turnLimit = Math.max(1, Math.min(3, Math.floor(input.turnLimit)))
    }
    return Object.keys(context).length > 0 ? context : null
}

function routeFamily(value: string): string {
    const firstSegment = value.split(/[?&#/]/).find(Boolean)
    return firstSegment ? `/${firstSegment.slice(0, 64)}` : '/'
}

function sanitizeUrl(rawUrl: string): string {
    try {
        const url = new URL(rawUrl)
        const hashPath = url.hash.startsWith('#/') ? `#${routeFamily(url.hash.slice(1))}` : ''
        return `${url.protocol}//${url.host}${routeFamily(url.pathname)}${hashPath}`.slice(0, 256)
    } catch {
        return routeFamily(rawUrl)
    }
}

function appendRecent(state: RendererHealthState, event: RendererRecentEvent): void {
    state.recentEvents.push(event)
    if (state.recentEvents.length > RECENT_EVENT_LIMIT) {
        state.recentEvents.splice(0, state.recentEvents.length - RECENT_EVENT_LIMIT)
    }
}

function describeWebContents(contents: WebContents | null) {
    if (!contents || contents.isDestroyed()) return null
    const processId = contents.getOSProcessId()
    const metric = app.getAppMetrics().find((entry) => entry.pid === processId)
    const owner = BrowserWindow.fromWebContents(contents)
    return {
        webContentsId: contents.id,
        type: contents.getType(),
        processId,
        route: sanitizeUrl(contents.getURL()),
        titleLength: contents.getTitle().length,
        windowId: owner?.id || null,
        visible: owner?.isVisible() ?? null,
        minimized: owner?.isMinimized() ?? null,
        focused: owner?.isFocused() ?? null,
        memory: metric?.memory || null,
        cpu: metric?.cpu || null
    }
}

function processSnapshot() {
    return app.getAppMetrics().map((metric) => ({
        type: metric.type,
        pid: metric.pid,
        cpu: metric.cpu,
        memory: metric.memory,
        creationTime: metric.creationTime,
        serviceName: metric.serviceName || null,
        name: metric.name || null
    }))
}

function windowSnapshot() {
    return BrowserWindow.getAllWindows().filter((window) => !window.isDestroyed()).map((window) => ({
        id: window.id,
        webContentsId: window.webContents.id,
        processId: window.webContents.getOSProcessId(),
        visible: window.isVisible(),
        minimized: window.isMinimized(),
        focused: window.isFocused(),
        fullScreen: window.isFullScreen(),
        bounds: window.getBounds(),
        route: sanitizeUrl(window.webContents.getURL())
    }))
}

function normalizeSignal(value: unknown): RendererDiagnosticSignal | null {
    if (!value || typeof value !== 'object') return null
    const signal = value as Partial<RendererDiagnosticSignal> & Record<string, unknown>
    if (typeof signal.kind !== 'string' || typeof signal.sentAt !== 'number' || !Number.isFinite(signal.sentAt)) return null
    return value as RendererDiagnosticSignal
}

export function createRendererHangRecorder(options: RecorderOptions) {
    const diagnosticsDirectory = join(options.userDataPath, 'diagnostics')
    const reportPath = join(diagnosticsDirectory, 'hang-incidents.jsonl')
    const previousReportPath = join(diagnosticsDirectory, 'hang-incidents.previous.jsonl')
    const states = new Map<number, RendererHealthState>()
    let incidentSequence = 0
    let disposed = false
    let lastMainLoopSampleAt = Date.now()
    let lastMainStallCaptureAt = 0
    const mainLoopCaptureArmedAt = Date.now() + 15_000

    const stateFor = (webContentsId: number): RendererHealthState => {
        const existing = states.get(webContentsId)
        if (existing) return existing
        const created: RendererHealthState = {
            webContentsId,
            createdAt: Date.now(),
            lastHeartbeatReceivedAt: 0,
            lastHeartbeat: null,
            recentEvents: [],
            activeIpc: new Map(),
            watchdogCaptured: false,
            unresponsiveStartedAt: null,
            lastSevereCaptureAt: 0,
            highCpuSamples: 0,
            cpuProfileInFlight: false,
            lastCpuProfileAt: 0
        }
        states.set(webContentsId, created)
        return created
    }

    const rotateIfNeeded = () => {
        try {
            if (statSync(reportPath).size < REPORT_FILE_MAX_BYTES) return
            rmSync(previousReportPath, { force: true })
            renameSync(reportPath, previousReportPath)
        } catch {
            // A missing report is the normal first-run state.
        }
    }

    const persistIncident = (
        reason: string,
        contents: WebContents | null,
        trigger: Record<string, unknown> = {}
    ) => {
        const now = Date.now()
        const state = contents ? states.get(contents.id) || null : null
        let assistant: AssistantHangDiagnosticContext | null = null
        try {
            assistant = options.getAssistantContext?.() || null
        } catch {
            assistant = null
        }
        const report = {
            schemaVersion: 1,
            incidentId: `${now}-${++incidentSequence}`,
            capturedAt: new Date(now).toISOString(),
            reason,
            trigger,
            app: {
                version: app.getVersion(),
                platform: process.platform,
                architecture: process.arch,
                uptimeSeconds: process.uptime()
            },
            target: describeWebContents(contents),
            rendererHealth: state ? {
                heartbeatAgeMs: state.lastHeartbeatReceivedAt > 0 ? now - state.lastHeartbeatReceivedAt : null,
                lastHeartbeat: state.lastHeartbeat,
                activeIpc: [...state.activeIpc.values()].map((request) => ({
                    ...request,
                    ageMs: now - request.startedAt
                })),
                recentEvents: state.recentEvents,
                unresponsiveForMs: state.unresponsiveStartedAt ? now - state.unresponsiveStartedAt : null
            } : null,
            rendererHealthByWindow: [...states.values()].map((rendererState) => ({
                webContentsId: rendererState.webContentsId,
                heartbeatAgeMs: rendererState.lastHeartbeatReceivedAt > 0 ? now - rendererState.lastHeartbeatReceivedAt : null,
                surface: rendererState.lastHeartbeat?.surface || null,
                visibility: rendererState.lastHeartbeat?.visibility || null,
                activeIpc: [...rendererState.activeIpc.values()].map((request) => ({
                    ...request,
                    ageMs: now - request.startedAt
                })),
                recentEvents: rendererState.recentEvents.slice(-20)
            })),
            assistant,
            windows: windowSnapshot(),
            processes: processSnapshot(),
            mainProcessMemory: process.memoryUsage()
        }
        try {
            mkdirSync(diagnosticsDirectory, { recursive: true, mode: 0o700 })
            rotateIfNeeded()
            appendFileSync(reportPath, `${JSON.stringify(report)}\n`, { encoding: 'utf8', mode: 0o600 })
            log.info('[HangDiagnostics] incident captured', { reason, incidentId: report.incidentId, reportPath })
        } catch (error) {
            log.error('[HangDiagnostics] failed to persist incident', error)
        }
        try {
            const durationMs = finiteNumber(trigger.durationMs, -1)
            options.onIncident?.({
                reason,
                processKind: reason.startsWith('main-') ? 'main' : contents ? 'renderer' : 'other',
                webContentsId: contents?.id ?? null,
                ...(durationMs >= 0 ? { durationMs } : {})
            })
        } catch {}
        return report
    }

    const captureRendererCpuProfile = async (
        state: RendererHealthState,
        contents: WebContents,
        cpuPercent: number
    ) => {
        if (
            state.cpuProfileInFlight
            || contents.isDestroyed()
            || contents.debugger.isAttached()
            || Date.now() - state.lastCpuProfileAt < CPU_PROFILE_COOLDOWN_MS
        ) return
        state.cpuProfileInFlight = true
        state.lastCpuProfileAt = Date.now()
        let attached = false
        try {
            contents.debugger.attach('1.3')
            attached = true
            await contents.debugger.sendCommand('Profiler.enable')
            await contents.debugger.sendCommand('Profiler.start')
            await new Promise<void>((resolve) => {
                const timer = setTimeout(resolve, CPU_PROFILE_DURATION_MS)
                timer.unref()
            })
            if (contents.isDestroyed()) return
            const result = await contents.debugger.sendCommand('Profiler.stop') as { profile?: unknown }
            const serialized = JSON.stringify(result.profile || null)
            if (Buffer.byteLength(serialized, 'utf8') > CPU_PROFILE_MAX_BYTES) {
                persistIncident('sustained-renderer-high-cpu', contents, {
                    cpuPercent,
                    profile: 'discarded-over-size-limit'
                })
                return
            }
            mkdirSync(diagnosticsDirectory, { recursive: true, mode: 0o700 })
            const profilePath = join(diagnosticsDirectory, `renderer-${contents.id}-${Date.now()}.cpuprofile`)
            await writeFile(profilePath, serialized, { encoding: 'utf8', mode: 0o600 })
            const profiles = (await readdir(diagnosticsDirectory))
                .filter((entry) => entry.endsWith('.cpuprofile'))
                .sort((left, right) => cpuProfileCapturedAt(right) - cpuProfileCapturedAt(left))
            await Promise.all(profiles.slice(CPU_PROFILE_RETAIN_COUNT).map((entry) => (
                unlink(join(diagnosticsDirectory, entry)).catch(() => undefined)
            )))
            persistIncident('sustained-renderer-high-cpu', contents, {
                cpuPercent,
                cpuProfile: basename(profilePath)
            })
        } catch (error) {
            appendRecent(state, {
                at: Date.now(),
                kind: 'cpu-profile-failed',
                data: { errorType: error instanceof Error ? error.name : 'UnknownError' }
            })
        } finally {
            if (attached && !contents.isDestroyed() && contents.debugger.isAttached()) {
                try { contents.debugger.detach() } catch {}
            }
            state.cpuProfileInFlight = false
            state.highCpuSamples = 0
        }
    }

    const captureSevereRendererSignal = (
        state: RendererHealthState,
        contents: WebContents | null,
        reason: string,
        trigger: Record<string, unknown>
    ) => {
        const now = Date.now()
        if (now - state.lastSevereCaptureAt < INCIDENT_THROTTLE_MS) return
        state.lastSevereCaptureAt = now
        persistIncident(reason, contents, trigger)
    }

    const handleSignal = (event: Electron.IpcMainEvent, rawSignal: unknown) => {
        const signal = normalizeSignal(rawSignal)
        if (!signal || event.sender.isDestroyed()) return
        const state = stateFor(event.sender.id)
        const receivedAt = Date.now()

        if (signal.kind === 'heartbeat') {
            state.lastHeartbeatReceivedAt = receivedAt
            state.lastHeartbeat = signal
            state.watchdogCaptured = false
            return
        }
        if (signal.kind === 'ipc-start') {
            const requestId = safeString(signal.requestId, 120)
            if (!requestId) return
            state.activeIpc.set(requestId, {
                requestId,
                channel: safeString(signal.channel, 180) || 'unknown',
                startedAt: receivedAt,
                context: sanitizeIpcContext(signal.context)
            })
            while (state.activeIpc.size > ACTIVE_IPC_LIMIT) {
                const oldest = state.activeIpc.keys().next().value
                if (typeof oldest !== 'string') break
                state.activeIpc.delete(oldest)
            }
            return
        }
        if (signal.kind === 'ipc-end') {
            const requestId = safeString(signal.requestId, 120)
            if (!requestId) return
            const active = state.activeIpc.get(requestId)
            state.activeIpc.delete(requestId)
            const durationMs = Math.max(0, finiteNumber(signal.durationMs))
            if (durationMs >= 250) {
                appendRecent(state, {
                    at: receivedAt,
                    kind: 'ipc',
                    data: {
                        channel: safeString(signal.channel, 180),
                        durationMs,
                        outcome: signal.outcome,
                        context: active?.context || null
                    }
                })
            }
            return
        }
        if (signal.kind === 'long-task') {
            const durationMs = Math.max(0, finiteNumber(signal.durationMs))
            appendRecent(state, {
                at: receivedAt,
                kind: 'long-task',
                data: { durationMs, route: signal.route }
            })
            if (durationMs >= SEVERE_STALL_MS) {
                captureSevereRendererSignal(state, event.sender, 'renderer-long-task-recovered', { durationMs, route: signal.route })
            }
            return
        }
        if (signal.kind === 'event-loop-stall') {
            const durationMs = Math.max(0, finiteNumber(signal.durationMs))
            appendRecent(state, {
                at: receivedAt,
                kind: 'event-loop-stall',
                data: { durationMs, route: signal.route }
            })
            if (durationMs >= SEVERE_STALL_MS) {
                captureSevereRendererSignal(state, event.sender, 'renderer-event-loop-stall-recovered', { durationMs, route: signal.route })
            }
            return
        }
        if (signal.kind === 'interaction') {
            appendRecent(state, {
                at: receivedAt,
                kind: 'interaction',
                data: { interaction: signal.interaction, route: signal.route }
            })
            return
        }
        if (signal.state === 'ready') {
            state.activeIpc.clear()
            state.recentEvents = []
            state.highCpuSamples = 0
            state.watchdogCaptured = false
        } else if (signal.state === 'pagehide') {
            state.activeIpc.clear()
            state.highCpuSamples = 0
        }
        appendRecent(state, {
            at: receivedAt,
            kind: 'lifecycle',
            data: { state: signal.state, route: signal.route }
        })
    }

    ipcMain.on(RENDERER_DIAGNOSTIC_SIGNAL_CHANNEL, handleSignal)

    const watchdogTimer = setInterval(() => {
        const now = Date.now()
        const metricsByPid = new Map(app.getAppMetrics().map((metric) => [metric.pid, metric]))
        for (const state of states.values()) {
            if (state.lastHeartbeatReceivedAt <= 0) continue
            const contents = electronWebContents.fromId(state.webContentsId)
            if (!contents || contents.isDestroyed()) continue
            const owner = BrowserWindow.fromWebContents(contents)
            const visible = state.lastHeartbeat?.visibility === 'visible'
                && Boolean(owner?.isVisible())
                && !owner?.isMinimized()
            const cpuPercent = metricsByPid.get(contents.getOSProcessId())?.cpu.percentCPUUsage || 0
            state.highCpuSamples = visible
                && now - state.createdAt >= 20_000
                && cpuPercent >= HIGH_CPU_THRESHOLD_PERCENT
                ? state.highCpuSamples + 1
                : 0
            if (state.highCpuSamples >= HIGH_CPU_CONSECUTIVE_SAMPLES) {
                void captureRendererCpuProfile(state, contents, cpuPercent)
            }
            if (state.watchdogCaptured || now - state.lastHeartbeatReceivedAt < VISIBLE_HEARTBEAT_STALL_MS) continue
            if (!visible) continue
            state.watchdogCaptured = true
            persistIncident('visible-renderer-heartbeat-stalled', contents, {
                heartbeatAgeMs: now - state.lastHeartbeatReceivedAt,
                cpuPercent
            })
        }
    }, WATCHDOG_INTERVAL_MS)
    watchdogTimer.unref()

    const mainLoopTimer = setInterval(() => {
        const now = Date.now()
        const durationMs = now - lastMainLoopSampleAt - MAIN_EVENT_LOOP_SAMPLE_MS
        lastMainLoopSampleAt = now
        if (
            now >= mainLoopCaptureArmedAt
            && durationMs >= SEVERE_STALL_MS
            && durationMs < SYSTEM_SUSPEND_LIMIT_MS
            && now - lastMainStallCaptureAt >= INCIDENT_THROTTLE_MS
        ) {
            lastMainStallCaptureAt = now
            const focusedWindow = BrowserWindow.getFocusedWindow()
            persistIncident('main-event-loop-stall-recovered', focusedWindow?.webContents || null, { durationMs })
        }
    }, MAIN_EVENT_LOOP_SAMPLE_MS)
    mainLoopTimer.unref()

    return {
        reportPath,
        attach(contents: WebContents) {
            const state = stateFor(contents.id)
            contents.once('destroyed', () => states.delete(contents.id))
            contents.on('unresponsive', () => {
                state.unresponsiveStartedAt = Date.now()
                const report = persistIncident('renderer-unresponsive', contents)
                log.error('[Process] Renderer unresponsive', report.target)
            })
            contents.on('responsive', () => {
                const recoveredAt = Date.now()
                const durationMs = state.unresponsiveStartedAt ? recoveredAt - state.unresponsiveStartedAt : null
                persistIncident('renderer-responsive', contents, { durationMs })
                state.unresponsiveStartedAt = null
                log.info('[Process] Renderer responsive', describeWebContents(contents))
            })
        },
        captureRendererGone(contents: WebContents, details: { reason: string; exitCode: number }) {
            persistIncident('renderer-process-gone', contents, details)
        },
        captureChildProcessGone(details: Record<string, unknown>) {
            persistIncident('electron-child-process-gone', null, details)
        },
        dispose() {
            if (disposed) return
            disposed = true
            ipcMain.removeListener(RENDERER_DIAGNOSTIC_SIGNAL_CHANNEL, handleSignal)
            clearInterval(watchdogTimer)
            clearInterval(mainLoopTimer)
            states.clear()
        }
    }
}
