import type { OnboardingSnapshot } from '@shared/onboarding/contracts'

export type OnboardingGateMode =
    | 'desktop-loading'
    | 'browser-required'
    | 'desktop-error'
    | 'desktop-future-schema'
    | 'desktop-onboarding'
    | 'normal'

export function resolveOnboardingGateMode(input: {
    desktop: boolean
    preferencesHydrated: boolean
    preferencesError: string | null
    onboardingLoading: boolean
    onboardingError: string | null
    snapshot: OnboardingSnapshot | null
}): OnboardingGateMode {
    if (input.onboardingLoading || !input.preferencesHydrated) {
        return input.desktop ? 'desktop-loading' : 'browser-required'
    }
    if (input.preferencesError || input.onboardingError || !input.snapshot) {
        return input.desktop ? 'desktop-error' : 'browser-required'
    }
    if (input.snapshot.blockedReason === 'future-schema') {
        return input.desktop ? 'desktop-future-schema' : 'browser-required'
    }
    if (!input.snapshot.accessAllowed) {
        return input.desktop ? 'desktop-onboarding' : 'browser-required'
    }
    if (input.snapshot.showOnboarding && input.desktop) return 'desktop-onboarding'
    return 'normal'
}
