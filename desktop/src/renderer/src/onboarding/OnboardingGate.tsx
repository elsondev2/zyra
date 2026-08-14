import { AlertTriangle, LoaderCircle } from 'lucide-react'
import type { ReactNode } from 'react'
import { useSettings } from '@/lib/settings'
import { useOnboarding } from '@/lib/onboarding'
import { isElectronRendererRuntime } from '@/lib/browser-file-url'
import { BrowserSetupRequired } from './BrowserSetupRequired'
import { OnboardingChrome } from './OnboardingChrome'
import { OnboardingFlow } from './OnboardingFlow'
import { resolveOnboardingGateMode } from './onboarding-gate-policy'

function DesktopSetupState({ title, detail, loading = false }: { title: string; detail: string; loading?: boolean }) {
    return (
        <div className="h-screen overflow-hidden bg-sparkle-bg text-sparkle-text">
            <OnboardingChrome />
            <main className="flex h-full items-center justify-center px-6 pt-[34px]">
                <section className="max-w-[560px] text-center">
                    {loading
                        ? <LoaderCircle size={20} className="mx-auto mb-5 animate-spin motion-reduce:animate-none text-sparkle-text-muted" />
                        : <AlertTriangle size={20} className="mx-auto mb-5 text-[var(--status-warning)]" />}
                    <h1 className="text-[24px] font-medium tracking-[-0.035em]">{title}</h1>
                    <p className="mt-3 text-[13px] leading-6 text-sparkle-text-secondary">{detail}</p>
                </section>
            </main>
        </div>
    )
}

export function OnboardingGate({ children }: { children: ReactNode }) {
    const { preferencesHydrated, preferencesError } = useSettings()
    const { snapshot, loading, error } = useOnboarding()
    const desktop = isElectronRendererRuntime()

    const mode = resolveOnboardingGateMode({
        desktop,
        preferencesHydrated,
        preferencesError,
        onboardingLoading: loading,
        onboardingError: error,
        snapshot
    })

    if (mode === 'desktop-loading') {
        return <DesktopSetupState title="Preparing setup" detail="Loading this device’s setup checkpoint and preferences." loading />
    }
    if (mode === 'browser-required') return <BrowserSetupRequired unavailable={Boolean(error)} />
    if (mode === 'desktop-error') {
        return <DesktopSetupState title="Setup could not be loaded" detail={preferencesError || error || 'Close Zyra and try again. Normal Desktop content stays locked until setup state is available.'} />
    }
    if (mode === 'desktop-future-schema') {
        return <DesktopSetupState title="A newer Zyra is required" detail={`This device’s setup uses schema ${snapshot?.detectedSchemaVersion ?? 'newer'}. Update Zyra before continuing; the setup file was left unchanged.`} />
    }
    if (mode === 'desktop-onboarding') return <OnboardingFlow />
    return <>{children}</>
}
