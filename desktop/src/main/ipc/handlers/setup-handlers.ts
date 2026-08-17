import { BrowserWindow, ipcMain as electronIpcMain } from 'electron'
import {
    ONBOARDING_IPC,
    type BeginOnboardingReviewInput,
    type CancelOnboardingReviewInput,
    type CommitOnboardingStepInput,
    type DisconnectOpenAIInput,
    type NavigateOnboardingInput,
    type OnboardingSnapshot,
    type UpdateOnboardingAppearanceInput
} from '../../../shared/onboarding/contracts'
import {
    DEVICE_PREFERENCES_IPC,
    type GetDevicePreferencesInput,
    type UpdateDevicePreferencesInput
} from '../../../shared/preferences/contracts'
import {
    DEVICE_SECRETS_IPC,
    type UpdateHostedAiSecretsInput
} from '../../../shared/preferences/secrets-contracts'
import type { DesktopSetupServices } from '../../setup'
import { createOnboardingGatedIpcMain } from '../onboarding-ipc-gate'

const PRE_ONBOARDING_SETUP_CHANNELS = new Set<string>([
    DEVICE_PREFERENCES_IPC.get,
    DEVICE_SECRETS_IPC.migrateLegacyHostedAiKeys,
    ONBOARDING_IPC.getState,
    ONBOARDING_IPC.getAuthStatus,
    ONBOARDING_IPC.connectChatGpt,
    ONBOARDING_IPC.connectApiKey,
    ONBOARDING_IPC.updateAppearance,
    ONBOARDING_IPC.commitStep,
    ONBOARDING_IPC.navigate
])

function errorPayload(error: unknown) {
    return {
        success: false as const,
        error: error instanceof Error ? error.message : 'Setup request failed.',
        ...(
            error && typeof error === 'object' && typeof (error as { code?: unknown }).code === 'string'
                ? { code: (error as { code: string }).code }
                : {}
        )
    }
}

async function result<T>(work: () => Promise<T> | T) {
    try {
        return { success: true as const, ...(await work() as object) }
    } catch (error) {
        return errorPayload(error)
    }
}

function broadcast(channel: string, payload: unknown): void {
    for (const window of BrowserWindow.getAllWindows()) {
        if (!window.isDestroyed()) window.webContents.send(channel, payload)
    }
}

export function registerSetupIpcHandlers(services: DesktopSetupServices): void {
    services.preferences.subscribe((event) => broadcast(DEVICE_PREFERENCES_IPC.changed, event))
    services.onboarding.subscribe((snapshot) => broadcast(ONBOARDING_IPC.changed, snapshot))

    const ipcMain = createOnboardingGatedIpcMain(electronIpcMain, {
        isAccessAllowed: () => services.onboarding.isAccessAllowed(),
        allowedBeforeOnboarding: PRE_ONBOARDING_SETUP_CHANNELS,
        blockedResult: onboardingRequiredError
    })

    ipcMain.handle(DEVICE_PREFERENCES_IPC.get, (_event, input: GetDevicePreferencesInput) => result(async () => ({
        snapshot: await services.preferences.get(input)
    })))
    ipcMain.handle(DEVICE_PREFERENCES_IPC.update, (_event, input: UpdateDevicePreferencesInput) => result(async () => ({
        snapshot: await services.preferences.update(input)
    })))

    ipcMain.handle(DEVICE_SECRETS_IPC.updateHostedAiKeys, (_event, input: UpdateHostedAiSecretsInput) => result(async () => (
        services.secrets.updateHostedAiKeys(input)
    )))
    ipcMain.handle(DEVICE_SECRETS_IPC.migrateLegacyHostedAiKeys, (_event, input: UpdateHostedAiSecretsInput) => result(async () => (
        services.secrets.migrateLegacyHostedAiKeys(input)
    )))

    ipcMain.handle(ONBOARDING_IPC.getState, () => result(async () => ({
        snapshot: await services.onboarding.getState()
    })))
    ipcMain.handle(ONBOARDING_IPC.getAuthStatus, () => result(async () => ({
        status: await services.onboarding.getAuthStatus()
    })))
    ipcMain.handle(ONBOARDING_IPC.getConnectionsStatus, () => result(async () => ({
        status: await services.auth.getConnectionsStatus()
    })))
    ipcMain.handle(ONBOARDING_IPC.connectChatGpt, () => result(async () => ({
        status: await services.onboarding.connectChatGpt()
    })))
    ipcMain.handle(ONBOARDING_IPC.connectApiKey, (_event, apiKey: string) => result(async () => ({
        status: await services.onboarding.connectApiKey(apiKey)
    })))
    ipcMain.handle(ONBOARDING_IPC.updateAppearance, (_event, input: UpdateOnboardingAppearanceInput) => result(async () => ({
        snapshot: await services.onboarding.updateAppearance(input)
    })))
    ipcMain.handle(ONBOARDING_IPC.disconnectOpenAI, (_event, input: DisconnectOpenAIInput) => result(async () => {
        if (input?.confirmed !== true) {
            throw Object.assign(new Error('Confirm the exact OpenAI connection before disconnecting it.'), {
                code: 'CONFIRMATION_REQUIRED'
            })
        }
        return { status: await services.auth.disconnect(input.method) }
    }))
    ipcMain.handle(ONBOARDING_IPC.commitStep, (_event, input: CommitOnboardingStepInput) => result(async () => ({
        snapshot: await services.onboarding.commitStep(input)
    })))
    ipcMain.handle(ONBOARDING_IPC.navigate, (_event, input: NavigateOnboardingInput) => result(async () => ({
        snapshot: await services.onboarding.navigate(input)
    })))
    ipcMain.handle(ONBOARDING_IPC.beginReview, (_event, input: BeginOnboardingReviewInput) => result(async () => ({
        snapshot: await services.onboarding.beginReview(input)
    })))
    ipcMain.handle(ONBOARDING_IPC.cancelReview, (_event, input: CancelOnboardingReviewInput) => result(async () => ({
        snapshot: await services.onboarding.cancelReview(input)
    })))
}

export function onboardingRequiredError(): { success: false; error: string; code: 'ONBOARDING_REQUIRED' } {
    return {
        success: false,
        error: 'Finish setup in Zyra Desktop before using Assistant.',
        code: 'ONBOARDING_REQUIRED'
    }
}

export function requireOnboardingAccess(services: DesktopSetupServices): void {
    if (services.onboarding.isAccessAllowed()) return
    const error = new Error('Finish setup in Zyra Desktop before using Assistant.') as Error & { code?: string }
    error.code = 'ONBOARDING_REQUIRED'
    throw error
}

export type { OnboardingSnapshot }
