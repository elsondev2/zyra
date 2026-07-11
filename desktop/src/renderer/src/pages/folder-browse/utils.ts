import type { Project } from './types'

const FILE_COLORS: Record<string, string> = {
    'js': '#f7df1e',
    'ts': '#3178c6',
    'tsx': '#3178c6',
    'jsx': '#61dafb',
    'py': '#3776ab',
    'rb': '#cc342d',
    'go': '#00add8',
    'rs': '#dea584',
    'java': '#007396',
    'cs': '#512bd4',
    'cpp': '#00599c',
    'c': '#a8b9cc',
    'html': '#e34f26',
    'css': '#1572b6',
    'scss': '#cc6699',
    'json': '#cbcb41',
    'md': '#083fa1',
    'txt': '#6b7280',
    'yaml': '#cb171e',
    'yml': '#cb171e',
    'xml': '#0060ac',
    'sql': '#336791',
    'sh': '#4eaa25',
    'bat': '#c1f12e'
}

export function getProjectTypes(projects: Project[]): string[] {
    const types = new Set(projects.map((project) => project.type))
    return Array.from(types).filter((type) => type !== 'unknown' && type !== 'git')
}

export function formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
}

export function getFileColor(ext: string): string {
    return FILE_COLORS[ext.toLowerCase()] || '#6b7280'
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
