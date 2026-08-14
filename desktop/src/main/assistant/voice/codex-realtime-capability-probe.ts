import { spawn, spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { RealtimeProviderCapabilityReport } from '../../../shared/assistant/contracts'
import type { ForegroundClock } from '../foreground/foreground-route-controller'
import { systemForegroundClock } from '../foreground/foreground-route-controller'
import {
    createCodexRealtimeCapabilityReport,
    type CodexRealtimeCapabilityEvidence
} from './codex-realtime-capabilities'

const REQUIRED_SCHEMA_MARKERS = [
    'ThreadRealtimeInitialItem',
    'ThreadRealtimeStartTransport',
    'thread/realtime/started',
    'thread/realtime/transcript/done',
    'webrtc',
    'v3'
] as const

export interface CodexRealtimeProbeResult {
    report: RealtimeProviderCapabilityReport
    evidence: CodexRealtimeCapabilityEvidence
    missingSchemaMarkers: string[]
    error: string | null
}

export interface CodexRealtimeCapabilityProbeOptions {
    codexBinary?: string
    transcriptIdentityBridge?: boolean
    clock?: ForegroundClock
}

export function probeInstalledCodexRealtimeCapabilities(
    options: CodexRealtimeCapabilityProbeOptions = {}
): CodexRealtimeProbeResult {
    const clock = options.clock || systemForegroundClock
    const codexBinary = options.codexBinary || (process.platform === 'win32' ? 'codex.cmd' : 'codex')
    const versionResult = spawnSync(codexBinary, ['--version'], {
        encoding: 'utf8',
        windowsHide: true,
        shell: process.platform === 'win32'
    })
    const providerVersion = String(versionResult.stdout || versionResult.stderr || 'unknown').trim().slice(0, 128) || 'unknown'
    const schemaDirectory = mkdtempSync(join(tmpdir(), 'zyra-codex-realtime-schema-'))
    let schemaText = ''
    let error: string | null = null
    try {
        const schemaResult = spawnSync(codexBinary, [
            'app-server',
            'generate-json-schema',
            '--out',
            schemaDirectory
        ], {
            encoding: 'utf8',
            windowsHide: true,
            shell: process.platform === 'win32',
            timeout: 30_000,
            maxBuffer: 8 * 1024 * 1024
        })
        if (schemaResult.status !== 0 || schemaResult.error) {
            error = schemaResult.error?.message
                || String(schemaResult.stderr || `Codex schema generation exited with ${schemaResult.status}.`).trim()
        } else {
            schemaText = readSchemaBundle(schemaDirectory)
        }
    } finally {
        rmSync(schemaDirectory, { recursive: true, force: true })
    }

    const missingSchemaMarkers = inspectCodexRealtimeSchemaMarkers(schemaText)
    const evidence: CodexRealtimeCapabilityEvidence = {
        providerVersion,
        generatedSchemaVerified: !error && missingSchemaMarkers.length === 0,
        transcriptIdentityBridge: Boolean(options.transcriptIdentityBridge)
    }
    return {
        evidence,
        missingSchemaMarkers,
        error,
        report: createCodexRealtimeCapabilityReport(evidence, clock.now())
    }
}

export async function probeInstalledCodexRealtimeCapabilitiesAsync(
    options: CodexRealtimeCapabilityProbeOptions = {}
): Promise<CodexRealtimeProbeResult> {
    const clock = options.clock || systemForegroundClock
    const codexBinary = options.codexBinary || (process.platform === 'win32' ? 'codex.cmd' : 'codex')
    const schemaDirectory = await mkdtemp(join(tmpdir(), 'zyra-codex-realtime-schema-'))
    let schemaText = ''
    let error: string | null = null
    try {
        const [versionResult, schemaResult] = await Promise.all([
            runCommand(codexBinary, ['--version'], 10_000, 512 * 1024),
            runCommand(codexBinary, [
                'app-server',
                'generate-json-schema',
                '--out',
                schemaDirectory
            ], 30_000, 8 * 1024 * 1024)
        ])
        const providerVersion = String(versionResult.stdout || versionResult.stderr || 'unknown').trim().slice(0, 128) || 'unknown'
        if (schemaResult.status !== 0 || schemaResult.error) {
            error = schemaResult.error
                || String(schemaResult.stderr || `Codex schema generation exited with ${schemaResult.status}.`).trim()
        } else {
            schemaText = await readSchemaBundleAsync(schemaDirectory)
        }
        const missingSchemaMarkers = inspectCodexRealtimeSchemaMarkers(schemaText)
        const evidence: CodexRealtimeCapabilityEvidence = {
            providerVersion,
            generatedSchemaVerified: !error && missingSchemaMarkers.length === 0,
            transcriptIdentityBridge: Boolean(options.transcriptIdentityBridge)
        }
        return {
            evidence,
            missingSchemaMarkers,
            error,
            report: createCodexRealtimeCapabilityReport(evidence, clock.now())
        }
    } finally {
        await rm(schemaDirectory, { recursive: true, force: true })
    }
}

export function inspectCodexRealtimeSchemaMarkers(schemaText: string): string[] {
    return REQUIRED_SCHEMA_MARKERS.filter((marker) => !schemaText.includes(marker))
}

async function runCommand(
    command: string,
    args: string[],
    timeoutMs: number,
    maxBuffer: number
): Promise<{ status: number | null; stdout: string; stderr: string; error: string | null }> {
    return new Promise((resolve) => {
        let stdout = ''
        let stderr = ''
        let settled = false
        let timer: ReturnType<typeof setTimeout> | null = null
        const child = spawn(command, args, {
            windowsHide: true,
            shell: process.platform === 'win32',
            stdio: ['ignore', 'pipe', 'pipe']
        })
        const finish = (result: { status: number | null; error: string | null }) => {
            if (settled) return
            settled = true
            if (timer) clearTimeout(timer)
            resolve({ ...result, stdout, stderr })
        }
        const append = (current: string, chunk: Buffer | string) => {
            if (Buffer.byteLength(current, 'utf8') >= maxBuffer) return current
            return `${current}${String(chunk)}`.slice(0, maxBuffer)
        }
        child.stdout?.on('data', (chunk) => { stdout = append(stdout, chunk) })
        child.stderr?.on('data', (chunk) => { stderr = append(stderr, chunk) })
        child.once('error', (commandError) => finish({ status: null, error: commandError.message }))
        child.once('exit', (code) => finish({ status: code, error: null }))
        timer = setTimeout(() => {
            child.kill()
            finish({ status: null, error: `Codex capability probe timed out after ${timeoutMs}ms.` })
        }, timeoutMs)
    })
}

async function readSchemaBundleAsync(directory: string): Promise<string> {
    const chunks: string[] = []
    const visit = async (current: string): Promise<void> => {
        for (const entry of await readdir(current, { withFileTypes: true })) {
            const path = join(current, entry.name)
            if (entry.isDirectory()) await visit(path)
            else if (entry.isFile() && entry.name.endsWith('.json')) chunks.push(await readFile(path, 'utf8'))
        }
    }
    await visit(directory)
    return chunks.join('\n')
}

function readSchemaBundle(directory: string): string {
    const chunks: string[] = []
    const visit = (current: string): void => {
        for (const entry of readdirSync(current, { withFileTypes: true })) {
            const path = join(current, entry.name)
            if (entry.isDirectory()) visit(path)
            else if (entry.isFile() && entry.name.endsWith('.json')) chunks.push(readFileSync(path, 'utf8'))
        }
    }
    visit(directory)
    return chunks.join('\n')
}
