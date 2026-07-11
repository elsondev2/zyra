import type { LucideIcon } from 'lucide-react'

export interface Project {
    name: string
    path: string
    type: string
    projectIconPath?: string | null
    markers: string[]
    frameworks: string[]
    lastModified?: number
    isProject: boolean
}

export interface FolderItem {
    name: string
    path: string
    lastModified?: number
    isProject: boolean
}

export interface FileItem {
    name: string
    path: string
    size: number
    lastModified?: number
    extension: string
}

export interface IndexedProject extends Project {
    sourceFolder: string
    depth: number
}

export interface IndexAllFoldersResult {
    success: boolean
    projects?: IndexedProject[]
    indexedCount?: number
    indexedFolders?: number
    indexedFiles?: number
    scannedFolderPaths?: string[]
    errors?: Array<{ folder: string; error: string }>
    error?: string
}

export interface IndexedTotals {
    scanKey: string
    projects: number
    frameworks: number
    types: number
    folders: number
}

export interface IndexedInventory {
    scanKey: string
    projects: IndexedProject[]
    folderPaths: string[]
}

export interface SearchResults {
    projects: Project[]
    folders: FolderItem[]
    files: FileItem[]
}

export interface StatChip {
    key: 'projects' | 'frameworks' | 'types'
    label: string
    value: number
    icon: LucideIcon
    color: string
}

export type ViewMode = 'grid' | 'finder'
export type ContentLayout = 'grouped' | 'explorer'

export const PROJECT_TYPES_MAP: Record<string, { displayName: string; themeColor: string }> = {
    node: { displayName: 'Node.js', themeColor: '#339933' },
    python: { displayName: 'Python', themeColor: '#3776AB' },
    rust: { displayName: 'Rust', themeColor: '#DEA584' },
    go: { displayName: 'Go', themeColor: '#00ADD8' },
    java: { displayName: 'Java', themeColor: '#007396' },
    dotnet: { displayName: '.NET', themeColor: '#512BD4' },
    ruby: { displayName: 'Ruby', themeColor: '#CC342D' },
    php: { displayName: 'PHP', themeColor: '#777BB4' },
    dart: { displayName: 'Dart/Flutter', themeColor: '#0175C2' },
    elixir: { displayName: 'Elixir', themeColor: '#4B275F' },
    cpp: { displayName: 'C/C++', themeColor: '#00599C' },
    git: { displayName: 'Git Repository', themeColor: '#F05032' }
}

export function getProjectTypeById(id: string) {
    return PROJECT_TYPES_MAP[id]
}

export function formatRelativeTime(timestamp?: number): string {
    if (!timestamp) return ''
    const now = Date.now()
    const diff = now - timestamp
    const minutes = Math.floor(diff / 60000)
    const hours = Math.floor(diff / 3600000)
    const days = Math.floor(diff / 86400000)

    if (minutes < 1) return 'Just now'
    if (minutes < 60) return `${minutes}m ago`
    if (hours < 24) return `${hours}h ago`
    if (days < 7) return `${days}d ago`
    return new Date(timestamp).toLocaleDateString()
}
