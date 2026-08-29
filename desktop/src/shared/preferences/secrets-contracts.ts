export type HostedAiSecretStatus = {
    groqConfigured: boolean
    geminiConfigured: boolean
    persistenceAvailable: boolean
    legacyMigrationComplete: boolean
}

export type HostedAiSecrets = {
    groqApiKey: string
    geminiApiKey: string
}

export type UpdateHostedAiSecretsInput = Partial<HostedAiSecrets> & {
    /** Required when an existing encrypted credential will be removed. */
    confirmClear?: true
}

export type BrowserIntegrationSecretStatus = {
    unsplashConfigured: boolean
    persistenceAvailable: boolean
}

export type UpdateBrowserIntegrationSecretsInput = {
    unsplashAccessKey?: string
    /** Required when an existing encrypted credential will be removed. */
    confirmClear?: true
}

export const DEVICE_SECRETS_IPC = {
    updateHostedAiKeys: 'zyra:secrets:update-hosted-ai-keys',
    migrateLegacyHostedAiKeys: 'zyra:secrets:migrate-legacy-hosted-ai-keys',
    updateBrowserIntegrationSecrets: 'zyra:secrets:update-browser-integrations'
} as const
