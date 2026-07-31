import { createContext, lazy, Suspense, useContext, useEffect, useState, type ReactNode } from 'react'
import { HashRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import TitleBar from './components/layout/TitleBar'
import { LoadingSpinner } from './components/ui/LoadingState'
import { SettingsProvider, useSettings } from './lib/settings'
import { CommandPaletteProvider } from './lib/commandPalette'
import CommandPalette from './components/CommandPalette'
import LinkHoverStatus from './components/ui/LinkHoverStatus'

const Assistant = lazy(() => import('./pages/Assistant'))
const InstructorVoiceLab = lazy(() => import('./pages/assistant/InstructorVoiceLab'))
const Settings = lazy(() => import('./pages/Settings'))
const AssistantExperienceSettings = lazy(() => import('./pages/settings/AssistantExperienceSettings'))
const AssistantAccountSettings = lazy(() => import('./pages/settings/AssistantAccountSettings'))
const AppearanceSettings = lazy(() => import('./pages/settings/AppearanceSettings'))
const ProjectsSettings = lazy(() => import('./pages/settings/ProjectsSettings'))
const BehaviorSettings = lazy(() => import('./pages/settings/BehaviorSettings'))
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
    return <LoadingSpinner message="Loading..." />
}

function MainContent() {
    const location = useLocation()
    const isSettingsRoute = location.pathname.startsWith('/settings')

    return (
        <main
            className={`flex-1 min-h-0 focus:outline-none overflow-x-hidden${isSettingsRoute ? ' overflow-y-auto p-6' : ' overflow-hidden p-0 theme-adaptive'}`}
            tabIndex={0}
        >
            <Suspense fallback={<PageLoader />}>
                <Routes>
                    <Route path="/" element={<Navigate to="/assistant" replace />} />
                    <Route path="/assistant" element={<Assistant />} />
                    <Route path="/assistant/instructor" element={<InstructorVoiceLab />} />
                    <Route path="/assistant/*" element={<Assistant />} />
                    <Route path="/settings" element={<Settings />} />
                    <Route path="/settings/chat" element={<AssistantExperienceSettings />} />
                    <Route path="/settings/assistant" element={<AssistantAccountSettings />} />
                    <Route path="/settings/appearance" element={<AppearanceSettings />} />
                    <Route path="/settings/projects" element={<ProjectsSettings />} />
                    <Route path="/settings/behavior" element={<BehaviorSettings />} />
                    <Route path="/settings/archived" element={<ArchivedChatsSettings />} />
                    <Route path="/settings/logs" element={<LogsSettings />} />
                    <Route path="/settings/about" element={<AboutSettings />} />
                    <Route path="/settings/*" element={<Settings />} />

                    <Route path="/home" element={<Navigate to="/assistant" replace />} />
                    <Route path="/home/*" element={<Navigate to="/assistant" replace />} />
                    <Route path="/projects" element={<Navigate to="/assistant" replace />} />
                    <Route path="/projects/*" element={<Navigate to="/assistant" replace />} />
                    <Route path="/folder-browse/*" element={<Navigate to="/assistant" replace />} />
                    <Route path="/explorer" element={<Navigate to="/assistant" replace />} />
                    <Route path="/explorer/*" element={<Navigate to="/assistant" replace />} />
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
            <LoadingSpinner message="Preview loading screen" className="h-full" minHeightClassName="min-h-0" />
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

function App() {
    return (
        <SettingsProvider>
            <CommandPaletteProvider>
                <TerminalContextProvider>
                    <HashRouter>
                        <AppContent />
                        <CommandPalette />
                    </HashRouter>
                </TerminalContextProvider>
            </CommandPaletteProvider>
        </SettingsProvider>
    )
}

export default App
