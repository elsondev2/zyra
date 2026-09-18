import { lazy, Suspense } from 'react'
import { HashRouter } from 'react-router-dom'
import { SettingsProvider } from '@/lib/settings'
import { OnboardingProvider } from '@/lib/onboarding'
import { OnboardingGate } from '@/onboarding/OnboardingGate'
import QuickPreviewTitleBar from './QuickPreviewTitleBar'

const QuickOpen = lazy(() => import('./QuickOpen'))

export function QuickOpenLoading() {
    return <div className="flex h-screen flex-col bg-sparkle-bg text-sm text-sparkle-text-secondary"><QuickPreviewTitleBar /><div className="flex flex-1 items-center justify-center" role="status">Opening file...</div></div>
}

export default function QuickOpenWindow() {
    return (
        <SettingsProvider>
            <OnboardingProvider>
                <OnboardingGate loadingFallback={<QuickOpenLoading />}>
                    <HashRouter>
                        <Suspense fallback={<QuickOpenLoading />}>
                            <QuickOpen />
                        </Suspense>
                    </HashRouter>
                </OnboardingGate>
            </OnboardingProvider>
        </SettingsProvider>
    )
}
