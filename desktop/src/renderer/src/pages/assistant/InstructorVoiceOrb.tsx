import { useEffect, useState, type CSSProperties } from 'react'
import type { InstructorRealtimeVoice } from '@shared/assistant/contracts'
import Strands from '@/components/ui/strands/Strands'
import { cn } from '@/lib/utils'
import type { InstructorVoiceStatus } from './useInstructorVoiceSession'
import { getInstructorVoiceVisualTheme } from './instructor-voice-visuals'
import './InstructorVoiceOrb.css'

type OrbMotionSizes = {
    full: number
    compact: number
}

function readOrbMotionSizes(): OrbMotionSizes {
    if (typeof window === 'undefined') return { full: 330, compact: 160 }
    return {
        full: Math.min(330, Math.max(230, window.innerWidth * 0.36)),
        compact: window.innerWidth <= 420 ? 140 : 160
    }
}

export function InstructorVoiceOrb({
    voice,
    status,
    activityLevel,
    compact = false,
    animateLayout = false
}: {
    voice: InstructorRealtimeVoice
    status: InstructorVoiceStatus
    activityLevel: number
    compact?: boolean
    animateLayout?: boolean
}) {
    const [motionSizes, setMotionSizes] = useState<OrbMotionSizes>(readOrbMotionSizes)
    const theme = getInstructorVoiceVisualTheme(voice)
    const active = status === 'active'
    const connecting = status === 'connecting' || status === 'requesting-microphone'
    const level = Math.max(0, Math.min(1, activityLevel))
    const energy = active ? Math.max(0.04, level) : connecting ? 0.1 : 0.018
    const volumeScale = active ? 1 + level * 0.075 : 1

    useEffect(() => {
        if (!animateLayout) return
        const updateSizes = () => setMotionSizes(readOrbMotionSizes())
        window.addEventListener('resize', updateSizes)
        return () => window.removeEventListener('resize', updateSizes)
    }, [animateLayout])

    const slotSize = animateLayout
        ? (compact ? motionSizes.compact : motionSizes.full)
        : undefined
    const renderSize = animateLayout ? motionSizes.full : undefined
    const layoutScale = animateLayout && compact
        ? motionSizes.compact / motionSizes.full
        : 1

    return (
        <div
            aria-hidden="true"
            className={cn(
                'instructor-voice-orb',
                animateLayout
                    ? 'instructor-voice-orb-animated-layout'
                    : compact
                        ? 'instructor-voice-orb-compact'
                        : 'instructor-voice-orb-full',
                animateLayout && compact && 'is-compact'
            )}
            style={{
                '--instructor-orb-volume-scale': volumeScale,
                '--instructor-orb-layout-scale': layoutScale,
                ...(slotSize ? { width: slotSize, height: slotSize } : {})
            } as CSSProperties}
        >
            <div
                className="instructor-voice-orb-render-surface"
                style={renderSize ? { width: renderSize, height: renderSize } : undefined}
            >
                <div className="instructor-voice-orb-volume">
                    <Strands
                        colors={[theme.secondary, theme.highlight, theme.primary]}
                        count={3}
                        speed={(active ? 0.38 : 0.16) + energy * 0.74}
                        amplitude={0.72 + energy * 1.55}
                        waviness={theme.frequency}
                        thickness={0.45 + energy * 0.34}
                        glow={2.35 + energy * 1.3}
                        taper={3}
                        spread={2.4}
                        hueShift={theme.phase / (Math.PI * 2)}
                        intensity={(active ? 0.42 : connecting ? 0.34 : 0.2) + energy * 0.72}
                        saturation={1.45}
                        opacity={active || connecting ? 1 : 0.76}
                        scale={1.3}
                        glass
                        refraction={2.1}
                        dispersion={2.7}
                        glassSize={0.96}
                        className="pointer-events-none"
                    />
                </div>
            </div>
        </div>
    )
}
