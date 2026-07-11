import { access, readFile, readdir, stat } from 'fs/promises'
import { exec } from 'child_process'
import { join } from 'path'
import { promisify } from 'util'
import log from 'electron-log'
import si from 'systeminformation'
import {
    detectFrameworksFromPackageJson,
    detectProjectTypeFromMarkers,
    PROJECT_MARKERS,
    type FrameworkDefinition
} from '../project-detection'
import { resolveProjectIconPath } from '../../services/project-icon-resolver'
import {
    detectDependencyInstallManager,
    detectNodeDependencyInstallStatus,
    pathExists,
    runInstallProcess,
    type DependencyInstallStatus,
    type ProjectPackageJson
} from '../../services/project-dependencies'

const execAsync = promisify(exec)

function getPreferredReadmeFile(entries: string[]): string | null {
    const readmeCandidates = entries.filter((entry) => {
        const normalized = entry.toLowerCase()
        return normalized.startsWith('readme')
            && (normalized.endsWith('.md') || normalized.endsWith('.txt') || !normalized.includes('.'))
    })

    if (readmeCandidates.length === 0) return null

    const scoreReadmeCandidate = (entry: string): number => {
        const normalized = entry.toLowerCase()

        if (/^readme(?:[._-]en(?:[-_][a-z]{2})?)?\.md$/i.test(normalized)) return 1000
        if (/^readme(?:[._-]en(?:[-_][a-z]{2})?)?\.txt$/i.test(normalized)) return 950
        if (/^readme(?:[._-]en(?:[-_][a-z]{2})?)$/i.test(normalized)) return 900
        if (normalized === 'readme.md') return 850
        if (normalized === 'readme.txt') return 800
        if (normalized === 'readme') return 750
        if (/^readme[._-][a-z]{2}(?:[-_][a-z]{2})?\.md$/i.test(normalized)) return 500
        if (/^readme[._-][a-z]{2}(?:[-_][a-z]{2})?\.txt$/i.test(normalized)) return 450
        return 100
    }

    return [...readmeCandidates]
        .sort((left, right) => {
            const scoreDiff = scoreReadmeCandidate(right) - scoreReadmeCandidate(left)
            if (scoreDiff !== 0) return scoreDiff
            return left.localeCompare(right)
        })[0] || null
}

function parseTasklistMemoryMb(raw: string): number {
    const normalized = String(raw || '').replace(/[\s,]/g, '').toUpperCase()
    const match = normalized.match(/^([0-9]+(?:\.[0-9]+)?)(K|M|G)?$/)
    if (!match) return 0
    const value = Number(match[1]) || 0
    const unit = match[2] || 'K'
    if (unit === 'G') return value * 1024
    if (unit === 'M') return value
    return value / 1024
}

function parseTasklistLine(line: string): string[] {
    const trimmed = String(line || '').trim()
    if (!trimmed) return []
    if (!(trimmed.startsWith('"') && trimmed.endsWith('"'))) {
        return trimmed.split(',').map((part) => part.trim())
    }
    return trimmed.slice(1, -1).split('","')
}

function hasVisibleWindowTitle(rawTitle: string): boolean {
    const title = String(rawTitle || '').trim().toLowerCase()
    if (!title) return false
    if (title === 'n/a' || title === 'unknown') return false
    return true
}

const APP_NAME_HINTS = [
    'chrome.exe', 'msedge.exe', 'firefox.exe', 'brave.exe', 'opera.exe',
    'code.exe', 'code - insiders.exe', 'devenv.exe', 'explorer.exe', 'notepad.exe', 'notepad++.exe',
    'idea64.exe', 'pycharm64.exe', 'webstorm64.exe', 'rider64.exe', 'clion64.exe', 'studio64.exe',
    'slack.exe', 'discord.exe', 'teams.exe', 'spotify.exe', 'steam.exe', 'obs64.exe',
    'windowsterminal.exe', 'wt.exe', 'cmd.exe', 'powershell.exe', 'pwsh.exe', 'wezterm.exe'
]

const BACKGROUND_NAME_HINTS = [
    'svchost.exe', 'dllhost.exe', 'conhost.exe', 'taskhostw.exe', 'searchindexer.exe',
    'runtimebroker.exe', 'runtime broker', 'fontdrvhost.exe', 'sihost.exe', 'smss.exe',
    'csrss.exe', 'wininit.exe', 'lsass.exe', 'services.exe', 'spoolsv.exe',
    'wmi', 'defender', 'antimalware', 'telemetry', 'updater', 'service', 'host', 'broker'
]

async function getVisibleWindowPidSet(): Promise<{ pids: Set<number>; signalAvailable: boolean }> {
    const pids = new Set<number>()
    let signalAvailable = false

    try {
        const { stdout } = await execAsync(
            'powershell -NoProfile -Command "Get-Process | Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -ExpandProperty Id"',
            { timeout: 6000, maxBuffer: 2 * 1024 * 1024 }
        )
        const lines = String(stdout || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
        for (const line of lines) {
            const pid = Number.parseInt(line, 10)
            if (!Number.isFinite(pid) || pid <= 0) continue
            pids.add(pid)
        }
        if (pids.size > 0) {
            signalAvailable = true
            return { pids, signalAvailable }
        }
    } catch (err) {
        log.warn('powershell visible-window pid probe failed:', err)
    }

    try {
        const { stdout } = await execAsync('tasklist /V /FO CSV /NH', { timeout: 6000, maxBuffer: 4 * 1024 * 1024 })
        const lines = String(stdout || '').split(/\r?\n/).filter((line) => line.trim().length > 0)
        let parsedRows = 0
        for (const line of lines) {
            const parts = parseTasklistLine(line)
            if (parts.length < 9) continue
            parsedRows += 1
            const pid = Number.parseInt(String(parts[1] || '').trim(), 10)
            if (!Number.isFinite(pid) || pid <= 0) continue
            const windowTitle = String(parts[8] || '')
            if (!hasVisibleWindowTitle(windowTitle)) continue
            pids.add(pid)
        }
        signalAvailable = parsedRows > 0
    } catch (err) {
        log.warn('tasklist /V visible-window pid probe failed:', err)
    }

    return { pids, signalAvailable }
}

function inferProcessCategory(
    name: string,
    pid: number,
    visibleWindowPids: Set<number>,
    windowSignalAvailable: boolean
): 'app' | 'background' {
    const normalized = String(name || '').trim().toLowerCase()
    if (!normalized) return 'background'

    if (visibleWindowPids.has(pid)) return 'app'

    const explicitBackground = BACKGROUND_NAME_HINTS.some((hint) => normalized.includes(hint))
    if (explicitBackground) return 'background'

    const explicitApp = APP_NAME_HINTS.some((hint) => normalized === hint || normalized.endsWith(`\\${hint}`))
    if (explicitApp) return 'app'

    if (windowSignalAvailable) {
        return 'background'
    }

    if (normalized.endsWith('.exe') && !normalized.includes('service') && !normalized.includes('host')) {
        return 'app'
    }

    return 'background'
}

export async function handleGetProjectDetails(_event: Electron.IpcMainInvokeEvent, projectPath: string) {
    log.info('IPC: getProjectDetails', projectPath)

    try {
        await access(projectPath)

        const entries = await readdir(projectPath)
        const statsPromise = stat(projectPath)
        const markers: string[] = []

        const readmeFile = getPreferredReadmeFile(entries)
        const readmePromise = readmeFile
            ? readFile(join(projectPath, readmeFile), 'utf-8').catch((err) => {
                log.warn('Could not read README', err)
                return null
            })
            : Promise.resolve<string | null>(null)

        const packageJsonPromise = entries.includes('package.json')
            ? readFile(join(projectPath, 'package.json'), 'utf-8')
                .then((pkgContent) => JSON.parse(pkgContent))
                .catch((err) => {
                    log.warn('Could not parse package.json', err)
                    return null
                })
            : Promise.resolve<any>(null)

        for (const marker of PROJECT_MARKERS) {
            if (marker.startsWith('*')) {
                const ext = marker.slice(1)
                if (entries.some((entry) => entry.endsWith(ext))) {
                    markers.push(marker)
                }
            } else if (entries.includes(marker)) {
                markers.push(marker)
            }
        }

        const projectType = detectProjectTypeFromMarkers(markers)
        const packageJson = await packageJsonPromise
        const frameworks: FrameworkDefinition[] = packageJson
            ? detectFrameworksFromPackageJson(packageJson, entries)
            : []
        const dependencyInstallStatusPromise = packageJson
            ? detectNodeDependencyInstallStatus(projectPath, packageJson).catch((err) => {
                log.warn('Could not inspect dependency install status', err)
                return null
            })
            : Promise.resolve<DependencyInstallStatus | null>(null)
        const projectIconPathPromise = resolveProjectIconPath(projectPath, entries, packageJson).catch((err) => {
            log.warn('Could not resolve project icon', err)
            return null
        })
        const [readme, stats, dependencyInstallStatus, projectIconPath] = await Promise.all([
            readmePromise,
            statsPromise,
            dependencyInstallStatusPromise,
            projectIconPathPromise
        ])
        const folderName = projectPath.split(/[\\/]/).pop() || 'Unknown'

        return {
            success: true,
            project: {
                name: packageJson?.name || folderName,
                displayName: packageJson?.name || folderName,
                path: projectPath,
                type: projectType?.id || 'unknown',
                projectIconPath,
                typeInfo: projectType,
                markers,
                frameworks: frameworks.map((framework) => framework.id),
                frameworkInfo: frameworks,
                description: packageJson?.description || null,
                version: packageJson?.version || null,
                readme,
                lastModified: stats.mtimeMs,
                scripts: packageJson?.scripts || null,
                dependencies: packageJson?.dependencies || null,
                devDependencies: packageJson?.devDependencies || null,
                dependencyInstallStatus
            }
        }
    } catch (err: any) {
        log.error('Failed to get project details:', err)
        return { success: false, error: err.message }
    }
}

export async function handleInstallProjectDependencies(
    _event: Electron.IpcMainInvokeEvent,
    projectPath: string,
    options?: { onlyMissing?: boolean }
) {
    log.info('IPC: installProjectDependencies', { projectPath, onlyMissing: Boolean(options?.onlyMissing) })
    const mode = options?.onlyMissing ? 'missing' : 'all'

    try {
        await access(projectPath)
        const packageJsonPath = join(projectPath, 'package.json')
        if (!(await pathExists(packageJsonPath))) {
            return { success: false, error: 'No package.json found in this project.' }
        }

        let packageJson: ProjectPackageJson | null = null
        try {
            const packageContent = await readFile(packageJsonPath, 'utf-8')
            packageJson = JSON.parse(packageContent) as ProjectPackageJson
        } catch (error: any) {
            return { success: false, error: error?.message || 'Failed to read package.json.' }
        }

        const installStatusBefore = await detectNodeDependencyInstallStatus(projectPath, packageJson)
        if (options?.onlyMissing && installStatusBefore.missingPackages <= 0) {
            return {
                success: true,
                manager: await detectDependencyInstallManager(projectPath, packageJson),
                durationMs: 0,
                message: 'All dependencies are already installed.',
                installStatus: installStatusBefore
            }
        }
        const manager = await detectDependencyInstallManager(projectPath, packageJson)
        const startedAt = Date.now()
        const installRun = await runInstallProcess(projectPath, manager)
        const installStatusAfter = await detectNodeDependencyInstallStatus(projectPath, packageJson)

        if (!installRun.success) {
            return {
                success: false,
                error: installRun.error || 'Dependency installation failed.',
                manager,
                durationMs: Date.now() - startedAt,
                output: installRun.output.slice(-8000),
                installStatus: installStatusAfter
            }
        }

        const label = options?.onlyMissing ? 'missing dependencies' : 'dependencies'
        return {
            success: true,
            manager,
            durationMs: Date.now() - startedAt,
            message: `Installed ${label} using ${manager}.`,
            output: installRun.output.slice(-4000),
            installStatus: installStatusAfter
        }
    } catch (err: any) {
        log.error('Failed to install project dependencies:', err)
        return { success: false, error: err?.message || 'Failed to install dependencies.' }
    }
}

export async function handleGetProjectSessions(_event: Electron.IpcMainInvokeEvent, _projectPath: string) {
    return { success: true, sessions: [] }
}

export async function handleGetProjectProcesses(_event: Electron.IpcMainInvokeEvent, projectPath: string) {
    try {
        const { detectProjectProcesses } = await import('../../inspectors/process-detector')
        const status = await detectProjectProcesses(projectPath)
        return { success: true, ...status }
    } catch (err: any) {
        log.error('Failed to get project processes:', err)
        return { success: false, error: err.message, isLive: false, processes: [], activePorts: [] }
    }
}
