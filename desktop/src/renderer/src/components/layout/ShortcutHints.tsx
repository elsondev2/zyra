import { useEffect, useMemo, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useCommandPalette } from '@/lib/commandPalette'
import { isShortcutRecording, useShortcutLabel } from '@/lib/keybindings'
import { addOverlayEventListener } from '@/components/ui/native-overlay-portal'
import { COMMANDS, type CommandId } from '@shared/keybindings'

const COMMON: CommandId[] = ['app.search', 'app.actionSearch', 'app.newChat', 'app.settings', 'app.shortcuts']
const BY_CONTEXT: Record<string, CommandId[]> = {
    chat: ['app.composer', 'app.nextChat', 'app.previousChat', 'app.findInChat', 'app.stopTurn', 'app.newProject'],
    files: ['app.searchFiles', 'app.saveFile', 'app.nextWorkspaceTab', 'app.closeWorkspaceTab'],
    browser: ['browser.address', 'browser.newTab', 'browser.closeTab', 'browser.back', 'browser.history', 'browser.downloads', 'browser.screenshot'],
    terminal: ['terminal.new', 'terminal.splitHorizontal', 'terminal.splitVertical', 'terminal.clear', 'terminal.restart', 'terminal.close'],
    review: ['app.review', 'app.toggleInspector', 'app.nextWorkspaceTab', 'app.closeWorkspaceTab'],
    settings: ['app.themeSearch', 'app.usageSearch', 'app.chat'],
    plugins: ['app.chat', 'app.newProject']
}

function activeContext(pathname: string): string {
    if (pathname.startsWith('/settings')) return 'settings'
    if (pathname.startsWith('/plugins')) return 'plugins'
    const focused = document.activeElement
    if (focused?.closest('.xterm')) return 'terminal'
    if (focused?.closest('[data-shortcut-scope="browser"]')) return 'browser'
    const inspector = document.querySelector<HTMLElement>('[data-inspector-workspace]:not([aria-hidden="true"])')
    const kind = inspector?.dataset.inspectorWorkspace
    return kind === 'explorer' ? 'files' : kind === 'browser' ? 'browser' : kind === 'terminal' ? 'terminal' : kind === 'review' ? 'review' : 'chat'
}

/** A passive guide. It never owns focus or consumes a modifier gesture. */
export function ShortcutHints() {
    const location = useLocation()
    const { isOpen: paletteOpen } = useCommandPalette()
    const shortcut = useShortcutLabel()
    const [visible, setVisible] = useState(false)
    const [context, setContext] = useState('chat')

    useEffect(() => {
        let timer: number | null = null
        const cancel = () => {
            if (timer !== null) window.clearTimeout(timer)
            timer = null
            setVisible(false)
        }
        const onDown = (event: KeyboardEvent) => {
            if (paletteOpen || isShortcutRecording() || event.repeat || event.isComposing || event.getModifierState?.('AltGraph')) return
            if (event.key === 'Control' || event.key === 'Alt' || event.key === 'Meta') {
                if (timer !== null) return
                timer = window.setTimeout(() => {
                    timer = null
                    setContext(activeContext(location.pathname))
                    setVisible(true)
                }, 450)
            } else cancel()
        }
        const onUp = (event: KeyboardEvent) => {
            if (event.key === 'Control' || event.key === 'Alt' || event.key === 'Meta') cancel()
        }
        const removeDown = addOverlayEventListener('keydown', onDown)
        const removeUp = addOverlayEventListener('keyup', onUp)
        window.addEventListener('blur', cancel)
        return () => { cancel(); removeDown(); removeUp(); window.removeEventListener('blur', cancel) }
    }, [location.pathname, paletteOpen])

    const rows = useMemo(() => [...new Set([...(BY_CONTEXT[context] || BY_CONTEXT.chat), ...COMMON])]
        .map(id => ({ id, label: COMMANDS.find(command => command.id === id)?.label || id, keys: shortcut(id) }))
        .filter(row => row.keys)
        .slice(0, 8), [context, shortcut])

    if (!visible || paletteOpen || rows.length === 0) return null
    return <aside aria-label={`${context} keyboard shortcuts`} className="pointer-events-none fixed bottom-5 right-5 z-[55] w-[min(270px,calc(100vw-32px))] rounded-lg border border-[var(--surface-divider)] bg-[var(--surface-floating)]/95 p-3 text-sparkle-text shadow-xl backdrop-blur-lg">
        <div className="mb-2 text-[11px] font-medium capitalize text-sparkle-text-muted">{context} shortcuts</div>
        <div className="space-y-1.5">{rows.map(row => <div key={row.id} className="flex items-center justify-between gap-3 text-[11px]"><span className="truncate">{row.label}</span><kbd className="shrink-0 rounded border border-[var(--surface-divider)] px-1.5 py-0.5 font-mono text-[10px] text-sparkle-text-muted">{row.keys.split(' / ')[0]}</kbd></div>)}</div>
        <div className="mt-2 border-t border-[var(--surface-divider)] pt-2 text-[10px] text-sparkle-text-muted">Search has the full command list.</div>
    </aside>
}
