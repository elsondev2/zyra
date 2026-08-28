import { useMemo } from 'react'
import CloudField from '@/components/ui/CloudField'
import { useSettings } from '@/lib/settings'
import { useThemeRevision } from '@/lib/use-theme-revision'
import './OnboardingBackground.css'

function readThemeColor(variable: string, fallback: string): string {
    if (typeof window === 'undefined') return fallback
    return getComputedStyle(document.documentElement).getPropertyValue(variable).trim() || fallback
}

export function OnboardingBackground() {
    const { settings } = useSettings()
    const themeRevision = useThemeRevision()
    const palette = useMemo(() => ({
        background: readThemeColor('--color-bg', '#0c121f'),
        accent: readThemeColor('--accent-primary', settings.accentColor.primary),
        ink: readThemeColor('--color-text', '#f0f4f8')
    }), [settings.accentColor.primary, settings.theme, themeRevision])

    return (
        <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
            <CloudField
                backgroundColor={palette.background}
                accentColor={palette.accent}
                inkColor={palette.ink}
                speed={0.72}
                maxFps={24}
                reducedMotion={settings.accessibilityReduceMotion}
                className="onboarding-cloud-field"
            />
            <div className="onboarding-cloud-wash absolute inset-0" />
        </div>
    )
}
