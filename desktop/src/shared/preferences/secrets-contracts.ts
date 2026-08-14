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

export type UpdateHostedAiSecretsInput = Partial<HostedAiSecrets>

export const DEVICE_SECRETS_IPC = {
    getHostedAiKeys: 'zyra:secrets:get-hosted-ai-keys',
    updateHostedAiKeys: 'zyra:secrets:update-hosted-ai-keys',
    migrateLegacyHostedAiKeys: 'zyra:secrets:migrate-legacy-hosted-ai-keys'
} as const
