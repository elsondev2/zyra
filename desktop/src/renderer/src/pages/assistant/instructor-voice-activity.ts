const ACTIVITY_NOISE_FLOOR = 0.012
const ACTIVITY_FULL_SCALE = 0.2

export function calculateInstructorVoiceActivity(samples: Uint8Array): number {
    if (samples.length === 0) return 0
    let squaredTotal = 0
    for (const sample of samples) {
        const centered = (sample - 128) / 128
        squaredTotal += centered * centered
    }
    const rms = Math.sqrt(squaredTotal / samples.length)
    const normalized = (rms - ACTIVITY_NOISE_FLOOR) / (ACTIVITY_FULL_SCALE - ACTIVITY_NOISE_FLOOR)
    return Math.max(0, Math.min(1, Math.pow(Math.max(0, normalized), 0.68)))
}

export function smoothInstructorVoiceActivity(previous: number, next: number): number {
    const weight = next > previous ? 0.16 : 0.055
    return previous + (next - previous) * weight
}
