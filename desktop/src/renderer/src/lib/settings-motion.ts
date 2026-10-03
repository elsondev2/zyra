export type AppearanceMotionFeel = 'calm' | 'normal' | 'brisk' | 'custom'

export function resolveAppearanceMotionRate(feel: AppearanceMotionFeel, customScale: number): number {
    if (feel === 'calm') return 0.65
    if (feel === 'brisk') return 1.5
    if (feel === 'custom') return Math.max(0.5, Math.min(2, customScale / 100))
    return 1
}

export function applyAppearanceMotionRate(rate: number): () => void {
    const apply = (element: Document | Element = document) => {
        for (const animation of element.getAnimations()) animation.playbackRate = rate
    }
    const applyTarget = (event: Event) => {
        if (!(event.target instanceof Element)) return
        queueMicrotask(() => apply(event.target as Element))
    }

    apply()
    document.addEventListener('animationstart', applyTarget, true)
    document.addEventListener('transitionrun', applyTarget, true)
    return () => {
        document.removeEventListener('animationstart', applyTarget, true)
        document.removeEventListener('transitionrun', applyTarget, true)
    }
}
