import { useMemo } from 'react'
import { useSettings } from '@/lib/settings'
import { cn } from '@/lib/utils'
import {
    ASSISTANT_LEFT_SIDEBAR_WIDTH_STORAGE_KEY,
    resolveStoredAssistantLeftSidebarWidth
} from '@/pages/assistant/assistant-pane-layout'
import { AssistantRouteShell } from '@/pages/assistant/AssistantRouteShell'
import { resolveAppLoadingRoute, type AppLoadingRoute } from './app-loading-route'

const strong = 'bg-[color-mix(in_srgb,var(--color-text)_13%,transparent)]'
const medium = 'bg-[color-mix(in_srgb,var(--color-text)_9%,transparent)]'
const soft = 'bg-[color-mix(in_srgb,var(--color-text)_6%,transparent)]'
const SETTINGS_SIDEBAR_WIDTH_KEY = 'assistant-left-sidebar-width'

function Block({ className }: { className: string }) {
    return <div className={cn('animate-pulse motion-reduce:animate-none', className)} />
}

function readSettingsSidebarWidth() {
    const stored = Number(localStorage.getItem(SETTINGS_SIDEBAR_WIDTH_KEY))
    return Math.max(260, Math.min(420, Math.round(stored || 322)))
}

function SettingsRouteSkeleton({ collapsed }: { collapsed: boolean }) {
    const sidebarWidth = collapsed ? 0 : readSettingsSidebarWidth()
    return (
        <div className="flex h-[calc(100vh-34px)] min-h-0 overflow-hidden bg-[var(--settings-bg,var(--color-bg))]" data-app-route-skeleton="settings" aria-busy="true">
            <aside className="relative h-full shrink-0 overflow-hidden border-r border-[var(--surface-panel-divider)] bg-[var(--surface-sidebar)]" style={{ width: sidebarWidth }} aria-hidden="true">
                <div className="flex h-full w-full flex-col px-2 py-3">
                    <Block className={cn('mx-2 mb-4 h-7 rounded-md', soft)} />
                    {[4, 6, 2, 4].map((count, groupIndex) => (
                        <div key={groupIndex} className="mb-4">
                            <Block className={cn('mb-2 ml-2 h-2 w-16 rounded-full', soft)} />
                            {Array.from({ length: count }).map((_, rowIndex) => (
                                <div key={rowIndex} className={cn('flex h-8 items-center gap-2.5 rounded-md px-2.5', groupIndex === 0 && rowIndex === 0 && 'bg-[var(--surface-active)]')}>
                                    <Block className={cn('size-3.5 rounded-[4px]', medium)} />
                                    <Block className={cn('h-2.5 rounded-full', rowIndex % 3 === 0 ? 'w-24' : rowIndex % 2 === 0 ? 'w-28' : 'w-20', medium)} />
                                </div>
                            ))}
                        </div>
                    ))}
                </div>
            </aside>
            <section className="settings-content-scrollbar min-w-0 flex-1 overflow-hidden bg-[var(--settings-bg,var(--color-bg))]" aria-label="Opening settings">
                <div className="mx-auto w-full max-w-[680px] px-5 pb-16 pt-10 sm:px-10">
                    <Block className={cn('h-6 w-40 rounded-md', strong)} />
                    <Block className={cn('mt-2.5 h-2.5 w-64 rounded-full', soft)} />
                    <div className="mt-10 space-y-9">
                        {[0, 1, 2].map((section) => (
                            <div key={section}>
                                <Block className={cn('mb-3 h-3 w-24 rounded-full', medium)} />
                                <div className="overflow-hidden rounded-xl border border-[var(--settings-border,var(--surface-divider))] bg-[var(--settings-section,var(--surface-panel))]">
                                    {Array.from({ length: section === 1 ? 2 : 3 }).map((_, row) => (
                                        <div key={row} className="flex h-[66px] items-center gap-5 border-b border-[var(--surface-divider)] px-4 last:border-b-0">
                                            <div className="min-w-0 flex-1">
                                                <Block className={cn('h-2.5 rounded-full', row % 2 ? 'w-32' : 'w-40', medium)} />
                                                <Block className={cn('mt-2 h-2 rounded-full', row % 2 ? 'w-52' : 'w-64', soft)} />
                                            </div>
                                            <Block className={cn('h-7 w-20 rounded-md', soft)} />
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </section>
            <span className="sr-only">Opening settings</span>
        </div>
    )
}

function VoiceRouteSkeleton() {
    return (
        <div className="relative flex h-[calc(100vh-34px)] min-h-0 flex-col overflow-hidden bg-sparkle-bg" data-app-route-skeleton="voice" aria-busy="true">
            <header className="grid h-[72px] shrink-0 grid-cols-[88px_minmax(0,1fr)_88px] items-center px-5" aria-hidden="true">
                <Block className={cn('size-9 rounded-md', soft)} />
                <div className="justify-self-center">
                    <Block className={cn('h-3 w-20 rounded-full', strong)} />
                    <Block className={cn('mx-auto mt-2 h-2 w-28 rounded-full', soft)} />
                </div>
                <div className="flex justify-self-end gap-1">
                    <Block className={cn('size-9 rounded-md', soft)} />
                    <Block className={cn('size-9 rounded-md', soft)} />
                </div>
            </header>
            <div className="flex min-h-0 flex-1 items-center justify-center pb-24">
                <div className="relative flex size-[min(38vw,330px)] items-center justify-center rounded-full border border-[var(--surface-divider)]">
                    <Block className={cn('size-[72%] rounded-full', soft)} />
                    <div className="absolute inset-[23%] rounded-full border border-[color-mix(in_srgb,var(--color-text)_9%,transparent)]" />
                </div>
            </div>
            <div className="absolute inset-x-0 bottom-5 flex justify-center px-5">
                <div className="flex h-[76px] w-full max-w-[720px] items-center gap-3 rounded-[18px] border border-[var(--surface-divider)] bg-[var(--surface-panel)] px-4">
                    <Block className={cn('size-9 rounded-full', soft)} />
                    <Block className={cn('h-2.5 flex-1 rounded-full', soft)} />
                    <Block className={cn('size-10 rounded-full', medium)} />
                </div>
            </div>
            <span className="sr-only">Opening Voice Lab</span>
        </div>
    )
}

function AssistantUtilityRouteSkeleton() {
    return (
        <div className="flex h-screen flex-col overflow-hidden bg-sparkle-bg text-sparkle-text" data-app-route-skeleton="assistant-utility" aria-busy="true">
            <div className="flex h-[34px] shrink-0 items-center border-b border-[var(--surface-panel-divider)] bg-[var(--surface-inspector)] px-3">
                <Block className={cn('h-2.5 w-16 rounded-full', medium)} />
                <Block className={cn('ml-5 h-2.5 w-44 rounded-full', strong)} />
            </div>
            <div className="flex h-9 shrink-0 items-center gap-1 border-b border-[var(--surface-panel-divider)] bg-[var(--surface-inspector)] px-2">
                <Block className={cn('h-6 w-24 rounded-md', medium)} />
                <Block className={cn('h-6 w-20 rounded-md', soft)} />
                <Block className={cn('h-6 w-20 rounded-md', soft)} />
            </div>
            <div className="flex min-h-0 flex-1">
                <div className="w-[30%] border-r border-[var(--surface-divider)] p-3">
                    <Block className={cn('h-8 w-full rounded-md', soft)} />
                    {Array.from({ length: 12 }).map((_, index) => <Block key={index} className={cn('mt-2 h-6 rounded-md', index % 3 ? soft : medium)} />)}
                </div>
                <div className="min-w-0 flex-1 p-5">
                    <Block className={cn('h-3 w-44 rounded-full', strong)} />
                    {Array.from({ length: 10 }).map((_, index) => <Block key={index} className={cn('mt-3 h-2.5 rounded-full', index % 4 === 3 ? 'w-2/3' : 'w-full', soft)} />)}
                </div>
            </div>
            <span className="sr-only">Opening workspace</span>
        </div>
    )
}

function BrowserPopupRouteSkeleton() {
    return (
        <div className="flex h-screen flex-col overflow-hidden bg-sparkle-bg text-sparkle-text" data-app-route-skeleton="browser-popup" aria-busy="true">
            <div className="flex h-9 shrink-0 items-center gap-2 border-b border-[var(--surface-panel-divider)] bg-[var(--surface-inspector)] px-2">
                <Block className={cn('h-6 w-32 rounded-md', medium)} />
                <Block className={cn('ml-auto size-5 rounded-md', soft)} />
                <Block className={cn('size-5 rounded-md', soft)} />
            </div>
            <div className="flex h-10 shrink-0 items-center gap-2 border-b border-[var(--surface-divider)] bg-[var(--surface-panel)] px-2.5">
                <Block className={cn('size-5 rounded-full', soft)} />
                <Block className={cn('size-5 rounded-full', soft)} />
                <Block className={cn('h-7 min-w-0 flex-1 rounded-full', medium)} />
                <Block className={cn('size-5 rounded-full', soft)} />
            </div>
            <div className="min-h-0 flex-1 bg-[var(--color-bg)]" />
            <span className="sr-only">Opening browser</span>
        </div>
    )
}

export function AppRouteSkeleton({ pathname }: { pathname: string }) {
    const { settings } = useSettings()
    const route = resolveAppLoadingRoute(pathname)
    if (route === 'settings') return <SettingsRouteSkeleton collapsed={settings.sidebarCollapsed} />
    if (route === 'voice') return <VoiceRouteSkeleton />
    if (route === 'assistant-utility') return <AssistantUtilityRouteSkeleton />
    if (route === 'browser-popup') return <BrowserPopupRouteSkeleton />

    const sidebarWidth = resolveStoredAssistantLeftSidebarWidth(localStorage.getItem(ASSISTANT_LEFT_SIDEBAR_WIDTH_STORAGE_KEY))
    return (
        <AssistantRouteShell
            sidebarCollapsed={settings.sidebarCollapsed}
            sidebarWidth={sidebarWidth}
            agentInboxEnabled={settings.assistantAgentInboxSidebarEnabled}
        />
    )
}

function BootTitleBar({ route }: { route: AppLoadingRoute }) {
    const { settings } = useSettings()
    const assistantWidth = resolveStoredAssistantLeftSidebarWidth(localStorage.getItem(ASSISTANT_LEFT_SIDEBAR_WIDTH_STORAGE_KEY))
    const leftWidth = route === 'settings'
        ? settings.sidebarCollapsed ? 112 : readSettingsSidebarWidth()
        : route === 'assistant'
            ? settings.sidebarCollapsed ? 112 : assistantWidth
            : 112
    const routeLineWidth = route === 'settings' ? 'w-36' : route === 'voice' ? 'w-24' : 'w-52'

    return (
        <div className="zyra-topbar-surface fixed inset-x-0 top-0 z-50 flex h-[34px] items-center border-b border-[var(--surface-panel-divider)] text-sparkle-text" aria-hidden="true">
            <div className="flex h-full shrink-0 items-center gap-2 border-r border-[var(--surface-panel-divider)] px-3" style={{ width: leftWidth }}>
                <Block className={cn('size-3 rounded-[3px]', medium)} />
                <span className="text-[11px] font-semibold text-sparkle-text-secondary">Zyra</span>
            </div>
            <div className="flex min-w-0 flex-1 items-center gap-2 px-3">
                <Block className={cn('h-2.5 rounded-full', routeLineWidth, strong)} />
                <Block className={cn('h-4 w-14 rounded-full', soft)} />
            </div>
            <div className="flex h-full shrink-0 items-center gap-5 px-4">
                <Block className={cn('h-px w-3', medium)} />
                <Block className={cn('size-2.5 rounded-[2px]', medium)} />
                <Block className={cn('size-2.5 rounded-[2px]', medium)} />
            </div>
        </div>
    )
}

export function AppBootSkeleton() {
    const { settings } = useSettings()
    const route = useMemo(() => resolveAppLoadingRoute(window.location.hash), [])
    if (route === 'assistant-utility' || route === 'browser-popup') {
        return <AppRouteSkeleton pathname={window.location.hash} />
    }
    return (
        <div className={cn('flex h-screen flex-col overflow-hidden bg-sparkle-bg text-sparkle-text', settings.compactMode && 'compact-mode')} data-app-boot-skeleton={route}>
            <BootTitleBar route={route} />
            <div className="flex min-h-0 flex-1 pt-[34px]">
                <main className="min-h-0 min-w-0 flex-1 overflow-hidden">
                    <AppRouteSkeleton pathname={window.location.hash} />
                </main>
            </div>
        </div>
    )
}
