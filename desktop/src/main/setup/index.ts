import { safeStorage, shell } from 'electron'
import { join } from 'node:path'
import { DevicePreferencesService } from './device-preferences-service'
import { DeviceSecretsService } from './device-secrets-service'
import { OnboardingService } from './onboarding-service'
import { OpenAIAuthWorkerClient } from './openai-auth-worker-client'
import { OpenAIConnectionService } from './openai-connection-service'

export type DesktopSetupServices = {
    preferences: DevicePreferencesService
    secrets: DeviceSecretsService
    auth: OpenAIConnectionService
    onboarding: OnboardingService
}

export function createDesktopSetupServices(userDataPath: string): DesktopSetupServices {
    const setupDirectory = join(userDataPath, 'setup')
    const preferences = new DevicePreferencesService(join(setupDirectory, 'device-preferences.json'))
    const secrets = new DeviceSecretsService(join(setupDirectory, 'device-secrets.bin'), {
        isAvailable: () => safeStorage.isEncryptionAvailable(),
        encrypt: (value) => safeStorage.encryptString(value),
        decrypt: (value) => safeStorage.decryptString(value)
    })
    const authWorker = new OpenAIAuthWorkerClient()
    const auth = new OpenAIConnectionService({
        openExternal: (url) => shell.openExternal(url),
        loadSdk: async () => authWorker.sdk,
        loadAccount: async () => authWorker.account,
        prewarm: () => authWorker.warm(),
        dispose: () => authWorker.dispose()
    })
    const onboarding = new OnboardingService(
        join(setupDirectory, 'onboarding.json'),
        preferences,
        auth
    )
    return { preferences, secrets, auth, onboarding }
}
