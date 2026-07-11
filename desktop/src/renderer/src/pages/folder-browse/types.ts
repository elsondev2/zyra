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
    previewType?: 'image' | 'video' | 'audio'
    previewThumbnailPath?: string | null
    isAlbumArt?: boolean
}

export type ViewMode = 'grid' | 'finder'
export type ContentLayout = 'grouped' | 'explorer'

export interface ProjectTypeInfo {
    displayName: string
    themeColor: string
}

export const PROJECT_TYPES_MAP: Record<string, ProjectTypeInfo> = {
    'node': { displayName: 'Node.js', themeColor: '#339933' },
    'python': { displayName: 'Python', themeColor: '#3776AB' },
    'rust': { displayName: 'Rust', themeColor: '#DEA584' },
    'go': { displayName: 'Go', themeColor: '#00ADD8' },
    'java': { displayName: 'Java', themeColor: '#007396' },
    'dotnet': { displayName: '.NET', themeColor: '#512BD4' },
    'ruby': { displayName: 'Ruby', themeColor: '#CC342D' },
    'php': { displayName: 'PHP', themeColor: '#777BB4' },
    'dart': { displayName: 'Dart/Flutter', themeColor: '#0175C2' },
    'elixir': { displayName: 'Elixir', themeColor: '#4B275F' },
    'cpp': { displayName: 'C/C++', themeColor: '#00599C' },
    'git': { displayName: 'Git Repository', themeColor: '#F05032' },
    'android': { displayName: 'Android', themeColor: '#3DDC84' },
    'ios': { displayName: 'iOS/macOS', themeColor: '#000000' },
    'flutter': { displayName: 'Flutter', themeColor: '#02569B' },
    'react-native': { displayName: 'React Native', themeColor: '#61DAFB' },
    'kotlin-multiplatform': { displayName: 'Kotlin Multiplatform', themeColor: '#7F52FF' },
    'xamarin': { displayName: 'Xamarin/MAUI', themeColor: '#3498DB' },
    'ionic': { displayName: 'Ionic', themeColor: '#3880FF' },
    'electron': { displayName: 'Electron', themeColor: '#47848F' },
    'tauri': { displayName: 'Tauri', themeColor: '#FFC131' },
    'qt': { displayName: 'Qt', themeColor: '#41CD52' },
    'wpf': { displayName: 'WPF', themeColor: '#512BD4' },
    'winforms': { displayName: 'Windows Forms', themeColor: '#0078D6' },
    'swiftui': { displayName: 'SwiftUI', themeColor: '#F05138' }
}

export function getProjectTypeById(id: string): ProjectTypeInfo | undefined {
    return PROJECT_TYPES_MAP[id]
}
