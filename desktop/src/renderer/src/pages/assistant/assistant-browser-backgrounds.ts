import type { DevScopeBrowserBackgroundCategory, DevScopeBrowserRemoteBackground } from '@shared/contracts/devscope-api'
import manifestData from '../../assets/browser-backgrounds/manifest.json'

export type AssistantBrowserBuiltInBackground = {
    id: string
    provider: 'built-in'
    category: DevScopeBrowserBackgroundCategory
    categoryLabel: string
    imageUrl: string
    thumbnailUrl: string
    title: string
    alt: string
    focalPoint: { x: number; y: number }
    textTone: 'light' | 'dark'
    dominantColor: string
    attributionText: string
    sourceUrl: string
    creatorName: string
    creatorUrl: string | null
    licenseName: string
    licenseUrl: string
}

export type AssistantBrowserBackground = AssistantBrowserBuiltInBackground | DevScopeBrowserRemoteBackground

export const ASSISTANT_BROWSER_BACKGROUND_CATEGORIES: Array<{ id: DevScopeBrowserBackgroundCategory; label: string }> = [
    { id: 'all', label: 'All' },
    { id: 'forest-paths', label: 'Forest Trails' },
    { id: 'mountain-highs', label: 'Peak Season' },
    { id: 'ocean-moods', label: 'Ocean Mood' },
    { id: 'desert-dreams', label: 'Desert Glow' },
    { id: 'water-in-motion', label: 'Water in Motion' },
    { id: 'wildflower-party', label: 'Flower Power' },
    { id: 'animal-cameos', label: 'Wild Encounters' },
    { id: 'ice-aurora', label: 'Polar Light' },
    { id: 'earth-above', label: 'Orbital Views' }
]

let assetUrls: Record<string, string> = {}
try {
    assetUrls = import.meta.glob('../../assets/browser-backgrounds/**/*.webp', {
        eager: true,
        import: 'default',
        query: '?url'
    }) as Record<string, string>
} catch {
    // Node contract tests do not provide Vite's compile-time glob helper.
}

type ManifestAsset = {
    id: string
    category: DevScopeBrowserBackgroundCategory
    categoryLabel: string
    file: string
    thumbnail: { file: string }
    title: string
    alt: string
    focalPoint: { x: number; y: number }
    presentation: { textTone: 'light' | 'dark'; dominantColor: string }
    source: {
        pageUrl: string
        creator: { name: string; url: string | null }
    }
    rights: { name: string; url: string }
    attributionText: string
}

function urlForFile(file: string): string | null {
    const suffix = `/browser-backgrounds/${file}`
    return Object.entries(assetUrls).find(([path]) => path.replace(/\\/g, '/').endsWith(suffix))?.[1] || null
}

export const ASSISTANT_BROWSER_BUILT_IN_BACKGROUNDS: AssistantBrowserBuiltInBackground[] = (manifestData.assets as ManifestAsset[]).flatMap((asset) => {
    const imageUrl = urlForFile(asset.file)
    const thumbnailUrl = urlForFile(asset.thumbnail.file)
    if (!imageUrl || !thumbnailUrl) return []
    return [{
        id: asset.id,
        provider: 'built-in' as const,
        category: asset.category,
        categoryLabel: asset.categoryLabel,
        imageUrl,
        thumbnailUrl,
        title: asset.title,
        alt: asset.alt,
        focalPoint: asset.focalPoint,
        textTone: asset.presentation.textTone,
        dominantColor: asset.presentation.dominantColor,
        attributionText: asset.attributionText,
        sourceUrl: asset.source.pageUrl,
        creatorName: asset.source.creator.name,
        creatorUrl: asset.source.creator.url,
        licenseName: asset.rights.name,
        licenseUrl: asset.rights.url
    }]
})

let lastRandomBackgroundId = ''

export function filterAssistantBrowserBuiltInBackgrounds(category: DevScopeBrowserBackgroundCategory): AssistantBrowserBuiltInBackground[] {
    return category === 'all'
        ? ASSISTANT_BROWSER_BUILT_IN_BACKGROUNDS
        : ASSISTANT_BROWSER_BUILT_IN_BACKGROUNDS.filter((background) => background.category === category)
}

export function chooseAssistantBrowserBuiltInBackground(input: {
    category: DevScopeBrowserBackgroundCategory
    rotation: 'every-tab' | 'fixed'
    selectedId: string
}): AssistantBrowserBuiltInBackground | null {
    const candidates = filterAssistantBrowserBuiltInBackgrounds(input.category)
    if (candidates.length === 0) return null
    if (input.rotation === 'fixed') {
        return candidates.find((background) => background.id === input.selectedId)
            || ASSISTANT_BROWSER_BUILT_IN_BACKGROUNDS.find((background) => background.id === input.selectedId)
            || candidates[0]!
    }
    const fresh = candidates.filter((background) => background.id !== lastRandomBackgroundId)
    const pool = fresh.length > 0 ? fresh : candidates
    const values = new Uint32Array(1)
    crypto.getRandomValues(values)
    const selected = pool[values[0]! % pool.length]!
    lastRandomBackgroundId = selected.id
    return selected
}

export function remoteBackgroundAttribution(background: DevScopeBrowserRemoteBackground): string {
    return `Photo by ${background.photographer} on Unsplash`
}
