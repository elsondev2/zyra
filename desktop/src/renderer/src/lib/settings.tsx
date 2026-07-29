/**
 * Zyra - Settings Store & Context
 * Manages all app settings with localStorage persistence
 */

import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import { dispatchZyraThemeChanged } from './theme-events'
import type { AssistantReasoningEffort } from '@shared/assistant/contracts'
import {
    loadLegacyAssistantComposerDefaults,
    sanitizeAssistantDefaultEffort,
    sanitizeAssistantDefaultInteractionMode,
    sanitizeAssistantDefaultRuntimeMode
} from './settings-assistant-defaults'
import { getThemeDefinition, isDarkThemeId, isThemeId, THEME_CLASS_IDS, THEMES, type DarkTheme, type Theme } from './settings-theme-catalog'

export { THEMES, type DarkTheme, type Theme } from './settings-theme-catalog'
export {
    getAssistantBusyMessageModeLabel,
    getAssistantDefaultEffortLabel,
    getAssistantDefaultInteractionModeLabel,
    getAssistantDefaultRuntimeModeLabel,
    getAssistantDefaultSpeedLabel,
    getAssistantDefaultsPreview
} from './settings-assistant-defaults'

// Settings Types
export type Shell = 'powershell' | 'cmd'
export type CommitAIProvider = 'groq' | 'gemini' | 'codex'
export type ScrollMode = 'smooth' | 'native'
export type BrowserViewMode = 'grid' | 'finder'
export type BrowserContentLayout = 'grouped' | 'explorer'
export type GitBulkActionScope = 'project' | 'repo'
export type FilePreviewDefaultMode = 'preview' | 'edit'
export type FilePreviewPythonRunMode = 'terminal' | 'output'
export type FilePreviewExplorerNameLayout = 'wrap' | 'horizontal'
export type PackageRuntimePreference = 'auto' | 'node' | 'npm' | 'pnpm' | 'yarn' | 'bun'
export type PullRequestGuideSource = 'project' | 'global' | 'repo-template' | 'none'
export type PullRequestGuideMode = 'text' | 'file'
export type PullRequestChangeSource = 'unstaged' | 'staged' | 'local-commits' | 'all-local-work'
export type AssistantUsageDisplayMode = 'remaining' | 'used'
export type AssistantTextStreamingMode = 'stream' | 'chunks'
export type AssistantToolOutputDefaultMode = 'expanded' | 'minimized'
export type AssistantDefaultRuntimeMode = 'approval-required' | 'full-access'
export type AssistantDefaultInteractionMode = 'default' | 'plan'
export type AssistantDefaultEffort = AssistantReasoningEffort
export type AssistantTranscriptionEngine = 'browser' | 'vosk'
export type AssistantBusyMessageMode = 'queue' | 'force'
// Kept dormant until Appearance settings exposes the classic/workspace inspector choice.

export interface PullRequestGuideConfig {
    mode: PullRequestGuideMode
    text: string
    filePath: string
}

export interface ProjectPullRequestConfig {
    guideSource: PullRequestGuideSource
    guide: PullRequestGuideConfig
    targetBranch: string
    draft: boolean
    changeSource: PullRequestChangeSource
}

export interface AccentColor {
    name: string
    primary: string
    secondary: string
}

export const ACCENT_COLORS: AccentColor[] = [
    { name: 'Blue', primary: '#3b82f6', secondary: '#60a5fa' },
    { name: 'Purple', primary: '#8b5cf6', secondary: '#a78bfa' },
    { name: 'Pink', primary: '#ec4899', secondary: '#f472b6' },
    { name: 'Green', primary: '#22c55e', secondary: '#4ade80' },
    { name: 'Orange', primary: '#f97316', secondary: '#fb923c' },
    { name: 'Cyan', primary: '#06b6d4', secondary: '#22d3ee' },
    { name: 'Red', primary: '#ef4444', secondary: '#f87171' },
    { name: 'Yellow', primary: '#eab308', secondary: '#facc15' },
    { name: 'Teal', primary: '#14b8a6', secondary: '#2dd4bf' },
    { name: 'Indigo', primary: '#6366f1', secondary: '#818cf8' },
    { name: 'Rose', primary: '#f43f5e', secondary: '#fb7185' },
    { name: 'Emerald', primary: '#10b981', secondary: '#34d399' },
    { name: 'Violet', primary: '#7c3aed', secondary: '#a78bfa' },
    { name: 'Amber', primary: '#f59e0b', secondary: '#fbbf24' },
    { name: 'Lime', primary: '#84cc16', secondary: '#a3e635' },
    { name: 'Sky', primary: '#0ea5e9', secondary: '#38bdf8' }
]

export interface Settings {
    theme: Theme
    lastDarkTheme: DarkTheme
    accentColor: AccentColor
    compactMode: boolean
    sidebarCollapsed: boolean
    betaSettingsEnabled: boolean
    explorerTabEnabled: boolean
    explorerHomePath: string
    defaultShell: Shell
    startMinimized: boolean
    startWithWindows: boolean
    scrollMode: ScrollMode
    browserViewMode: BrowserViewMode
    browserContentLayout: BrowserContentLayout
    filePreviewOpenInFullscreen: boolean
    filePreviewFullscreenShowLeftPanel: boolean
    filePreviewFullscreenShowRightPanel: boolean
    filePreviewDefaultMode: FilePreviewDefaultMode
    filePreviewPythonRunMode: FilePreviewPythonRunMode
    filePreviewExplorerNameLayout: FilePreviewExplorerNameLayout
    packageRuntimePreference: PackageRuntimePreference
    filePreviewTerminalPanelHeight: number
    projectsFolder: string
    additionalFolders: string[]
    gitAutoRefreshOnProjectOpen: boolean
    gitInitDefaultBranch: string
    gitInitCreateGitignore: boolean
    gitInitCreateInitialCommit: boolean
    gitWarnOnAuthorMismatch: boolean
    gitConfirmPartialPushRange: boolean
    gitBulkActionScope: GitBulkActionScope
    gitPullRequestGlobalGuide: PullRequestGuideConfig
    gitPullRequestDefaultGuideSource: PullRequestGuideSource
    gitPullRequestDefaultTargetBranch: string
    gitPullRequestDefaultDraft: boolean
    gitPullRequestDefaultChangeSource: PullRequestChangeSource
    gitProjectPullRequestConfigs: Record<string, ProjectPullRequestConfig>
    gitAutoCreateBranchWhenTargetMatches: boolean
    groqApiKey: string
    geminiApiKey: string
    gitCommitCodexModel: string
    gitPullRequestCodexModel: string
    commitAIProvider: CommitAIProvider
    assistantUsageDisplayMode: AssistantUsageDisplayMode
    assistantTextStreamingMode: AssistantTextStreamingMode
    assistantToolOutputDefaultMode: AssistantToolOutputDefaultMode
    assistantDefaultModel: string
    assistantDefaultPromptTemplate: string
    assistantDefaultRuntimeMode: AssistantDefaultRuntimeMode
    assistantDefaultInteractionMode: AssistantDefaultInteractionMode
    assistantDefaultEffort: AssistantDefaultEffort
    assistantDefaultFastMode: boolean
    assistantBusyMessageMode: AssistantBusyMessageMode
    assistantPlaygroundTerminalAccessDefault: boolean
    assistantTranscriptionEnabled: boolean
    assistantTranscriptionEngine: AssistantTranscriptionEngine
}

const DEFAULT_SETTINGS: Settings = {
    theme: 'dark',
    lastDarkTheme: 'dark',
    accentColor: ACCENT_COLORS[0],
    compactMode: false,
    sidebarCollapsed: false,
    betaSettingsEnabled: false,
    explorerTabEnabled: false,
    explorerHomePath: '',
    defaultShell: 'powershell',
    startMinimized: false,
    startWithWindows: false,
    scrollMode: 'smooth',
    browserViewMode: 'finder',
    browserContentLayout: 'explorer',
    filePreviewOpenInFullscreen: false,
    filePreviewFullscreenShowLeftPanel: true,
    filePreviewFullscreenShowRightPanel: false,
    filePreviewDefaultMode: 'preview',
    filePreviewPythonRunMode: 'terminal',
    filePreviewExplorerNameLayout: 'wrap',
    packageRuntimePreference: 'auto',
    filePreviewTerminalPanelHeight: 220,
    projectsFolder: '',
    additionalFolders: [],
    gitAutoRefreshOnProjectOpen: true,
    gitInitDefaultBranch: 'main',
    gitInitCreateGitignore: true,
    gitInitCreateInitialCommit: false,
    gitWarnOnAuthorMismatch: true,
    gitConfirmPartialPushRange: true,
    gitBulkActionScope: 'repo',
    gitPullRequestGlobalGuide: {
        mode: 'text',
        text: '',
        filePath: ''
    },
    gitPullRequestDefaultGuideSource: 'global',
    gitPullRequestDefaultTargetBranch: 'main',
    gitPullRequestDefaultDraft: true,
    gitPullRequestDefaultChangeSource: 'all-local-work',
    gitProjectPullRequestConfigs: {},
    gitAutoCreateBranchWhenTargetMatches: false,
    groqApiKey: '',
    geminiApiKey: '',
    gitCommitCodexModel: '',
    gitPullRequestCodexModel: '',
    commitAIProvider: 'groq',
    assistantUsageDisplayMode: 'remaining',
    assistantTextStreamingMode: 'stream',
    assistantToolOutputDefaultMode: 'expanded',
    assistantDefaultModel: '',
    assistantDefaultPromptTemplate: '',
    assistantDefaultRuntimeMode: 'approval-required',
    assistantDefaultInteractionMode: 'default',
    assistantDefaultEffort: 'medium',
    assistantDefaultFastMode: false,
    assistantBusyMessageMode: 'queue',
    assistantPlaygroundTerminalAccessDefault: false,
    assistantTranscriptionEnabled: false,
    assistantTranscriptionEngine: 'browser'
}

const STORAGE_KEY = 'devscope-settings'
const LEGACY_ASSISTANT_COMPOSER_PREFERENCES_STORAGE_KEY = 'devscope:assistant-composer-preferences'

function sanitizePullRequestGuideConfig(value: unknown): PullRequestGuideConfig {
    const candidate = typeof value === 'object' && value !== null ? value as Partial<PullRequestGuideConfig> : {}
    return {
        mode: candidate.mode === 'file' ? 'file' : 'text',
        text: typeof candidate.text === 'string' ? candidate.text : '',
        filePath: typeof candidate.filePath === 'string' ? candidate.filePath : ''
    }
}

function sanitizePullRequestChangeSource(value: unknown, fallback: PullRequestChangeSource): PullRequestChangeSource {
    if (value === 'unstaged' || value === 'staged' || value === 'local-commits' || value === 'all-local-work') {
        return value
    }
    if (value === 'selected-commits') return 'local-commits'
    if (value === 'all-ready') return 'all-local-work'
    return fallback
}

function sanitizeProjectPullRequestConfig(value: unknown, defaults: Settings): ProjectPullRequestConfig {
    const candidate = typeof value === 'object' && value !== null ? value as Partial<ProjectPullRequestConfig> : {}
    return {
        guideSource: candidate.guideSource === 'project' || candidate.guideSource === 'repo-template' || candidate.guideSource === 'none'
            ? candidate.guideSource
            : 'global',
        guide: sanitizePullRequestGuideConfig(candidate.guide),
        targetBranch: typeof candidate.targetBranch === 'string' && candidate.targetBranch.trim()
            ? candidate.targetBranch.trim()
            : defaults.gitPullRequestDefaultTargetBranch,
        draft: candidate.draft !== false,
        changeSource: sanitizePullRequestChangeSource(
            (candidate as Partial<ProjectPullRequestConfig> & { scope?: unknown }).changeSource
                ?? (candidate as Partial<ProjectPullRequestConfig> & { scope?: unknown }).scope,
            defaults.gitPullRequestDefaultChangeSource
        )
    }
}

function loadSettings(): Settings {
    try {
        const legacyAssistantDefaults = loadLegacyAssistantComposerDefaults(
            LEGACY_ASSISTANT_COMPOSER_PREFERENCES_STORAGE_KEY,
            DEFAULT_SETTINGS
        )
        const stored = localStorage.getItem(STORAGE_KEY)
        if (stored) {
            const parsed = JSON.parse(stored)
            const candidate = { ...DEFAULT_SETTINGS, ...legacyAssistantDefaults, ...parsed }
            const legacyCodexModel = typeof candidate.codexModel === 'string' ? candidate.codexModel.trim() : ''
            const theme = isThemeId(candidate.theme) ? candidate.theme : DEFAULT_SETTINGS.theme
            const lastDarkTheme = isDarkThemeId(candidate.lastDarkTheme)
                ? candidate.lastDarkTheme
                : isDarkThemeId(theme)
                    ? theme
                    : DEFAULT_SETTINGS.lastDarkTheme
            const gitCommitCodexModel = typeof candidate.gitCommitCodexModel === 'string'
                ? candidate.gitCommitCodexModel.trim()
                : legacyCodexModel
            const gitPullRequestCodexModel = typeof candidate.gitPullRequestCodexModel === 'string'
                ? candidate.gitPullRequestCodexModel.trim()
                : legacyCodexModel

            return {
                theme,
                lastDarkTheme,
                accentColor: candidate.accentColor,
                compactMode: candidate.compactMode,
                sidebarCollapsed: candidate.sidebarCollapsed,
                betaSettingsEnabled: candidate.betaSettingsEnabled === true,
                explorerTabEnabled: candidate.explorerTabEnabled === true,
                explorerHomePath: typeof candidate.explorerHomePath === 'string' ? candidate.explorerHomePath : '',
                defaultShell: candidate.defaultShell,
                startMinimized: candidate.startMinimized,
                startWithWindows: candidate.startWithWindows,
                scrollMode: candidate.scrollMode === 'native' ? 'native' : 'smooth',
                browserViewMode: candidate.browserViewMode === 'finder' ? 'finder' : 'grid',
                browserContentLayout: candidate.browserContentLayout === 'explorer' ? 'explorer' : 'grouped',
                filePreviewOpenInFullscreen: !!candidate.filePreviewOpenInFullscreen,
                filePreviewFullscreenShowLeftPanel: candidate.filePreviewFullscreenShowLeftPanel !== false,
                filePreviewFullscreenShowRightPanel: !!candidate.filePreviewFullscreenShowRightPanel,
                filePreviewDefaultMode: candidate.filePreviewDefaultMode === 'edit' ? 'edit' : 'preview',
                filePreviewPythonRunMode: candidate.filePreviewPythonRunMode === 'output' ? 'output' : 'terminal',
                filePreviewExplorerNameLayout: candidate.filePreviewExplorerNameLayout === 'horizontal' ? 'horizontal' : 'wrap',
                packageRuntimePreference:
                    candidate.packageRuntimePreference === 'npm'
                    || candidate.packageRuntimePreference === 'node'
                    || candidate.packageRuntimePreference === 'pnpm'
                    || candidate.packageRuntimePreference === 'yarn'
                    || candidate.packageRuntimePreference === 'bun'
                        ? candidate.packageRuntimePreference
                        : 'auto',
                filePreviewTerminalPanelHeight: Number.isFinite(Number(candidate.filePreviewTerminalPanelHeight))
                    ? Math.max(140, Math.min(720, Math.round(Number(candidate.filePreviewTerminalPanelHeight))))
                    : 220,
                projectsFolder: candidate.projectsFolder,
                additionalFolders: candidate.additionalFolders,
                gitAutoRefreshOnProjectOpen: candidate.gitAutoRefreshOnProjectOpen !== false,
                gitInitDefaultBranch: typeof candidate.gitInitDefaultBranch === 'string' && candidate.gitInitDefaultBranch.trim()
                    ? candidate.gitInitDefaultBranch.trim()
                    : 'main',
                gitInitCreateGitignore: candidate.gitInitCreateGitignore !== false,
                gitInitCreateInitialCommit: !!candidate.gitInitCreateInitialCommit,
                gitWarnOnAuthorMismatch: candidate.gitWarnOnAuthorMismatch !== false,
                gitConfirmPartialPushRange: candidate.gitConfirmPartialPushRange !== false,
                gitBulkActionScope: candidate.gitBulkActionScope === 'project' ? 'project' : 'repo',
                gitPullRequestGlobalGuide: sanitizePullRequestGuideConfig(candidate.gitPullRequestGlobalGuide),
                gitPullRequestDefaultGuideSource:
                    candidate.gitPullRequestDefaultGuideSource === 'project'
                    || candidate.gitPullRequestDefaultGuideSource === 'repo-template'
                    || candidate.gitPullRequestDefaultGuideSource === 'none'
                        ? candidate.gitPullRequestDefaultGuideSource
                        : 'global',
                gitPullRequestDefaultTargetBranch: typeof candidate.gitPullRequestDefaultTargetBranch === 'string' && candidate.gitPullRequestDefaultTargetBranch.trim()
                    ? candidate.gitPullRequestDefaultTargetBranch.trim()
                    : DEFAULT_SETTINGS.gitPullRequestDefaultTargetBranch,
                gitPullRequestDefaultDraft: candidate.gitPullRequestDefaultDraft !== false,
                gitPullRequestDefaultChangeSource: sanitizePullRequestChangeSource(
                    candidate.gitPullRequestDefaultChangeSource ?? candidate.gitPullRequestDefaultScope,
                    DEFAULT_SETTINGS.gitPullRequestDefaultChangeSource
                ),
                gitProjectPullRequestConfigs: Object.fromEntries(
                    Object.entries(
                        typeof candidate.gitProjectPullRequestConfigs === 'object' && candidate.gitProjectPullRequestConfigs !== null
                            ? candidate.gitProjectPullRequestConfigs as Record<string, unknown>
                            : {}
                    ).map(([projectPath, config]) => [
                        projectPath,
                        sanitizeProjectPullRequestConfig(config, DEFAULT_SETTINGS)
                    ])
                ),
                gitAutoCreateBranchWhenTargetMatches: candidate.gitAutoCreateBranchWhenTargetMatches === true,
                groqApiKey: candidate.groqApiKey,
                geminiApiKey: candidate.geminiApiKey,
                gitCommitCodexModel,
                gitPullRequestCodexModel,
                commitAIProvider: candidate.commitAIProvider === 'gemini' || candidate.commitAIProvider === 'codex' ? candidate.commitAIProvider : 'groq',
                assistantUsageDisplayMode: candidate.assistantUsageDisplayMode === 'used' ? 'used' : 'remaining',
                assistantTextStreamingMode: candidate.assistantTextStreamingMode === 'chunks' ? 'chunks' : 'stream',
                assistantToolOutputDefaultMode: candidate.assistantToolOutputDefaultMode === 'minimized' ? 'minimized' : 'expanded',
                assistantDefaultModel: typeof candidate.assistantDefaultModel === 'string' ? candidate.assistantDefaultModel.trim() : '',
                assistantDefaultPromptTemplate: typeof candidate.assistantDefaultPromptTemplate === 'string'
                    ? candidate.assistantDefaultPromptTemplate
                    : '',
                assistantDefaultRuntimeMode: sanitizeAssistantDefaultRuntimeMode(candidate.assistantDefaultRuntimeMode),
                assistantDefaultInteractionMode: sanitizeAssistantDefaultInteractionMode(candidate.assistantDefaultInteractionMode),
                assistantDefaultEffort: sanitizeAssistantDefaultEffort(candidate.assistantDefaultEffort),
                assistantDefaultFastMode: !!candidate.assistantDefaultFastMode,
                assistantBusyMessageMode: candidate.assistantBusyMessageMode === 'force' ? 'force' : 'queue',
                assistantPlaygroundTerminalAccessDefault: candidate.assistantPlaygroundTerminalAccessDefault === true,
                assistantTranscriptionEnabled: candidate.assistantTranscriptionEnabled === true,
                assistantTranscriptionEngine: candidate.assistantTranscriptionEngine === 'vosk' ? 'vosk' : 'browser'
            }
        }
    } catch (e) {
        console.error('Failed to load settings:', e)
    }
    return {
        ...DEFAULT_SETTINGS,
        ...loadLegacyAssistantComposerDefaults(LEGACY_ASSISTANT_COMPOSER_PREFERENCES_STORAGE_KEY, DEFAULT_SETTINGS)
    }
}

function saveSettings(settings: Settings): void {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
    } catch (e) {
        console.error('Failed to save settings:', e)
    }
}

interface SettingsContextType {
    settings: Settings
    updateSettings: (partial: Partial<Settings>) => void
    resetSettings: () => void
    clearCache: () => void
}

const SettingsContext = createContext<SettingsContextType | null>(null)

export function SettingsProvider({ children }: { children: ReactNode }) {
    const [settings, setSettings] = useState<Settings>(loadSettings)

    useEffect(() => {
        applyTheme(settings.theme)
    }, [settings.theme])

    useEffect(() => {
        applyAccentColor(settings.accentColor)
    }, [settings.accentColor])

    useEffect(() => {
        if (settings.compactMode) {
            document.body.classList.add('compact-mode')
        } else {
            document.body.classList.remove('compact-mode')
        }
    }, [settings.compactMode])

    useEffect(() => {
        saveSettings(settings)
    }, [settings])

    const updateSettings = (partial: Partial<Settings>) => {
        setSettings((prev) => {
            const nextTheme = partial.theme ?? prev.theme
            const nextLastDarkTheme = isDarkThemeId(partial.lastDarkTheme)
                ? partial.lastDarkTheme
                : isDarkThemeId(nextTheme)
                    ? nextTheme
                    : prev.lastDarkTheme

            return {
                ...prev,
                ...partial,
                theme: nextTheme,
                lastDarkTheme: nextLastDarkTheme
            }
        })
    }

    const resetSettings = () => {
        setSettings(DEFAULT_SETTINGS)
        localStorage.removeItem(STORAGE_KEY)
    }

    const clearCache = () => {
        const keysToRemove: string[] = []
        for (let index = 0; index < localStorage.length; index += 1) {
            const key = localStorage.key(index)
            if (key && key.startsWith('devscope-') && key !== STORAGE_KEY) {
                keysToRemove.push(key)
            }
        }
        keysToRemove.forEach((key) => localStorage.removeItem(key))
        window.dispatchEvent(new CustomEvent('devscope:cache-cleared'))
    }

    return (
        <SettingsContext.Provider value={{ settings, updateSettings, resetSettings, clearCache }}>
            {children}
        </SettingsContext.Provider>
    )
}

export function useSettings() {
    const context = useContext(SettingsContext)
    if (!context) {
        throw new Error('useSettings must be used within a SettingsProvider')
    }
    return context
}

function applyTheme(theme: Theme) {
    const themeDefinition = getThemeDefinition(theme)
    document.body.classList.remove(...THEME_CLASS_IDS)
    if (theme !== 'dark') {
        document.body.classList.add(theme)
    }

    const root = document.documentElement
    root.style.setProperty('--color-bg', themeDefinition.tokens.bg)
    root.style.setProperty('--color-text', themeDefinition.tokens.text)
    root.style.setProperty('--color-text-dark', themeDefinition.tokens.textDark)
    root.style.setProperty('--color-text-darker', themeDefinition.tokens.textDarker)
    root.style.setProperty('--color-text-secondary', themeDefinition.tokens.textSecondary)
    root.style.setProperty('--color-text-muted', themeDefinition.tokens.textMuted)
    root.style.setProperty('--color-card', themeDefinition.tokens.card)
    root.style.setProperty('--color-border', themeDefinition.tokens.border)
    root.style.setProperty('--color-border-secondary', themeDefinition.tokens.borderSecondary)
    root.style.setProperty('--color-primary', themeDefinition.tokens.primary)
    root.style.setProperty('--color-secondary', themeDefinition.tokens.secondary)
    root.style.setProperty('--color-accent', themeDefinition.tokens.accent)
    dispatchZyraThemeChanged()
}

function applyAccentColor(accent: AccentColor) {
    document.documentElement.style.setProperty('--accent-primary', accent.primary)
    document.documentElement.style.setProperty('--accent-secondary', accent.secondary)
}
