import { Check, ChevronDown, Link2, RotateCw, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { TRANSIENT_MENU_DISMISS_EVENT } from '@/lib/transient-menu'
import { cn } from '@/lib/utils'
import {
    ASSISTANT_BROWSER_VIEWPORT_PRESETS,
    normalizeAssistantBrowserViewportDimension,
    type AssistantBrowserViewportSetting
} from './assistant-browser-workspace-state'
import { clampAssistantBrowserViewportSize } from './assistant-browser-viewport-layout'

const TOOLBAR_BUTTON = 'inline-flex size-6 shrink-0 items-center justify-center rounded-md text-sparkle-text-muted/65 transition-colors hover:bg-[var(--surface-hover)] hover:text-sparkle-text focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent-primary)]/50 disabled:pointer-events-none disabled:opacity-30 motion-reduce:transition-none'
const CATEGORIES = ['Phone', 'Tablet'] as const

export function AssistantBrowserDeviceToolbar({
    viewport,
    onViewportChange,
    onClose
}: {
    viewport: Exclude<AssistantBrowserViewportSetting, { mode: 'fill' }>
    onViewportChange: (viewport: AssistantBrowserViewportSetting) => void
    onClose: () => void
}) {
    const [width, setWidth] = useState(String(viewport.width))
    const [height, setHeight] = useState(String(viewport.height))
    const [deviceMenuOpen, setDeviceMenuOpen] = useState(false)
    const deviceMenuRef = useRef<HTMLDivElement | null>(null)
    const activePreset = useMemo(() => viewport.mode === 'preset'
        ? ASSISTANT_BROWSER_VIEWPORT_PRESETS.find((entry) => entry.id === viewport.presetId) || null
        : null, [viewport])

    useEffect(() => {
        setWidth(String(viewport.width))
        setHeight(String(viewport.height))
    }, [viewport.height, viewport.width])

    useEffect(() => {
        if (!deviceMenuOpen) return
        const dismissDeviceMenu = () => setDeviceMenuOpen(false)
        const closeOnOutsidePointer = (event: PointerEvent) => {
            if (event.target instanceof Node && deviceMenuRef.current?.contains(event.target)) return
            dismissDeviceMenu()
        }
        const closeOnEscape = (event: KeyboardEvent) => {
            if (event.key === 'Escape') dismissDeviceMenu()
        }
        document.addEventListener('pointerdown', closeOnOutsidePointer, true)
        window.addEventListener('keydown', closeOnEscape)
        window.addEventListener('blur', dismissDeviceMenu)
        window.addEventListener(TRANSIENT_MENU_DISMISS_EVENT, dismissDeviceMenu)
        return () => {
            document.removeEventListener('pointerdown', closeOnOutsidePointer, true)
            window.removeEventListener('keydown', closeOnEscape)
            window.removeEventListener('blur', dismissDeviceMenu)
            window.removeEventListener(TRANSIENT_MENU_DISMISS_EVENT, dismissDeviceMenu)
        }
    }, [deviceMenuOpen])

    const commitDimensions = () => {
        const size = clampAssistantBrowserViewportSize(
            normalizeAssistantBrowserViewportDimension(width, viewport.width),
            normalizeAssistantBrowserViewportDimension(height, viewport.height)
        )
        setWidth(String(size.width))
        setHeight(String(size.height))
        if (size.width === viewport.width && size.height === viewport.height && viewport.mode === 'freeform') return
        onViewportChange({ ...viewport, mode: 'freeform', presetId: null, ...size })
    }

    const changeDimension = (axis: 'width' | 'height', raw: string) => {
        if (axis === 'width') setWidth(raw)
        else setHeight(raw)
        if (!viewport.aspectRatio) return
        const value = Number(raw)
        if (!Number.isFinite(value) || value <= 0) return
        if (axis === 'width') setHeight(String(Math.round(value / viewport.aspectRatio)))
        else setWidth(String(Math.round(value * viewport.aspectRatio)))
    }

    return (
        <div
            className="relative z-[70] flex h-8 shrink-0 items-center gap-0.5 overflow-visible border-b border-[var(--surface-divider)] bg-[var(--surface-inspector-tab)] px-1.5"
            role="toolbar"
            aria-label="Browser device toolbar"
            data-assistant-browser-device-toolbar
        >
            <span className="hidden shrink-0 px-1 text-[10px] font-medium text-sparkle-text-muted/60 min-[1120px]:inline">Dimensions</span>
            <div ref={deviceMenuRef} className="relative shrink-0">
                <button
                    type="button"
                    className="flex h-6 w-32 items-center gap-1.5 rounded-md px-1.5 text-left text-[10px] font-medium text-sparkle-text-secondary hover:bg-[var(--surface-hover)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent-primary)]/45"
                    onClick={() => setDeviceMenuOpen((current) => !current)}
                    aria-label="Browser device preset"
                    aria-haspopup="listbox"
                    aria-expanded={deviceMenuOpen}
                >
                    <span className="min-w-0 flex-1 truncate">{activePreset?.label || 'Responsive'}</span>
                    <ChevronDown size={11} className="shrink-0 text-sparkle-text-muted/55" />
                </button>
                {deviceMenuOpen ? (
                    <div className="absolute left-0 top-7 z-[420] max-h-72 w-64 overflow-y-auto rounded-lg border border-[var(--surface-divider)] bg-sparkle-card p-1 shadow-xl shadow-black/30" role="listbox" aria-label="Standard Browser devices">
                        <button
                            type="button"
                            role="option"
                            aria-selected={!activePreset}
                            className="flex h-7 w-full items-center rounded-md px-2 text-[10px] text-sparkle-text-secondary hover:bg-[var(--surface-hover)]"
                            onClick={() => {
                                onViewportChange({ ...viewport, mode: 'freeform', presetId: null })
                                setDeviceMenuOpen(false)
                            }}
                        >
                            <span>Responsive</span>
                            {!activePreset ? <Check size={11} className="ml-auto text-[var(--accent-primary)]" /> : null}
                        </button>
                        {CATEGORIES.map((category) => (
                            <div key={category}>
                                <div className="px-2 pb-0.5 pt-2 text-[8px] font-semibold uppercase tracking-[0.1em] text-sparkle-text-muted/45">{category}s</div>
                                {ASSISTANT_BROWSER_VIEWPORT_PRESETS.filter((preset) => preset.category === category).map((preset) => (
                                    <button
                                        key={preset.id}
                                        type="button"
                                        role="option"
                                        aria-selected={activePreset?.id === preset.id}
                                        className="flex h-7 w-full items-center gap-3 rounded-md px-2 text-[10px] text-sparkle-text-secondary hover:bg-[var(--surface-hover)]"
                                        onClick={() => {
                                            onViewportChange({
                                                mode: 'preset',
                                                presetId: preset.id,
                                                width: preset.width,
                                                height: preset.height,
                                                aspectRatio: viewport.aspectRatio ? preset.width / preset.height : null
                                            })
                                            setDeviceMenuOpen(false)
                                        }}
                                    >
                                        <span className="min-w-0 flex-1 truncate text-left">{preset.label}</span>
                                        <span className="shrink-0 tabular-nums text-sparkle-text-muted/55">{preset.detail}</span>
                                        {activePreset?.id === preset.id ? <Check size={11} className="shrink-0 text-[var(--accent-primary)]" /> : <span className="w-[11px]" />}
                                    </button>
                                ))}
                            </div>
                        ))}
                    </div>
                ) : null}
            </div>
            <div className="flex shrink-0 items-center gap-0.5" onBlur={(event) => {
                if (event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget)) return
                commitDimensions()
            }}>
                {(['width', 'height'] as const).map((axis, index) => (
                    <span key={axis} className="contents">
                        {index > 0 ? <span className="text-[9px] text-sparkle-text-muted/45">×</span> : null}
                        <input
                            type="number"
                            value={axis === 'width' ? width : height}
                            min={240}
                            max={2560}
                            onChange={(event) => changeDimension(axis, event.target.value)}
                            onKeyDown={(event) => {
                                if (event.key === 'Enter') {
                                    commitDimensions()
                                    event.currentTarget.blur()
                                }
                            }}
                            className="h-6 w-12 rounded-md border border-transparent bg-transparent px-1 text-center text-[10px] tabular-nums text-sparkle-text-secondary outline-none hover:bg-[var(--surface-hover)] focus:border-[var(--surface-divider)] focus:bg-[var(--color-bg)] [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
                            aria-label={`Viewport ${axis}`}
                        />
                    </span>
                ))}
            </div>
            <button
                type="button"
                className={cn(TOOLBAR_BUTTON, Boolean(viewport.aspectRatio) && 'bg-[var(--surface-hover)] text-sparkle-text')}
                aria-label={viewport.aspectRatio ? 'Unlock viewport aspect ratio' : 'Lock viewport aspect ratio'}
                aria-pressed={Boolean(viewport.aspectRatio)}
                title={viewport.aspectRatio ? 'Unlock aspect ratio' : 'Lock aspect ratio'}
                onClick={() => onViewportChange({
                    ...viewport,
                    aspectRatio: viewport.aspectRatio ? null : viewport.width / viewport.height
                })}
            >
                <Link2 size={12} />
            </button>
            <button
                type="button"
                className={TOOLBAR_BUTTON}
                title="Rotate viewport"
                aria-label="Rotate viewport"
                onClick={() => onViewportChange({
                    ...viewport,
                    mode: viewport.mode === 'preset' ? 'freeform' : viewport.mode,
                    presetId: null,
                    width: viewport.height,
                    height: viewport.width,
                    aspectRatio: viewport.aspectRatio ? 1 / viewport.aspectRatio : null
                })}
            >
                <RotateCw size={12} />
            </button>
            <button type="button" className={cn(TOOLBAR_BUTTON, 'ml-auto')} onClick={onClose} title="Close device toolbar" aria-label="Close device toolbar"><X size={12} /></button>
        </div>
    )
}
