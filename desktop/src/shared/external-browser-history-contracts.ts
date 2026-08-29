export type ExternalBrowserHistoryFamily = 'chromium' | 'firefox' | 'safari'
export type ExternalBrowserHistorySupport = 'supported' | 'best-effort'

export type ExternalBrowserHistoryProfile = {
    sourceToken: string
    browserId: string
    browserName: string
    profileName: string
    accountHint: string | null
    family: ExternalBrowserHistoryFamily
    support: ExternalBrowserHistorySupport
    status: 'ready' | 'permission-required' | 'locked'
}

export type ExternalBrowserHistoryScanResult = {
    scanToken: string
    expiresAt: string
    profiles: ExternalBrowserHistoryProfile[]
}

export type ExternalBrowserHistoryImportInput = {
    scanToken: string
    sourceTokens: string[]
    scope: 'all' | 'since'
    since?: string
}

export type ExternalBrowserHistoryImportResult = {
    selectedProfiles: number
    importedProfiles: number
    added: number
    updated: number
    duplicatesMerged: number
    skipped: number
    warnings: string[]
}
