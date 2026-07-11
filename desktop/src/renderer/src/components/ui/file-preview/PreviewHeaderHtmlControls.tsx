import { ChevronDown } from 'lucide-react'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatedHeight } from '@/components/ui/AnimatedHeight'
import { cn } from '@/lib/utils'
import { VIEWPORT_PRESETS, type ViewportPreset } from './viewport'

const MENU_ANIMATION_MS = 240

type ViewportMenuPosition = {
    top: number
    left: number
    width: number
    attachment: 'top' | 'bottom'
    shellClassName: string
}

type PreviewHeaderHtmlControlsProps = {
    isCompactHtmlHeader: boolean
    isVeryCompactHtmlHeader: boolean
    isUltraCompactHtmlHeader: boolean
    isIdeChrome?: boolean
    viewport: ViewportPreset
    onViewportChange: (viewport: ViewportPreset) => void
}

export function PreviewHeaderHtmlControls({
    isCompactHtmlHeader,
    isVeryCompactHtmlHeader,
    isUltraCompactHtmlHeader,
    isIdeChrome = false,
    viewport,
    onViewportChange
}: PreviewHeaderHtmlControlsProps) {
    const [menuOpen, setMenuOpen] = useState(false)
    const [menuVisible, setMenuVisible] = useState(false)
    const [menuPosition, setMenuPosition] = useState<ViewportMenuPosition | null>(null)
    const triggerRef = useRef<HTMLButtonElement | null>(null)
    const menuRef = useRef<HTMLDivElement | null>(null)
    const closeTimerRef = useRef<number | null>(null)
    const viewportEntries = useMemo(
        () => Object.entries(VIEWPORT_PRESETS) as [ViewportPreset, (typeof VIEWPORT_PRESETS)[ViewportPreset]][],
        []
    )

    const openMenu = () => {
        if (closeTimerRef.current !== null) {
            window.clearTimeout(closeTimerRef.current)
            closeTimerRef.current = null
        }
        setMenuVisible(true)
        window.requestAnimationFrame(() => setMenuOpen(true))
    }

    const closeMenu = () => {
        if (closeTimerRef.current !== null) {
            window.clearTimeout(closeTimerRef.current)
        }
        setMenuOpen(false)
        closeTimerRef.current = window.setTimeout(() => {
            setMenuVisible(false)
            closeTimerRef.current = null
        }, MENU_ANIMATION_MS)
    }

    const toggleMenu = () => {
        if (menuVisible && menuOpen) {
            closeMenu()
            return
        }
        openMenu()
    }

    const updateMenuPosition = useMemo(() => (menuHeight = 212) => {
        const trigger = triggerRef.current
        if (!trigger) return

        const viewportPadding = 12
        const rect = trigger.getBoundingClientRect()
        const menuWidth = Math.ceil(rect.width)
        const spaceBelow = window.innerHeight - rect.bottom - viewportPadding
        const spaceAbove = rect.top - viewportPadding
        const shouldOpenUpward = spaceBelow < menuHeight && spaceAbove > spaceBelow
        const maxTop = Math.max(viewportPadding, window.innerHeight - menuHeight - viewportPadding)
        const top = shouldOpenUpward
            ? Math.max(viewportPadding, rect.top - menuHeight + 1)
            : Math.max(viewportPadding, Math.min(maxTop, rect.bottom - 1))
        const maxLeft = Math.max(viewportPadding, window.innerWidth - menuWidth - viewportPadding)
        const left = Math.max(viewportPadding, Math.min(rect.right - menuWidth, maxLeft))

        setMenuPosition({
            top,
            left,
            width: menuWidth,
            attachment: shouldOpenUpward ? 'top' : 'bottom',
            shellClassName: shouldOpenUpward
                ? 'rounded-t-lg rounded-b-none border-b-transparent'
                : 'rounded-b-lg rounded-t-none border-t-transparent'
        })
    }, [])

    useLayoutEffect(() => {
        if (!menuVisible) return

        const handleViewportChange = () => updateMenuPosition()
        handleViewportChange()
        window.addEventListener('resize', handleViewportChange)
        window.addEventListener('scroll', handleViewportChange, true)
        return () => {
            window.removeEventListener('resize', handleViewportChange)
            window.removeEventListener('scroll', handleViewportChange, true)
        }
    }, [menuVisible, updateMenuPosition])

    useEffect(() => {
        if (!menuVisible) return

        const handlePointerDown = (event: PointerEvent) => {
            const target = event.target as Node | null
            if (menuRef.current?.contains(target) || triggerRef.current?.contains(target)) return
            closeMenu()
        }

        const handleFocusIn = (event: FocusEvent) => {
            const target = event.target as Node | null
            if (menuRef.current?.contains(target) || triggerRef.current?.contains(target)) return
            closeMenu()
        }

        const handleWindowBlur = () => {
            window.requestAnimationFrame(() => {
                const activeElement = document.activeElement
                if (!activeElement) return
                if (menuRef.current?.contains(activeElement) || triggerRef.current?.contains(activeElement)) return
                closeMenu()
            })
        }

        const iframeElements = Array.from(document.querySelectorAll('iframe'))
        const handleIframePointerDown = () => closeMenu()

        const handleEscape = (event: KeyboardEvent) => {
            if (event.key === 'Escape') closeMenu()
        }

        document.addEventListener('pointerdown', handlePointerDown, true)
        document.addEventListener('focusin', handleFocusIn, true)
        window.addEventListener('blur', handleWindowBlur)
        window.addEventListener('keydown', handleEscape)
        iframeElements.forEach((iframeElement) => {
            iframeElement.addEventListener('pointerdown', handleIframePointerDown)
        })
        return () => {
            document.removeEventListener('pointerdown', handlePointerDown, true)
            document.removeEventListener('focusin', handleFocusIn, true)
            window.removeEventListener('blur', handleWindowBlur)
            window.removeEventListener('keydown', handleEscape)
            iframeElements.forEach((iframeElement) => {
                iframeElement.removeEventListener('pointerdown', handleIframePointerDown)
            })
        }
    }, [menuVisible])

    useEffect(() => {
        if (!menuVisible) {
            setMenuPosition(null)
            return
        }

        const handleResize = () => {
            const height = menuRef.current?.offsetHeight ?? 212
            updateMenuPosition(height)
        }

        const rafId = window.requestAnimationFrame(handleResize)
        window.addEventListener('resize', handleResize)
        return () => {
            window.cancelAnimationFrame(rafId)
            window.removeEventListener('resize', handleResize)
        }
    }, [menuVisible, updateMenuPosition])

    useEffect(() => () => {
        if (closeTimerRef.current !== null) {
            window.clearTimeout(closeTimerRef.current)
        }
    }, [])

    const selectedLabel = viewport === 'responsive'
        ? 'Full Width'
        : `${VIEWPORT_PRESETS[viewport].label} (${VIEWPORT_PRESETS[viewport].width}x${VIEWPORT_PRESETS[viewport].height})`

    return (
        <div
            className={cn(
                'flex items-center gap-2',
                isCompactHtmlHeader ? 'order-3 w-full flex-wrap' : '',
                isVeryCompactHtmlHeader ? 'justify-start' : isCompactHtmlHeader ? 'justify-between' : ''
            )}
        >
            <div
                className={cn(
                    'relative z-40 flex items-center gap-2',
                    isIdeChrome
                        ? 'rounded-md border border-white/[0.06] bg-white/[0.025] px-1.5 py-0.5'
                        : 'rounded-lg bg-white/5 p-1.5',
                    isUltraCompactHtmlHeader ? 'w-full' : ''
                )}
            >
                <span className={cn('px-1 text-[11px]', isIdeChrome ? 'text-white/45' : 'text-white/60')}>Viewport</span>
                <button
                    ref={triggerRef}
                    type="button"
                    onClick={toggleMenu}
                    className={cn(
                        'inline-flex items-center gap-1.5 rounded-md border border-white/[0.07] bg-[#111927] px-2 text-left text-xs text-white/88 transition-[background-color,color,border-color,box-shadow,border-radius] duration-200 hover:bg-[#172133] hover:text-white focus-visible:border-sky-400/35 focus-visible:bg-[#172133] focus-visible:outline-none',
                        menuVisible && (
                            menuPosition?.attachment !== 'top'
                                ? 'rounded-b-none border-b-transparent border-white/20 shadow-[0_10px_24px_rgba(0,0,0,0.16)]'
                                : 'rounded-t-none border-t-transparent border-white/20 shadow-[0_10px_24px_rgba(0,0,0,0.16)]'
                        ),
                        isIdeChrome ? 'h-5 min-w-[170px]' : 'h-7 min-w-[220px]'
                    )}
                    title="Choose preview viewport size"
                    aria-label="Choose preview viewport size"
                    aria-haspopup="menu"
                    aria-expanded={menuVisible && menuOpen}
                >
                    <span className="min-w-0 flex-1 truncate">{selectedLabel}</span>
                    <ChevronDown className={cn('size-3.5 shrink-0 text-white/45 transition-transform', menuVisible && menuOpen && 'rotate-180')} />
                </button>

                {menuVisible && menuPosition && typeof document !== 'undefined' ? createPortal(
                    <div
                        ref={menuRef}
                        className="fixed z-[2147483000] overflow-visible"
                        style={{
                            left: `${menuPosition.left}px`,
                            top: `${menuPosition.top}px`,
                            width: `${menuPosition.width}px`
                        }}
                    >
                        <AnimatedHeight isOpen={menuOpen} duration={MENU_ANIMATION_MS}>
                            <div className={cn(
                                'border border-white/[0.08] bg-[#111927] p-1 shadow-2xl shadow-black/60',
                                menuPosition.shellClassName
                            )}>
                                {viewportEntries.map(([key, preset]) => {
                                    const isSelected = key === viewport
                                    const optionLabel = key === 'responsive'
                                        ? 'Full Width'
                                        : `${preset.label} (${preset.width}x${preset.height})`
                                    const OptionIcon = preset.icon

                                    return (
                                        <button
                                            key={key}
                                            type="button"
                                            onClick={() => {
                                                onViewportChange(key)
                                                closeMenu()
                                            }}
                                            className={cn(
                                                'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors',
                                                isSelected
                                                    ? 'bg-sky-500/14 text-sky-100'
                                                    : 'text-white/72 hover:bg-white/[0.05] hover:text-white'
                                            )}
                                        >
                                            <span className="inline-flex size-5 shrink-0 items-center justify-center rounded-md border border-white/10 bg-white/[0.03]">
                                                {OptionIcon ? <OptionIcon size={12} /> : <span className="block size-2 rounded-full bg-current/70" />}
                                            </span>
                                            <span className="min-w-0 flex-1 truncate">{optionLabel}</span>
                                            {isSelected ? <span className="text-[10px] uppercase tracking-[0.12em] text-sky-200/80">On</span> : null}
                                        </button>
                                    )
                                })}
                            </div>
                        </AnimatedHeight>
                    </div>,
                    document.body
                ) : null}
            </div>
        </div>
    )
}
