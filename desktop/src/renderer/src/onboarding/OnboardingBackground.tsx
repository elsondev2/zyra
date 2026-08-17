import { useMemo } from 'react'
import GradientWaves from '@/components/ui/GradientWaves'
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
        horizon: readThemeColor('--color-bg', '#0c121f'),
        wave: readThemeColor('--accent-primary', settings.accentColor.primary),
        crest: readThemeColor('--color-text', '#f0f4f8')
    }), [settings.accentColor.primary, settings.theme, themeRevision])

    return (
        <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
            <GradientWaves
                horizonColor={palette.horizon}
                waveColor={palette.wave}
                crestColor={palette.crest}
                speed={settings.accessibilityReduceMotion ? 0 : 0.28}
                amplitude={1.7}
                waveScale={0.6}
                waveRatio={0.45}
                swell={19.5}
                turbulence={40.5}
                tilt={0.97}
                zoom={0.9}
                height={5.5}
                fogDepth={23}
                detail="low"
                brightness={0.56}
                opacity={0.44}
                mouseInteraction={false}
                parallaxStrength={0.39}
                grain={false}
                grainIntensity={0.05}
                maxFps={24}
                className="onboarding-gradient-waves"
            />
            <div className="onboarding-gradient-wash absolute inset-0" />
        </div>
    )
}
