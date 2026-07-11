import { Monitor, Smartphone, Tablet } from 'lucide-react'

export const VIEWPORT_PRESETS = {
    mobile: { width: 375, height: 667, label: 'Mobile', icon: Smartphone },
    tablet: { width: 768, height: 1024, label: 'Tablet', icon: Tablet },
    desktop: { width: 1280, height: 800, label: 'Desktop', icon: Monitor },
    responsive: { width: 0, height: 0, label: 'Full', icon: null }
} as const

export type ViewportPreset = keyof typeof VIEWPORT_PRESETS
export type ViewportPresetConfig = (typeof VIEWPORT_PRESETS)[ViewportPreset]
