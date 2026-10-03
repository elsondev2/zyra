import type { OnboardingSnapshot } from '../../shared/onboarding/contracts'

/** Independent disk reads share the startup gate; theme and setup remain mandatory. */
export async function initializeDesktopStartup(input: {
    refreshTheme: () => Promise<void>
    initializeAnalytics: () => Promise<void>
    initializeOnboarding: () => Promise<OnboardingSnapshot | null>
}): Promise<OnboardingSnapshot | null> {
    const [, , onboarding] = await Promise.all([
        input.refreshTheme(),
        input.initializeAnalytics(),
        input.initializeOnboarding()
    ])
    return onboarding
}
