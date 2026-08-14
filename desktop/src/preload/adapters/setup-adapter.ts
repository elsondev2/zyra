import { ipcRenderer } from 'electron'
import {
    ONBOARDING_IPC,
    type BeginOnboardingReviewInput,
    type CancelOnboardingReviewInput,
    type CommitOnboardingStepInput,
    type NavigateOnboardingInput,
    type OnboardingSnapshot
} from '../../shared/onboarding/contracts'
import {
    DEVICE_PREFERENCES_IPC,
    type DevicePreferencesChangedEvent,
    type GetDevicePreferencesInput,
    type UpdateDevicePreferencesInput
} from '../../shared/preferences/contracts'
import {
    DEVICE_SECRETS_IPC,
    type UpdateHostedAiSecretsInput
} from '../../shared/preferences/secrets-contracts'

export function createSetupAdapter() {
    return {
        preferences: {
            get: (input: GetDevicePreferencesInput) => ipcRenderer.invoke(DEVICE_PREFERENCES_IPC.get, input),
            update: (input: UpdateDevicePreferencesInput) => ipcRenderer.invoke(DEVICE_PREFERENCES_IPC.update, input),
            onChanged: (callback: (event: DevicePreferencesChangedEvent) => void) => {
                const listener = (_event: Electron.IpcRendererEvent, payload: DevicePreferencesChangedEvent) => callback(payload)
                ipcRenderer.on(DEVICE_PREFERENCES_IPC.changed, listener)
                return () => ipcRenderer.removeListener(DEVICE_PREFERENCES_IPC.changed, listener)
            }
        },
        secrets: {
            getHostedAiKeys: () => ipcRenderer.invoke(DEVICE_SECRETS_IPC.getHostedAiKeys),
            updateHostedAiKeys: (input: UpdateHostedAiSecretsInput) => ipcRenderer.invoke(DEVICE_SECRETS_IPC.updateHostedAiKeys, input),
            migrateLegacyHostedAiKeys: (input: UpdateHostedAiSecretsInput) => ipcRenderer.invoke(DEVICE_SECRETS_IPC.migrateLegacyHostedAiKeys, input)
        },
        onboarding: {
            getState: () => ipcRenderer.invoke(ONBOARDING_IPC.getState),
            getAuthStatus: () => ipcRenderer.invoke(ONBOARDING_IPC.getAuthStatus),
            connectChatGpt: () => ipcRenderer.invoke(ONBOARDING_IPC.connectChatGpt),
            connectApiKey: (apiKey: string) => ipcRenderer.invoke(ONBOARDING_IPC.connectApiKey, apiKey),
            commitStep: (input: CommitOnboardingStepInput) => ipcRenderer.invoke(ONBOARDING_IPC.commitStep, input),
            navigate: (input: NavigateOnboardingInput) => ipcRenderer.invoke(ONBOARDING_IPC.navigate, input),
            beginReview: (input: BeginOnboardingReviewInput) => ipcRenderer.invoke(ONBOARDING_IPC.beginReview, input),
            cancelReview: (input: CancelOnboardingReviewInput) => ipcRenderer.invoke(ONBOARDING_IPC.cancelReview, input),
            onChanged: (callback: (snapshot: OnboardingSnapshot) => void) => {
                const listener = (_event: Electron.IpcRendererEvent, payload: OnboardingSnapshot) => callback(payload)
                ipcRenderer.on(ONBOARDING_IPC.changed, listener)
                return () => ipcRenderer.removeListener(ONBOARDING_IPC.changed, listener)
            }
        }
    }
}
