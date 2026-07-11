import { spawn } from 'child_process'
import { access, lstat } from 'fs/promises'
import { join } from 'path'
import log from 'electron-log'
import type {
    DevScopeGitCloneInput,
    DevScopeGitCloneProgressEvent,
    DevScopeGitCloneResult
} from '../../shared/contracts/devscope-api'
import { getGitRuntime } from '../inspectors/git/core'
import { scheduleFileIndexRefresh } from './file-index-service'
import { invalidateScanProjectsCache } from './project-discovery-service'

type CloneProgressUpdate = Omit<DevScopeGitCloneProgressEvent, 'cloneId'>
type CloneProgressCallback = (update: CloneProgressUpdate) => void

const INVALID_FOLDER_NAME_CHARS = /[<>:"/\\|?*\x00-\x1F]/g

function sanitizeFolderName(value: string): string {
    const cleaned = String(value || '')
        .trim()
        .replace(/\.git$/i, '')
        .replace(INVALID_FOLDER_NAME_CHARS, '-')
        .replace(/\s+/g, ' ')
        .replace(/[. ]+$/g, '')

    return cleaned || 'repository'
}

function inferRepositoryName(repoUrl: string, explicitTargetName?: string): string {
    if (explicitTargetName?.trim()) return sanitizeFolderName(explicitTargetName)

    const normalizedUrl = String(repoUrl || '')
        .trim()
        .replace(/[?#].*$/, '')
        .replace(/[\\/]+$/, '')

    const match = normalizedUrl.match(/([^/:\\]+)$/)
    return sanitizeFolderName(match?.[1] || 'repository')
}

function normalizeProgressPercent(value: number): number {
    if (!Number.isFinite(value)) return 0
    return Math.max(0, Math.min(100, Math.round(value)))
}

function parseGitCloneProgressLine(line: string): Pick<CloneProgressUpdate, 'phase' | 'percent' | 'message'> | null {
    const cleanLine = line.replace(/^remote:\s*/i, '').trim()
    if (!cleanLine) return null

    const progressMatch = cleanLine.match(/^(Receiving objects|Resolving deltas|Updating files|Compressing objects|Counting objects).*?(\d{1,3})%/i)
    if (progressMatch) {
        const phase = progressMatch[1]
        const rawPercent = Number(progressMatch[2])
        const normalizedPercent = normalizeProgressPercent(rawPercent)
        const weightedPercent = phase.toLowerCase().startsWith('receiving')
            ? 25 + normalizedPercent * 0.45
            : phase.toLowerCase().startsWith('resolving')
                ? 70 + normalizedPercent * 0.2
                : phase.toLowerCase().startsWith('updating')
                    ? 90 + normalizedPercent * 0.09
                    : phase.toLowerCase().startsWith('compressing')
                        ? 12 + normalizedPercent * 0.13
                        : normalizedPercent * 0.12

        return {
            phase,
            percent: normalizeProgressPercent(weightedPercent),
            message: `${phase} ${normalizedPercent}%`
        }
    }

    if (/^Cloning into /i.test(cleanLine)) {
        return { phase: 'Starting', percent: 2, message: cleanLine }
    }

    if (/^Enumerating objects/i.test(cleanLine)) {
        return { phase: 'Enumerating objects', percent: 8, message: cleanLine }
    }

    if (/^done\.?$/i.test(cleanLine)) {
        return { phase: 'Finalizing', percent: 96, message: 'Finalizing clone' }
    }

    return { message: cleanLine }
}

export async function cloneGitRepository(
    input: DevScopeGitCloneInput,
    onProgress: CloneProgressCallback
): Promise<DevScopeGitCloneResult> {
    const cloneId = String(input?.cloneId || '').trim()
    const repoUrl = String(input?.repoUrl || '').trim()
    const destinationDirectory = String(input?.destinationDirectory || '').trim()

    if (!cloneId) throw new Error('Clone id is required.')
    if (!repoUrl) throw new Error('Repository URL is required.')
    if (repoUrl.startsWith('-') || /[\x00-\x1F]/.test(repoUrl)) {
        throw new Error('Repository URL is not valid.')
    }
    if (!destinationDirectory) throw new Error('Destination folder is required.')

    await access(destinationDirectory)
    const destinationStat = await lstat(destinationDirectory)
    if (!destinationStat.isDirectory()) {
        throw new Error('Destination must be a folder.')
    }

    const repoName = inferRepositoryName(repoUrl, input.targetName)
    const clonePath = join(destinationDirectory, repoName)
    try {
        await access(clonePath)
        throw new Error(`A file or folder named "${repoName}" already exists.`)
    } catch (err: any) {
        if (err?.code !== 'ENOENT') throw err
    }

    const runtime = getGitRuntime()
    onProgress({
        status: 'running',
        repoName,
        clonePath,
        phase: 'Starting',
        percent: 1,
        message: `Cloning ${repoName}`
    })

    return await new Promise<DevScopeGitCloneResult>((resolve, reject) => {
        const outputLines: string[] = []
        const child = spawn(runtime.binary, ['clone', '--progress', repoUrl, clonePath], {
            cwd: destinationDirectory,
            env: {
                ...runtime.env,
                GIT_TERMINAL_PROMPT: '0'
            },
            windowsHide: true
        })

        const recordOutput = (chunk: Buffer | string) => {
            const text = chunk.toString()
            const lines = text.split(/\r?\n|\r/g)
            for (const rawLine of lines) {
                const line = rawLine.trim()
                if (!line) continue

                outputLines.push(line)
                if (outputLines.length > 18) outputLines.shift()

                const parsed = parseGitCloneProgressLine(line)
                if (!parsed) continue

                onProgress({
                    status: 'running',
                    repoName,
                    clonePath,
                    ...parsed
                })
            }
        }

        child.stdout?.on('data', recordOutput)
        child.stderr?.on('data', recordOutput)

        child.on('error', (err) => {
            log.error('[GitClone] Failed to start git clone:', err)
            const message = err.message || 'Failed to start git clone.'
            onProgress({
                status: 'error',
                repoName,
                clonePath,
                message,
                error: message
            })
            reject(err)
        })

        child.on('close', (code) => {
            if (code === 0) {
                invalidateScanProjectsCache(destinationDirectory)
                invalidateScanProjectsCache(clonePath, { includeParents: false })
                scheduleFileIndexRefresh(destinationDirectory)
                onProgress({
                    status: 'success',
                    repoName,
                    clonePath,
                    phase: 'Done',
                    percent: 100,
                    message: `Cloning done: ${repoName}`
                })
                resolve({ cloneId, repoName, clonePath })
                return
            }

            const tail = outputLines.slice(-5).join('\n')
            const message = tail || `Git clone failed with exit code ${code ?? 'unknown'}.`
            log.error('[GitClone] git clone failed:', message)
            onProgress({
                status: 'error',
                repoName,
                clonePath,
                message,
                error: message
            })
            reject(new Error(message))
        })
    })
}
