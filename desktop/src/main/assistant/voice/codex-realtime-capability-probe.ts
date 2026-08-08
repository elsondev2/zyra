import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs'
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

export function inspectCodexRealtimeSchemaMarkers(schemaText: string): string[] {
    return REQUIRED_SCHEMA_MARKERS.filter((marker) => !schemaText.includes(marker))
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
