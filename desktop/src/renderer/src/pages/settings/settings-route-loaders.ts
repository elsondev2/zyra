export const loadSettingsShell = () => import('./SettingsShell')
export const loadGeneralSettings = () => import('../Settings')
export const loadAppearanceSettings = () => import('./AppearanceSettings')
export const loadAccountSettings = () => import('./AccountSettings')
export const loadAssistantSettings = () => import('./AssistantSettings')
export const loadSkillsSettings = () => import('./SkillsSettings')
export const loadVoiceSettings = () => import('./VoiceSettings')
export const loadConnectionsSettings = () => import('./ConnectionsSettings')
export const loadBrowserControlSettings = () => import('./BrowserControlSettings')
export const loadFilesEditorSettings = () => import('./FilesEditorSettings')
export const loadTerminalRuntimeSettings = () => import('./TerminalRuntimeSettings')
export const loadProviderSettings = () => import('./AISettings')
export const loadSourceControlSettings = () => import('./GitSettings')
export const loadProjectsSettings = () => import('./ProjectsSettings')
export const loadMemorySettings = () => import('./MemorySettings')
export const loadArchivedChatsSettings = () => import('./ArchivedChatsSettings')
export const loadDiagnosticsSettings = () => import('./LogsSettings')
export const loadAboutSettings = () => import('./AboutSettings')

const routeLoaders: Record<string, () => Promise<unknown>> = {
    '/settings/general': loadGeneralSettings,
    '/settings/appearance': loadAppearanceSettings,
    '/settings/account': loadAccountSettings,
    '/settings/assistant': loadAssistantSettings,
    '/settings/skills': loadSkillsSettings,
    '/settings/voice': loadVoiceSettings,
    '/settings/connections': loadConnectionsSettings,
    '/settings/browser-control': loadBrowserControlSettings,
    '/settings/files-editor': loadFilesEditorSettings,
    '/settings/terminal-runtime': loadTerminalRuntimeSettings,
    '/settings/providers': loadProviderSettings,
    '/settings/source-control': loadSourceControlSettings,
    '/settings/projects': loadProjectsSettings,
    '/settings/memory': loadMemorySettings,
    '/settings/archived': loadArchivedChatsSettings,
    '/settings/diagnostics': loadDiagnosticsSettings,
    '/settings/about': loadAboutSettings
}

export function preloadSettingsRoute(value: string): void {
    const pathname = value.split(/[?#]/, 1)[0] || '/settings/general'
    const loader = routeLoaders[pathname] || (pathname === '/settings' ? loadGeneralSettings : null)
    void loadSettingsShell().catch(() => undefined)
    void loader?.().catch(() => undefined)
}
