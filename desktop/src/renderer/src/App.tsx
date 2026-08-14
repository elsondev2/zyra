import { createContext, lazy, Suspense, useContext, useEffect, useState, type ReactNode } from 'react'
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import TitleBar from './components/layout/TitleBar'
import { LoadingSpinner } from './components/ui/LoadingState'
import { SettingsProvider, useSettings } from './lib/settings'
import { CommandPaletteProvider } from './lib/commandPalette'
import CommandPalette from './components/CommandPalette'
import LinkHoverStatus from './components/ui/LinkHoverStatus'
import { UpdatePromptCenter } from './components/updates/UpdatePromptCenter'
import { AppUpdatesProvider } from './lib/app-updates'
import { AssistantTitleBarProvider } from './lib/assistant/assistant-title-bar'
import { OnboardingProvider } from './lib/onboarding'
import { OnboardingGate } from './onboarding/OnboardingGate'
import { AssistantRouteShell } from './pages/assistant/AssistantRouteShell'
import {
    ASSISTANT_LEFT_SIDEBAR_WIDTH_STORAGE_KEY,
    resolveStoredAssistantLeftSidebarWidth
} from './pages/assistant/assistant-pane-layout'

const loadAssistantRoute = () => import('./pages/Assistant')
const Assistant = lazy(loadAssistantRoute)
const InstructorVoiceLab = lazy(() => import('./pages/assistant/InstructorVoiceLab'))
const Explorer = lazy(() => import('./pages/Explorer'))
const SettingsShell = lazy(() => import('./pages/settings/SettingsShell'))
const GeneralSettings = lazy(() => import('./pages/Settings'))
const AppearanceSettings = lazy(() => import('./pages/settings/AppearanceSettings'))
const VoiceSettings = lazy(() => import('./pages/settings/VoiceSettings'))
const ConnectionsSettings = lazy(() => import('./pages/settings/ConnectionsSettings'))
const BrowserControlSettings = lazy(() => import('./pages/settings/BrowserControlSettings'))
const FilesEditorSettings = lazy(() => import('./pages/settings/FilesEditorSettings'))
const TerminalRuntimeSettings = lazy(() => import('./pages/settings/TerminalRuntimeSettings'))
const AssistantSettings = lazy(() => import('./pages/settings/AssistantSettings'))
const AccountSettings = lazy(() => import('./pages/settings/AccountSettings'))
const AISettings = lazy(() => import('./pages/settings/AISettings'))
const GitSettings = lazy(() => import('./pages/settings/GitSettings'))
const ProjectsSettings = lazy(() => import('./pages/settings/ProjectsSettings'))
const MemorySettings = lazy(() => import('./pages/settings/MemorySettings'))
const ArchivedChatsSettings = lazy(() => import('./pages/settings/ArchivedChatsSettings'))
const LogsSettings = lazy(() => import('./pages/settings/LogsSettings'))
const AboutSettings = lazy(() => import('./pages/settings/AboutSettings'))

interface TerminalContextType {
    isOpen: boolean
    openTerminal: (tool?: { id: string; category: string; displayName: string } | null, cwd?: string, initialCommand?: string) => void
    closeTerminal: () => void
    contextTool: { id: string; category: string; displayName: string } | null
    terminalCwd: string | null
    terminalCommand: string | null
    activeSessionCount: number
}

const BASE_TERMINAL_CONTEXT: TerminalContextType = {
    isOpen: false,
    openTerminal: () => { },
    closeTerminal: () => { },
    contextTool: null,
    terminalCwd: null,
    terminalCommand: null,
    activeSessionCount: 0
}

const TerminalContext = createContext<TerminalContextType>(BASE_TERMINAL_CONTEXT)

export const useTerminal = () => useContext(TerminalContext)

function PageLoader() {
    return <LoadingSpinner message="Loading..." affectsAppChrome />
}

function AssistantRoute() {
    const { settings } = useSettings()
    const sidebarWidth = resolveStoredAssistantLeftSidebarWidth(
        localStorage.getItem(ASSISTANT_LEFT_SIDEBAR_WIDTH_STORAGE_KEY)
    )

    return (
        <Suspense fallback={(
            <AssistantRouteShell
                sidebarCollapsed={settings.sidebarCollapsed}
                sidebarWidth={sidebarWidth}
                agentInboxEnabled={settings.assistantAgentInboxSidebarEnabled}
            />
        )}>
            <Assistant />
        </Suspense>
    )
}

function MainContent() {
    const { settings } = useSettings()

    useEffect(() => {
        const preload = () => {
            void loadAssistantRoute().catch(() => undefined)
        }
        if (typeof window.requestIdleCallback === 'function') {
            const idleId = window.requestIdleCallback(preload, { timeout: 800 })
            return () => window.cancelIdleCallback(idleId)
        }
        const timerId = window.setTimeout(preload, 120)
        return () => window.clearTimeout(timerId)
    }, [])

    return (
        <main
            className="flex-1 min-h-0 overflow-hidden overflow-x-hidden p-0 theme-adaptive focus:outline-none"
            tabIndex={0}
        >
            <Suspense fallback={<PageLoader />}>
                <Routes>
                    <Route path="/" element={<Navigate to="/assistant" replace />} />
                    <Route path="/assistant" element={<AssistantRoute />} />
                    <Route path="/assistant/instructor" element={<InstructorVoiceLab />} />
                    <Route path="/assistant/*" element={<AssistantRoute />} />
                    <Route path="/settings" element={<SettingsShell />}>
                        <Route index element={<Navigate to="general" replace />} />
                        <Route path="general" element={<GeneralSettings />} />
                        <Route path="appearance" element={<AppearanceSettings />} />
                        <Route path="account" element={<AccountSettings />} />
                        <Route path="assistant" element={<AssistantSettings />} />
                        <Route path="voice" element={<VoiceSettings />} />
                        <Route path="connections" element={<ConnectionsSettings />} />
                        <Route path="browser-control" element={<BrowserControlSettings />} />
                        <Route path="files-editor" element={<FilesEditorSettings />} />
                        <Route path="terminal-runtime" element={<TerminalRuntimeSettings />} />
                        <Route path="providers" element={<AISettings />} />
                        <Route path="source-control" element={<GitSettings />} />
                        <Route path="projects" element={<ProjectsSettings />} />
                        <Route path="memory" element={<MemorySettings />} />
                        <Route path="diagnostics" element={<LogsSettings />} />
                        <Route path="beta" element={<Navigate to="../projects" replace />} />
                        <Route path="archived" element={<ArchivedChatsSettings />} />
                        <Route path="about" element={<AboutSettings />} />
                        <Route path="chat" element={<Navigate to="../assistant" replace />} />
                        <Route path="behavior" element={<Navigate to="../general" replace />} />
                        <Route path="ai" element={<Navigate to="../providers" replace />} />
                        <Route path="git" element={<Navigate to="../source-control" replace />} />
                        <Route path="explorer" element={<Navigate to="../projects" replace />} />
                        <Route path="logs" element={<Navigate to="../diagnostics" replace />} />
                        <Route path="*" element={<Navigate to="general" replace />} />
                    </Route>

                    <Route path="/home" element={<Navigate to="/assistant" replace />} />
                    <Route path="/home/*" element={<Navigate to="/assistant" replace />} />
                    <Route path="/projects" element={<Navigate to="/assistant" replace />} />
                    <Route path="/projects/*" element={<Navigate to="/assistant" replace />} />
                    <Route path="/folder-browse/*" element={<Navigate to="/explorer" replace />} />
                    <Route path="/explorer" element={settings.explorerTabEnabled ? <Explorer /> : <Navigate to="/settings/projects" replace />} />
                    <Route path="/explorer/*" element={settings.explorerTabEnabled ? <Explorer /> : <Navigate to="/settings/projects" replace />} />
                    <Route path="/tasks" element={<Navigate to="/assistant" replace />} />
                    <Route path="/tasks/*" element={<Navigate to="/assistant" replace />} />
                    <Route path="/terminals" element={<Navigate to="/assistant" replace />} />
                    <Route path="/terminals/*" element={<Navigate to="/assistant" replace />} />
                    <Route path="/skills" element={<Navigate to="/assistant" replace />} />
                    <Route path="/quick-open" element={<Navigate to="/assistant" replace />} />
                    <Route path="*" element={<Navigate to="/assistant" replace />} />
                </Routes>
            </Suspense>
        </main>
    )
}

function TerminalContextProvider({ children }: { children: ReactNode }) {
    const { settings } = useSettings()

    const openTerminal: TerminalContextType['openTerminal'] = (_tool, cwd, initialCommand) => {
        if (!cwd) {
            window.alert('Terminal can only be opened from a folder path in Zyra.')
            return
        }

        void window.devscope
            .openInTerminal(cwd, settings.defaultShell, initialCommand)
            .then((result) => {
                if (!result?.success) {
                    window.alert(result?.error || 'Failed to open terminal.')
                }
            })
            .catch((err: any) => {
                window.alert(err?.message || 'Failed to open terminal.')
            })
    }

    return (
        <TerminalContext.Provider value={{ ...BASE_TERMINAL_CONTEXT, openTerminal }}>
            {children}
        </TerminalContext.Provider>
    )
}

function DevLoadingPreviewOverlay() {
    const [visible, setVisible] = useState(false)

    useEffect(() => {
        if (!import.meta.env.DEV) return

        const handleKeyDown = (event: KeyboardEvent) => {
            const isModifier = event.ctrlKey || event.metaKey
            if (!isModifier || !event.shiftKey || event.key.toLowerCase() !== 'l') return
            event.preventDefault()
            setVisible((current) => !current)
        }

        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [])

    if (!import.meta.env.DEV || !visible) return null

    return (
        <div className="fixed bottom-0 left-0 right-0 top-[34px] z-40 bg-sparkle-bg">
            <LoadingSpinner message="Preview loading screen" className="h-full" minHeightClassName="min-h-0" affectsAppChrome />
        </div>
    )
}

function AppContent() {
    const { settings } = useSettings()

    return (
        <div className={`flex h-screen flex-col overflow-hidden bg-sparkle-bg text-sparkle-text ${settings.compactMode ? 'compact-mode' : ''}`}>
            <TitleBar />
            <div className="flex min-h-0 flex-1 pt-[34px]">
                <MainContent />
            </div>
            <DevLoadingPreviewOverlay />
            <LinkHoverStatus />
        </div>
    )
}

function NormalDesktopApp() {
    return (
        <AppUpdatesProvider>
            <CommandPaletteProvider>
                <TerminalContextProvider>
                    <HashRouter>
                        <AssistantTitleBarProvider>
                            <AppContent />
                            <CommandPalette />
                            <UpdatePromptCenter />
                        </AssistantTitleBarProvider>
                    </HashRouter>
                </TerminalContextProvider>
            </CommandPaletteProvider>
        </AppUpdatesProvider>
    )
}

function App() {
    return (
        <SettingsProvider>
            <OnboardingProvider>
                <OnboardingGate>
                    <NormalDesktopApp />
                </OnboardingGate>
            </OnboardingProvider>
        </SettingsProvider>
    )
}

export default App
