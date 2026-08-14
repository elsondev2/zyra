import type { ComponentType } from 'react'
import {
    Archive,
    AudioLines,
    Bot,
    Brain,
    CircleUserRound,
    Files,
    FolderKanban,
    GitBranch,
    Globe2,
    Info,
    KeyRound,
    LayoutGrid,
    MonitorSmartphone,
    Palette,
    Settings2,
    TerminalSquare
} from 'lucide-react'

export type SettingsNavigationItem = {
    id: string
    label: string
    description: string
    keywords?: string
    to: string
    icon: ComponentType<{ size?: number; strokeWidth?: number; className?: string }>
    legacyPaths?: string[]
}

export type SettingsNavigationGroup = {
    id: string
    label: string
    items: SettingsNavigationItem[]
}

export const SETTINGS_NAVIGATION_GROUPS: SettingsNavigationGroup[] = [
    {
        id: 'application',
        label: 'Application',
        items: [
            {
                id: 'general',
                label: 'General',
                description: 'Startup, sidebar, and local maintenance',
                keywords: 'login windows hidden chat rail sidebar agent inbox cache',
                to: '/settings/general',
                icon: Settings2,
                legacyPaths: ['/settings/behavior']
            },
            {
                id: 'appearance',
                label: 'Appearance',
                description: 'Theme, accent, density, and motion',
                keywords: 'color theme system windows light dark accent values font typography google fonts downloaded local installed import code monospace compact reduced animation accessibility',
                to: '/settings/appearance',
                icon: Palette
            },
            {
                id: 'account',
                label: 'Account',
                description: 'ChatGPT connection, usage, and banked resets',
                keywords: 'chatgpt openai pi account email plan oauth login usage limits quota reset credits banked',
                to: '/settings/account',
                icon: CircleUserRound
            },
            {
                id: 'connections',
                label: 'Connections',
                description: 'Local browser access and trusted devices',
                keywords: 'browser link url chrome host connect device phone computer pairing remote lan tailscale trusted revoke',
                to: '/settings/connections',
                icon: MonitorSmartphone
            }
        ]
    },
    {
        id: 'work',
        label: 'Work',
        items: [
            {
                id: 'assistant',
                label: 'Assistant',
                description: 'Defaults, permissions, output, and transcription',
                keywords: 'model profile supervised full access reasoning effort fast prompt streaming tools reconnect diagnostics transcription warning',
                to: '/settings/assistant',
                icon: Bot,
                legacyPaths: ['/settings/chat']
            },
            {
                id: 'voice',
                label: 'Voice',
                description: 'Voice Lab defaults and instructions',
                keywords: 'realtime audio text speech instructor',
                to: '/settings/voice',
                icon: AudioLines
            },
            {
                id: 'browser-control',
                label: 'Browser & control',
                description: 'Restoration, site data, and remembered access',
                keywords: 'tabs cache cookies sign in profile approvals permissions sites revoke',
                to: '/settings/browser-control',
                icon: Globe2
            },
            {
                id: 'files-editor',
                label: 'Files & editor',
                description: 'Preview, editor, CSV, and diff defaults',
                keywords: 'fullscreen python wrap minimap font colors stacked split',
                to: '/settings/files-editor',
                icon: Files
            },
            {
                id: 'terminal-runtime',
                label: 'Terminal & runtime',
                description: 'Shell, terminal display, and package runtime',
                keywords: 'powershell cmd font cursor scrollback node npm pnpm yarn bun',
                to: '/settings/terminal-runtime',
                icon: TerminalSquare
            },
            {
                id: 'providers',
                label: 'Providers',
                description: 'AI providers and model connections',
                keywords: 'groq gemini chatgpt codex api key commit pull request',
                to: '/settings/providers',
                icon: KeyRound,
                legacyPaths: ['/settings/ai']
            }
        ]
    },
    {
        id: 'projects',
        label: 'Projects',
        items: [
            {
                id: 'projects',
                label: 'Projects & explorer',
                description: 'Roots, icons, discovery, and Explorer',
                keywords: 'folders index scan bounded layout finder grid overrides',
                to: '/settings/projects',
                icon: FolderKanban,
                legacyPaths: ['/settings/explorer', '/settings/beta']
            },
            {
                id: 'source-control',
                label: 'Source control',
                description: 'Git identity, branches, and pull requests',
                keywords: 'author init gitignore commit draft guide target bulk repository',
                to: '/settings/source-control',
                icon: GitBranch,
                legacyPaths: ['/settings/git']
            }
        ]
    },
    {
        id: 'data',
        label: 'Data and system',
        items: [
            {
                id: 'memory',
                label: 'Memory',
                description: 'Local memory layers and project context',
                keywords: 'profile facts retrieval preferences sessions',
                to: '/settings/memory',
                icon: Brain
            },
            {
                id: 'archived',
                label: 'Archived chats',
                description: 'Restore canonical archived conversations',
                keywords: 'chats history recover',
                to: '/settings/archived',
                icon: Archive
            },
            {
                id: 'diagnostics',
                label: 'Diagnostics',
                description: 'Logs and local troubleshooting',
                keywords: 'debug errors clear export support',
                to: '/settings/diagnostics',
                icon: TerminalSquare,
                legacyPaths: ['/settings/logs']
            },
            {
                id: 'about',
                label: 'About & updates',
                description: 'Version, signed updates, links, and license',
                keywords: 'download install channel github issue build',
                to: '/settings/about',
                icon: Info
            }
        ]
    }
]

export const SETTINGS_NAVIGATION_ITEMS = SETTINGS_NAVIGATION_GROUPS.flatMap((group) => group.items)

export function findSettingsNavigationItem(pathname: string): SettingsNavigationItem {
    return SETTINGS_NAVIGATION_ITEMS.find((item) => (
        pathname === item.to
        || pathname.startsWith(`${item.to}/`)
        || item.legacyPaths?.some((path) => pathname === path || pathname.startsWith(`${path}/`))
    )) || SETTINGS_NAVIGATION_ITEMS[0]!
}

export const SETTINGS_NAVIGATION_ICON = LayoutGrid
