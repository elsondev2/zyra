import { randomUUID } from 'node:crypto'
import { homedir } from 'node:os'
import type {
    ExternalBrowserHistoryImportInput,
    ExternalBrowserHistoryImportResult,
    ExternalBrowserHistoryProfile,
    ExternalBrowserHistoryScanResult
} from '../../shared/external-browser-history-contracts'
import type { BrowserHistoryImportEntry } from '../browser-history-store'
import { BrowserHistoryStore } from '../browser-history-store'
import { discoverExternalBrowserHistoryProfiles, type DiscoveredExternalHistoryProfile } from './source-registry'
import { readExternalBrowserHistory } from './source-reader'

const SCAN_TTL_MS = 10 * 60_000
const MAX_SELECTED_PROFILES = 16

type ExternalBrowserHistoryDependencies = {
    discover: typeof discoverExternalBrowserHistoryProfiles
    read: typeof readExternalBrowserHistory
    home: () => string
}

type ScanState = {
    expiresAt: number
    profiles: Map<string, DiscoveredExternalHistoryProfile>
}

export class ExternalBrowserHistoryService {
    private readonly scans = new Map<string, ScanState>()
    private readonly dependencies: ExternalBrowserHistoryDependencies

    constructor(
        private readonly historyStore: BrowserHistoryStore,
        dependencies?: Partial<ExternalBrowserHistoryDependencies>
    ) {
        this.dependencies = {
            discover: dependencies?.discover || discoverExternalBrowserHistoryProfiles,
            read: dependencies?.read || readExternalBrowserHistory,
            home: dependencies?.home || homedir
        }
    }

    async scan(): Promise<ExternalBrowserHistoryScanResult> {
        this.pruneScans()
        const discovered = await this.dependencies.discover({ home: this.dependencies.home() })
        const scanToken = randomUUID()
        const expiresAt = Date.now() + SCAN_TTL_MS
        const profiles = new Map<string, DiscoveredExternalHistoryProfile>()
        const publicProfiles: ExternalBrowserHistoryProfile[] = discovered.map((profile) => {
            const sourceToken = randomUUID()
            profiles.set(sourceToken, profile)
            return {
                sourceToken,
                browserId: profile.browserId,
                browserName: profile.browserName,
                profileName: profile.profileName,
                accountHint: profile.accountHint,
                family: profile.family,
                support: profile.support,
                status: profile.status
            }
        })
        this.scans.set(scanToken, { expiresAt, profiles })
        return { scanToken, expiresAt: new Date(expiresAt).toISOString(), profiles: publicProfiles }
    }

    async import(input: ExternalBrowserHistoryImportInput): Promise<ExternalBrowserHistoryImportResult> {
        this.pruneScans()
        const scan = this.scans.get(String(input.scanToken || ''))
        if (!scan || scan.expiresAt <= Date.now()) throw new Error('The browser-profile scan expired. Scan again before importing.')
        const sourceTokens = [...new Set(Array.isArray(input.sourceTokens) ? input.sourceTokens.map(String) : [])]
        if (sourceTokens.length === 0 || sourceTokens.length > MAX_SELECTED_PROFILES) {
            throw new Error(`Select between 1 and ${MAX_SELECTED_PROFILES} browser profiles.`)
        }
        const selected = sourceTokens.map((token) => scan.profiles.get(token))
        if (selected.some((profile) => !profile)) throw new Error('One selected browser profile no longer belongs to this scan.')
        const since = input.scope === 'since' ? this.normalizeSince(input.since) : undefined
        const warnings: string[] = []
        const rows: BrowserHistoryImportEntry[] = []
        let importedProfiles = 0
        let sourceSkipped = 0
        let supportedProfileFailed = false
        for (const profile of selected as DiscoveredExternalHistoryProfile[]) {
            if (profile.status !== 'ready') {
                warnings.push(`${profile.browserName} · ${profile.profileName} needs permission or must be closed before import.`)
                continue
            }
            try {
                const result = await this.dependencies.read({
                    databasePath: profile.databasePath,
                    family: profile.family,
                    since
                })
                rows.push(...result.rows)
                sourceSkipped += result.skipped
                importedProfiles += 1
            } catch {
                if (profile.support === 'supported') supportedProfileFailed = true
                warnings.push(`${profile.browserName} · ${profile.profileName} could not be read. Close that browser and retry.`)
            }
        }
        if (supportedProfileFailed) {
            throw new Error('A supported browser profile could not be read. Close that browser and retry; nothing was imported.')
        }
        if (importedProfiles === 0) {
            return {
                selectedProfiles: sourceTokens.length,
                importedProfiles: 0,
                added: 0,
                updated: 0,
                duplicatesMerged: 0,
                skipped: sourceSkipped,
                warnings
            }
        }
        rows.sort((left, right) => right.lastVisitedAt.localeCompare(left.lastVisitedAt))
        const committed = await this.historyStore.importEntries(rows)
        this.scans.delete(input.scanToken)
        return {
            selectedProfiles: sourceTokens.length,
            importedProfiles,
            added: committed.added,
            updated: committed.updated,
            duplicatesMerged: committed.duplicatesMerged,
            skipped: committed.skipped + sourceSkipped,
            warnings
        }
    }

    private normalizeSince(value: unknown): string {
        const timestamp = Date.parse(String(value || ''))
        if (!Number.isFinite(timestamp) || timestamp < Date.UTC(1990, 0, 1) || timestamp > Date.now()) {
            throw new Error('Choose a valid import start date.')
        }
        return new Date(timestamp).toISOString()
    }

    private pruneScans(): void {
        const now = Date.now()
        for (const [token, scan] of this.scans) {
            if (scan.expiresAt <= now) this.scans.delete(token)
        }
        while (this.scans.size > 5) {
            const oldest = this.scans.keys().next().value
            if (!oldest) break
            this.scans.delete(oldest)
        }
    }
}
