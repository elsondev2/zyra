import materialIconManifestJson from 'material-icon-theme/dist/material-icons.json'

type MaterialIconManifest = {
    iconDefinitions: Record<string, { iconPath?: string }>
    fileExtensions: Record<string, string>
    fileNames: Record<string, string>
    folderNames: Record<string, string>
    folderNamesExpanded: Record<string, string>
    rootFolderNames: Record<string, string>
    rootFolderNamesExpanded: Record<string, string>
    light?: Partial<Pick<MaterialIconManifest, 'fileExtensions' | 'fileNames' | 'folderNames' | 'folderNamesExpanded' | 'rootFolderNames' | 'rootFolderNamesExpanded'>>
    file: string
    folder: string
    folderExpanded: string
    rootFolder: string
    rootFolderExpanded: string
}

const manifest = materialIconManifestJson as MaterialIconManifest
const ZYRA_FOLDER_NAMES = new Set(['.zyra', 'zyra-runtime', 'zyra-browser-control-extension'])

export type MaterialFileIconAsset = Readonly<{ definition: string; fileName: string }>

export const MATERIAL_FILE_ICON_RESOLUTION_CACHE_LIMIT = 512
const MATERIAL_FILE_ICON_PRELOAD_CACHE_LIMIT = 96
const resolutionCache = new Map<string, MaterialFileIconAsset>()
const preloadCache = new Map<string, Promise<void>>()
let commonPrewarmScheduled = false

const COMMON_FILE_ICON_PATHS = [
    'README.md',
    'package.json',
    'package-lock.json',
    'tsconfig.json',
    'index.ts',
    'App.tsx',
    'index.js',
    'Component.jsx',
    'styles.css',
    'index.html',
    'notes.md',
    'data.json',
    '.gitignore',
    '.env',
    'Dockerfile',
    'vite.config.ts',
    'file.txt'
] as const

const COMMON_FOLDER_ICON_PATHS = [
    'src',
    'components',
    'node_modules',
    'public',
    'assets',
    '.git',
    '.github',
    'docs',
    'test',
    'dist'
] as const

function entryName(pathValue: string): string {
    return pathValue.replace(/\\/g, '/').split('/').pop()?.toLowerCase() || ''
}

function resolveFileDefinition(name: string, light: boolean): string {
    if (name === '.zyra' || name.endsWith('.zyra')) return 'robot'
    const themedFileNames = light ? manifest.light?.fileNames : undefined
    const themedExtensions = light ? manifest.light?.fileExtensions : undefined
    const namedDefinition = themedFileNames?.[name] || manifest.fileNames[name]
    if (namedDefinition) return namedDefinition

    const parts = name.split('.')
    for (let index = 1; index < parts.length; index += 1) {
        const candidate = parts.slice(index).join('.')
        const extensionDefinition = themedExtensions?.[candidate] || manifest.fileExtensions[candidate]
        if (extensionDefinition) return extensionDefinition
    }
    return manifest.file
}

function resolveFolderDefinition(name: string, expanded: boolean, root: boolean, light: boolean): string {
    if (ZYRA_FOLDER_NAMES.has(name)) return expanded ? 'folder-app-open' : 'folder-app'
    if (name === '.zyra-worktrees') return expanded ? 'folder-git-open' : 'folder-git'
    const baseNames = root
        ? (expanded ? manifest.rootFolderNamesExpanded : manifest.rootFolderNames)
        : (expanded ? manifest.folderNamesExpanded : manifest.folderNames)
    const lightNames = light
        ? root
            ? (expanded ? manifest.light?.rootFolderNamesExpanded : manifest.light?.rootFolderNames)
            : (expanded ? manifest.light?.folderNamesExpanded : manifest.light?.folderNames)
        : undefined
    return lightNames?.[name] || baseNames[name] || (root
        ? (expanded ? manifest.rootFolderExpanded : manifest.rootFolder)
        : (expanded ? manifest.folderExpanded : manifest.folder))
}

function definitionFileName(definition: string): string {
    const iconPath = manifest.iconDefinitions[definition]?.iconPath || manifest.iconDefinitions[manifest.file]?.iconPath || ''
    return iconPath.replace(/\\/g, '/').split('/').pop() || 'file.svg'
}

export function resolveMaterialFileIconAsset({
    path,
    kind,
    expanded = false,
    root = false,
    light = false
}: {
    path: string
    kind: 'file' | 'directory'
    expanded?: boolean
    root?: boolean
    light?: boolean
}): MaterialFileIconAsset {
    const name = entryName(path)
    const cacheKey = `${name}\u0000${kind}\u0000${light ? 1 : 0}\u0000${expanded ? 1 : 0}\u0000${root ? 1 : 0}`
    const cached = resolutionCache.get(cacheKey)
    if (cached) {
        resolutionCache.delete(cacheKey)
        resolutionCache.set(cacheKey, cached)
        return cached
    }

    const definition = kind === 'directory'
        ? resolveFolderDefinition(name, expanded, root, light)
        : resolveFileDefinition(name, light)
    const resolved = Object.freeze({ definition, fileName: definitionFileName(definition) })
    resolutionCache.set(cacheKey, resolved)
    if (resolutionCache.size > MATERIAL_FILE_ICON_RESOLUTION_CACHE_LIMIT) {
        resolutionCache.delete(resolutionCache.keys().next().value as string)
    }
    return resolved
}

export function materialFileIconUrl(fileName: string): string {
    const relativePath = `material-icons/${encodeURIComponent(fileName)}`
    if (typeof document === 'undefined') return relativePath
    return new URL(relativePath, document.baseURI).toString()
}

export function preloadMaterialFileIcon(fileName: string): Promise<void> {
    if (typeof Image === 'undefined') return Promise.resolve()

    const iconUrl = materialFileIconUrl(fileName)
    const cached = preloadCache.get(iconUrl)
    if (cached) {
        preloadCache.delete(iconUrl)
        preloadCache.set(iconUrl, cached)
        return cached
    }

    const image = new Image()
    image.decoding = 'async'
    const loaded = new Promise<void>((resolve) => {
        const settle = () => {
            image.onload = null
            image.onerror = null
            resolve()
        }
        image.onload = () => {
            const decoded = typeof image.decode === 'function' ? image.decode() : undefined
            if (decoded) void decoded.then(settle, settle)
            else settle()
        }
        image.onerror = settle
    })
    preloadCache.set(iconUrl, loaded)
    if (preloadCache.size > MATERIAL_FILE_ICON_PRELOAD_CACHE_LIMIT) {
        preloadCache.delete(preloadCache.keys().next().value as string)
    }
    image.src = iconUrl
    return loaded
}

export function prewarmCommonMaterialFileIcons(
    preload: (fileName: string) => unknown = preloadMaterialFileIcon
): MaterialFileIconAsset[] {
    const uniqueAssets = new Map<string, MaterialFileIconAsset>()
    for (const light of [false, true]) {
        for (const path of COMMON_FILE_ICON_PATHS) {
            const asset = resolveMaterialFileIconAsset({ path, kind: 'file', light })
            uniqueAssets.set(asset.fileName, asset)
        }
        for (const path of COMMON_FOLDER_ICON_PATHS) {
            for (const expanded of [false, true]) {
                const asset = resolveMaterialFileIconAsset({ path, kind: 'directory', expanded, light })
                uniqueAssets.set(asset.fileName, asset)
            }
        }
    }
    for (const asset of uniqueAssets.values()) preload(asset.fileName)
    return [...uniqueAssets.values()]
}

export function scheduleCommonMaterialFileIconPrewarm({
    schedule,
    preload
}: {
    schedule?: (work: () => void) => void
    preload?: (fileName: string) => unknown
} = {}): boolean {
    if (commonPrewarmScheduled) return false

    const scheduleWork = schedule || (typeof window !== 'undefined'
        ? (work: () => void) => {
            if (typeof window.requestIdleCallback === 'function') {
                window.requestIdleCallback(work, { timeout: 1_000 })
            } else {
                window.setTimeout(work, 200)
            }
        }
        : undefined)
    if (!scheduleWork) return false

    commonPrewarmScheduled = true
    scheduleWork(() => prewarmCommonMaterialFileIcons(preload))
    return true
}
