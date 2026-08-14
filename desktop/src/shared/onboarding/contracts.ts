export const ONBOARDING_SCHEMA_VERSION = 1 as const
export const ONBOARDING_FLOW_VERSION = 1 as const

export const ONBOARDING_STEPS = [
    'welcome',
    'connect-openai',
    'appearance',
    'web-access',
    'projects',
    'review'
] as const

export type OnboardingStep = typeof ONBOARDING_STEPS[number]
export type OnboardingCompletionStatus = 'in-progress' | 'completed'
export type OnboardingAuthMethod = 'chatgpt' | 'api-key'

export type OnboardingAppearanceSelection = {
    appearanceThemeMode: 'system' | 'light' | 'dark'
    appearanceDarkTheme: string
    appearanceUiFont: string
    appearanceCodeFont: string
    accessibilityReduceMotion: boolean
}

export type OnboardingWebSelection = {
    webSearch: boolean
    webFetch: boolean
}

export type OnboardingProjectsSelection = {
    projectsFolder: string
}

export type OnboardingRecord = {
    schemaVersion: typeof ONBOARDING_SCHEMA_VERSION
    flowVersion: typeof ONBOARDING_FLOW_VERSION
    revision: number
    status: OnboardingCompletionStatus
    currentStep: OnboardingStep
    completedSteps: OnboardingStep[]
    reviewActive: boolean
    startedAt: string
    updatedAt: string
    completedAt: string | null
    data: {
        auth?: {
            method: OnboardingAuthMethod
            verifiedAt: string
        }
        appearance?: OnboardingAppearanceSelection
        web?: OnboardingWebSelection
        projects?: OnboardingProjectsSelection
    }
}

export type OnboardingRecovery =
    | { reason: 'corrupt'; backupPath: string | null }
    | { reason: 'invalid-current-schema'; backupPath: string | null }
    | null

export type OnboardingSnapshot = {
    hydrated: true
    accessAllowed: boolean
    showOnboarding: boolean
    blockedReason: 'future-schema' | null
    detectedSchemaVersion: number | null
    recovery: OnboardingRecovery
    record: OnboardingRecord | null
}

export type OnboardingAuthStatus = {
    checking: boolean
    verified: boolean
    method: OnboardingAuthMethod | null
    provider: 'openai-codex' | 'openai' | null
    label: string
    detail: string | null
    checkedAt: string
}

export type CommitOnboardingStepInput =
    | { expectedRevision: number; step: 'welcome' }
    | { expectedRevision: number; step: 'connect-openai' }
    | { expectedRevision: number; step: 'appearance'; selection: OnboardingAppearanceSelection }
    | { expectedRevision: number; step: 'web-access'; selection: OnboardingWebSelection }
    | { expectedRevision: number; step: 'projects'; selection: OnboardingProjectsSelection }
    | { expectedRevision: number; step: 'review' }

export type NavigateOnboardingInput = {
    expectedRevision: number
    step: OnboardingStep
}

export type BeginOnboardingReviewInput = {
    expectedRevision: number
    invalidateCompletion?: boolean
    confirmed?: boolean
}

export type CancelOnboardingReviewInput = {
    expectedRevision: number
}

export const ONBOARDING_IPC = {
    getState: 'zyra:onboarding:get-state',
    getAuthStatus: 'zyra:onboarding:get-auth-status',
    connectChatGpt: 'zyra:onboarding:connect-chatgpt',
    connectApiKey: 'zyra:onboarding:connect-api-key',
    commitStep: 'zyra:onboarding:commit-step',
    navigate: 'zyra:onboarding:navigate',
    beginReview: 'zyra:onboarding:begin-review',
    cancelReview: 'zyra:onboarding:cancel-review',
    changed: 'zyra:onboarding:changed'
} as const

export function isOnboardingStep(value: unknown): value is OnboardingStep {
    return typeof value === 'string' && (ONBOARDING_STEPS as readonly string[]).includes(value)
}

export function getNextOnboardingStep(step: OnboardingStep): OnboardingStep | null {
    const index = ONBOARDING_STEPS.indexOf(step)
    return index >= 0 ? ONBOARDING_STEPS[index + 1] || null : null
}

export function getPreviousOnboardingStep(step: OnboardingStep): OnboardingStep | null {
    const index = ONBOARDING_STEPS.indexOf(step)
    return index > 0 ? ONBOARDING_STEPS[index - 1] || null : null
}
