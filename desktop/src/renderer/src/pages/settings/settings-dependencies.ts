import type { Settings } from '@/lib/settings'

type DependencyState = Partial<Pick<Settings, 'startWithWindows' | 'sidebarCollapsed' | 'assistantTitleAutoRegenerate' | 'assistantTranscriptionEnabled' | 'assistantTranscriptionEngine' | 'assistantBrowserNewTabBackgroundMode' | 'commitAIProvider' | 'gitPullRequestDefaultGuideSource' | 'gitPullRequestGlobalGuide'>>

// Search points at the controlling option without silently enabling a feature.
export function getControllingSettingsTarget(target: string, settings: DependencyState): string | null {
    if (target === 'settings-row-desktop-host-start-hidden' && settings.startWithWindows === false) return 'settings-row-desktop-host-open-at-login'
    if (target === 'settings-row-interface-sidebar-hover-preview' && settings.sidebarCollapsed === false) return 'settings-row-interface-chat-rail'
    if (target === 'settings-row-assistant-defaults-title-refresh-interval' && settings.assistantTitleAutoRegenerate === false) return 'settings-row-assistant-defaults-refresh-chat-titles'
    if (target === 'settings-row-browser-workspace-background-behavior' && settings.assistantBrowserNewTabBackgroundMode === 'off') return 'settings-row-browser-workspace-new-tab-backgrounds'
    if (['settings-row-voice-transcription-transcription-engine', 'settings-row-voice-transcription-chatgpt-transcription', 'settings-row-voice-transcription-browser-dictation'].includes(target)) {
        if (settings.assistantTranscriptionEnabled === false) return 'settings-row-voice-transcription-voice-input'
        if (target.endsWith('chatgpt-transcription') && settings.assistantTranscriptionEngine === 'browser' || target.endsWith('browser-dictation') && settings.assistantTranscriptionEngine === 'codex') return 'settings-row-voice-transcription-transcription-engine'
    }
    if (['settings-row-zyra-chatgpt-commit-model', 'settings-row-zyra-chatgpt-pull-request-model'].includes(target) && settings.commitAIProvider && settings.commitAIProvider !== 'codex') return 'settings-row-providers-default-git-ai-provider'
    if (['settings-row-pull-requests-global-guide-mode', 'settings-row-pull-requests-global-guide', 'settings-row-pull-requests-guide-file'].includes(target)) {
        if (settings.gitPullRequestDefaultGuideSource && settings.gitPullRequestDefaultGuideSource !== 'global') return 'settings-row-pull-requests-default-guide-source'
        if (target.endsWith('-global-guide') && settings.gitPullRequestGlobalGuide?.mode === 'file' || target.endsWith('-guide-file') && settings.gitPullRequestGlobalGuide?.mode === 'text') return 'settings-row-pull-requests-global-guide-mode'
    }
    return null
}
