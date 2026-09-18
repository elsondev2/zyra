export type SettingsPageView = { id: string; label: string; to: string; additionalPaths?: readonly string[] }

export const SETTINGS_PAGE_VIEWS = {
    appearance: [
        { id: 'appearance', label: 'Theme', to: '/settings/app/appearance', additionalPaths: ['/settings/app/appearance/colors'] },
        { id: 'appearance-typography', label: 'Typography', to: '/settings/app/appearance/typography' },
        { id: 'appearance-layout', label: 'Layout', to: '/settings/app/appearance/layout' }
    ],
    providers: [
        { id: 'providers', label: 'Connections', to: '/settings/providers', additionalPaths: ['/settings/providers/writing'] },
        { id: 'provider-models', label: 'Models', to: '/settings/providers/models' },
        { id: 'account', label: 'Limits', to: '/settings/providers/limits' },
        { id: 'usage', label: 'Usage', to: '/settings/providers/usage', additionalPaths: ['/settings/usage'] }
    ],
    chats: [
        { id: 'assistant', label: 'Behavior', to: '/settings/assistant/defaults' },
        { id: 'chat-display', label: 'Display', to: '/settings/assistant/display' },
        { id: 'archived', label: 'Archived', to: '/settings/assistant/archived' }
    ],
    voice: [
        { id: 'voice', label: 'Dictation', to: '/settings/assistant/voice' },
        { id: 'voice-lab', label: 'Voice conversation', to: '/settings/assistant/voice/conversation' }
    ],
    projects: [
        { id: 'projects', label: 'Catalog', to: '/settings/workspace/projects' },
        { id: 'project-discovery', label: 'Discovery & indexing', to: '/settings/workspace/projects/discovery' },
        { id: 'project-presentation', label: 'Presentation', to: '/settings/workspace/projects/presentation' }
    ],
    files: [
        { id: 'files-editor', label: 'Preview', to: '/settings/workspace/files' },
        { id: 'file-editor', label: 'Editor', to: '/settings/workspace/files/editor' },
        { id: 'file-run', label: 'Run & output', to: '/settings/workspace/files/run' }
    ],
    browser: [
        { id: 'browser-control', label: 'Browsing', to: '/settings/workspace/browser' },
        { id: 'browser-privacy', label: 'Privacy', to: '/settings/workspace/browser/privacy' },
        { id: 'browser-data', label: 'Site data', to: '/settings/workspace/browser/data' }
    ],
    git: [
        { id: 'source-control', label: 'Git defaults', to: '/settings/workspace/source-control' },
        { id: 'git-pull-requests', label: 'Pull requests', to: '/settings/workspace/source-control/pull-requests' },
        { id: 'git-writing', label: 'AI writing', to: '/settings/workspace/source-control/writing' }
    ],
    devices: [
        { id: 'connections', label: 'This device', to: '/settings/account/devices' },
        { id: 'device-chrome', label: 'Chrome', to: '/settings/account/devices/chrome' },
        { id: 'device-mobile', label: 'Mobile & trusted', to: '/settings/account/devices/mobile' }
    ],
    memory: [
        { id: 'memory', label: 'Overview', to: '/settings/assistant/memory' },
        { id: 'memory-inspect', label: 'Inspect memory', to: '/settings/assistant/memory/inspect' }
    ]
} as const satisfies Record<string, readonly SettingsPageView[]>

export type SettingsPageFamily = keyof typeof SETTINGS_PAGE_VIEWS

export function settingsPageViewIsActive(view: SettingsPageView, pathname: string): boolean {
    const path = pathname.replace(/\/+$/, '') || '/'
    return path === view.to || Boolean(view.additionalPaths?.includes(path))
}
