import { addOverlayEventListener, createOverlayPortal as createPortal, isOverlayEventInside } from '@/components/ui/native-overlay-portal'
import { Pipette, Plus } from 'lucide-react'
import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { pickScreenColor } from './screen-color-picker'
import {
    clamp,
    hexToHsv,
    hexToRgb,
    hsvToHex,
    normalizeHex,
    rgbToHex,
    type HsvColor
} from './zyra-color'

const POPOVER_WIDTH = 232
const POPOVER_GAP = 8
const POPOVER_HEIGHT = 330

function parseChannel(value: string): number | null {
    if (!/^\d{1,3}$/.test(value.trim())) return null
    const parsed = Number.parseInt(value.trim(), 10)
    return parsed >= 0 && parsed <= 255 ? parsed : null
}

export function ZyraColorPicker({ label, value, onChange, addSwatch = false, addSwatchBackground, selected = false, footer, onOpen }: {
    label: string
    value: string
    onChange: (hex: string) => void
    addSwatch?: boolean
    addSwatchBackground?: string
    selected?: boolean
    footer?: ReactNode
    onOpen?: () => void
}) {
    const [open, setOpen] = useState(false)
    const [hsv, setHsv] = useState<HsvColor>(() => hexToHsv(value) || { h: 0, s: 0, v: 0 })
    const [hexDraft, setHexDraft] = useState(value)
    const [rgbDrafts, setRgbDrafts] = useState<[string, string, string]>(() => {
        const rgb = hexToRgb(value)
        return rgb ? [String(rgb.r), String(rgb.g), String(rgb.b)] : ['0', '0', '0']
    })
    const [popoverLayout, setPopoverLayout] = useState<{ top: number; left: number } | null>(null)
    const [screenPickError, setScreenPickError] = useState<string | null>(null)

    const triggerRef = useRef<HTMLButtonElement>(null)
    const popoverRef = useRef<HTMLDivElement>(null)
    const svRef = useRef<HTMLDivElement>(null)
    const hueRef = useRef<HTMLDivElement>(null)
    const hexInputRef = useRef<HTMLInputElement>(null)
    const rgbInputRefs = useRef<Array<HTMLInputElement | null>>([])
    const hsvRef = useRef(hsv)
    const valueRef = useRef(value)
    const dragging = useRef<'sv' | 'hue' | null>(null)

    hsvRef.current = hsv
    valueRef.current = value

    useEffect(() => {
        if (dragging.current) return
        const next = hexToHsv(value)
        if (next) setHsv(next)
        if (document.activeElement !== hexInputRef.current) setHexDraft(value)
        const rgb = hexToRgb(value)
        if (rgb) {
            setRgbDrafts((previous) => {
                const nextDrafts: [string, string, string] = [String(rgb.r), String(rgb.g), String(rgb.b)]
                return previous.map((draft, index) =>
                    document.activeElement === rgbInputRefs.current[index] ? draft : nextDrafts[index]
                ) as [string, string, string]
            })
        }
    }, [value])

    const hasFooter = Boolean(footer)
    const positionPopover = useCallback(() => {
        const trigger = triggerRef.current
        if (!trigger) return
        const rect = trigger.getBoundingClientRect()
        const viewportPadding = 8
        const width = Math.min(POPOVER_WIDTH, window.innerWidth - viewportPadding * 2)
        const availableBelow = window.innerHeight - rect.bottom - POPOVER_GAP - viewportPadding
        const availableAbove = rect.top - POPOVER_GAP - viewportPadding
        const popoverHeight = POPOVER_HEIGHT + (hasFooter ? 86 : 0)
        const openAbove = availableBelow < popoverHeight && availableAbove > availableBelow
        const left = Math.max(viewportPadding, Math.min(rect.right - width, window.innerWidth - width - viewportPadding))
        const top = openAbove
            ? Math.max(viewportPadding, rect.top - POPOVER_GAP - popoverHeight)
            : Math.max(viewportPadding, Math.min(window.innerHeight - popoverHeight - viewportPadding, rect.bottom + POPOVER_GAP))
        setPopoverLayout({ left, top })
    }, [hasFooter])

    useEffect(() => {
        if (!open) return
        positionPopover()
        const closeOnOutsidePointer = (event: globalThis.PointerEvent) => {
            if (!isOverlayEventInside(event, triggerRef.current) && !isOverlayEventInside(event, popoverRef.current)) setOpen(false)
        }
        const closeOnEscape = (event: globalThis.KeyboardEvent) => {
            if (event.key === 'Escape') {
                setOpen(false)
                triggerRef.current?.focus()
            }
        }
        const updatePosition = () => positionPopover()
        const removeOverlayListener1 = addOverlayEventListener('pointerdown', closeOnOutsidePointer)
        const removeOverlayListener2 = addOverlayEventListener('keydown', closeOnEscape)
        window.addEventListener('resize', updatePosition)
        window.addEventListener('scroll', updatePosition, true)
        return () => {
            removeOverlayListener1()
            removeOverlayListener2()
            window.removeEventListener('resize', updatePosition)
            window.removeEventListener('scroll', updatePosition, true)
        }
    }, [open, positionPopover])

    const commitHsv = (next: HsvColor) => {
        const rounded = { h: clamp(next.h, 0, 359.99), s: clamp(next.s, 0, 100), v: clamp(next.v, 0, 100) }
        setHsv(rounded)
        const hex = hsvToHex(rounded.h, rounded.s, rounded.v)
        if (hex !== valueRef.current) onChange(hex)
    }

    const updateFromSvPointer = (clientX: number, clientY: number) => {
        const rect = svRef.current?.getBoundingClientRect()
        if (!rect) return
        commitHsv({
            h: hsvRef.current.h,
            s: clamp(((clientX - rect.left) / rect.width) * 100, 0, 100),
            v: clamp((1 - (clientY - rect.top) / rect.height) * 100, 0, 100)
        })
    }

    const updateFromHuePointer = (clientX: number) => {
        const rect = hueRef.current?.getBoundingClientRect()
        if (!rect) return
        commitHsv({ ...hsvRef.current, h: clamp(((clientX - rect.left) / rect.width) * 360, 0, 359.99) })
    }

    const handlePointer = (kind: 'sv' | 'hue') => (event: ReactPointerEvent<HTMLDivElement>) => {
        dragging.current = kind
        event.currentTarget.setPointerCapture(event.pointerId)
        if (kind === 'sv') updateFromSvPointer(event.clientX, event.clientY)
        else updateFromHuePointer(event.clientX)
    }

    const handlePointerMove = (kind: 'sv' | 'hue') => (event: ReactPointerEvent<HTMLDivElement>) => {
        if (dragging.current !== kind || !event.buttons) return
        if (kind === 'sv') updateFromSvPointer(event.clientX, event.clientY)
        else updateFromHuePointer(event.clientX)
    }

    const endDrag = () => {
        dragging.current = null
    }

    const handleSvKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
        const step = event.shiftKey ? 10 : 2
        const current = hsvRef.current
        if (event.key === 'ArrowLeft') {
            event.preventDefault()
            commitHsv({ ...current, s: current.s - step })
        } else if (event.key === 'ArrowRight') {
            event.preventDefault()
            commitHsv({ ...current, s: current.s + step })
        } else if (event.key === 'ArrowUp') {
            event.preventDefault()
            commitHsv({ ...current, v: current.v + step })
        } else if (event.key === 'ArrowDown') {
            event.preventDefault()
            commitHsv({ ...current, v: current.v - step })
        } else if (event.key === 'Escape') {
            event.preventDefault()
            setOpen(false)
            triggerRef.current?.focus()
        }
    }

    const handleHueKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
        const step = event.shiftKey ? 10 : 1
        const current = hsvRef.current
        if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') {
            event.preventDefault()
            commitHsv({ ...current, h: current.h - step })
        } else if (event.key === 'ArrowRight' || event.key === 'ArrowUp') {
            event.preventDefault()
            commitHsv({ ...current, h: current.h + step })
        } else if (event.key === 'Escape') {
            event.preventDefault()
            setOpen(false)
            triggerRef.current?.focus()
        }
    }

    const commitHexDraft = () => {
        const normalized = normalizeHex(hexDraft)
        if (normalized) {
            setHexDraft(normalized)
            if (normalized !== valueRef.current) onChange(normalized)
        } else {
            setHexDraft(valueRef.current)
        }
    }

    const commitRgbDrafts = (drafts: [string, string, string]) => {
        const r = parseChannel(drafts[0])
        const g = parseChannel(drafts[1])
        const b = parseChannel(drafts[2])
        if (r === null || g === null || b === null) return
        const hex = rgbToHex(r, g, b)
        if (hex !== valueRef.current) onChange(hex)
    }

    const pickFromScreen = async (ownerWindow: Window | null) => {
        setScreenPickError(null)
        const result = await pickScreenColor(ownerWindow)
        if (result.status === 'picked' && result.color !== valueRef.current) onChange(result.color)
        if (result.status === 'error') setScreenPickError(result.message)
    }

    const hue = hsv.h
    const saturation = hsv.s
    const brightness = hsv.v

    return (
        <>
            <button
                ref={triggerRef}
                type="button"
                aria-label={`${label} custom color picker`}
                aria-haspopup="dialog"
                aria-expanded={open}
                aria-pressed={addSwatch ? selected : undefined}
                title="Pick a custom color"
                onClick={() => {
                    if (!open) {
                        setScreenPickError(null)
                        onOpen?.()
                    }
                    setOpen((current) => !current)
                }}
                className={cn(
                    'relative shrink-0 outline-none transition-[filter] hover:brightness-110 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white/80',
                    addSwatch ? cn('size-7 rounded-full border bg-[var(--settings-control)]', selected ? 'border-[var(--settings-text)]' : 'border-dashed border-[var(--settings-border-strong)]') : 'h-full w-11'
                )}
                style={addSwatchBackground ? { background: addSwatchBackground } : undefined}
            >
                {addSwatch ? <Plus size={15} aria-hidden="true" className={cn('relative z-10 mx-auto', selected ? 'text-white [filter:drop-shadow(0_1px_1px_rgba(0,0,0,0.8))]' : 'text-[var(--settings-text)]')} /> : <span
                    aria-hidden="true"
                    className="absolute inset-0 border-r border-[var(--settings-border)]"
                    style={{ backgroundColor: value }}
                />}
            </button>
            {open && popoverLayout ? createPortal(
                <div
                    ref={popoverRef}
                    role="dialog"
                    aria-label={`${label} custom color picker`}
                    className="fixed z-[120] max-h-[calc(100vh-16px)] overflow-y-auto rounded-xl border border-[var(--settings-border-strong)] bg-[var(--settings-popover)] p-3 shadow-[0_16px_48px_color-mix(in_srgb,var(--color-bg)_60%,transparent)]"
                    style={{ left: popoverLayout.left, top: popoverLayout.top, width: POPOVER_WIDTH }}
                >
                        <div className="flex items-center gap-2">
                            <span aria-hidden="true" className="size-6 shrink-0 rounded-full border border-black/30" style={{ backgroundColor: value }} />
                            <input
                                ref={hexInputRef}
                                type="text"
                                value={hexDraft}
                                onChange={(event) => {
                                    const next = event.target.value
                                    setHexDraft(next)
                                    const normalized = normalizeHex(next)
                                    if (normalized && normalized !== valueRef.current) onChange(normalized)
                                }}
                                onBlur={commitHexDraft}
                                onKeyDown={(event) => {
                                    if (event.key === 'Enter') event.currentTarget.blur()
                                    if (event.key === 'Escape') {
                                        event.preventDefault()
                                        setHexDraft(valueRef.current)
                                        setOpen(false)
                                        triggerRef.current?.focus()
                                    }
                                }}
                                spellCheck={false}
                                aria-label={`${label} hex value`}
                                className="h-7 min-w-0 flex-1 rounded-md border border-[var(--settings-border)] bg-[var(--settings-control)] px-2 font-mono text-[11px] uppercase text-[var(--settings-text)] outline-none focus:border-[var(--accent-primary)]"
                            />
                            <button
                                type="button"
                                aria-label="Pick a color from the screen"
                                title="Pick from screen"
                                onClick={(event) => void pickFromScreen(event.currentTarget.ownerDocument.defaultView)}
                                className="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-[var(--settings-text-muted)] transition-colors hover:bg-[var(--settings-control-hover)] hover:text-[var(--settings-text)]"
                            >
                                <Pipette size={14} aria-hidden="true" />
                            </button>
                        </div>
                        {screenPickError ? <p role="alert" className="mt-2 text-[11px] leading-4 text-[var(--status-danger)]">{screenPickError}</p> : null}

                        <div
                            ref={svRef}
                            role="slider"
                            tabIndex={0}
                            aria-label={`${label} saturation and brightness`}
                            aria-valuetext={`Saturation ${Math.round(saturation)} percent, brightness ${Math.round(brightness)} percent`}
                            onPointerDown={handlePointer('sv')}
                            onPointerMove={handlePointerMove('sv')}
                            onPointerUp={endDrag}
                            onPointerCancel={endDrag}
                            onKeyDown={handleSvKeyDown}
                            className="relative mt-3 h-[140px] w-full cursor-crosshair touch-none rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)]"
                            style={{ backgroundColor: `hsl(${Math.round(hue)}, 100%, 50%)` }}
                        >
                            <div className="absolute inset-0 rounded-lg" style={{ background: 'linear-gradient(90deg, #fff, transparent)' }} />
                            <div className="absolute inset-0 rounded-lg" style={{ background: 'linear-gradient(0deg, #000, transparent)' }} />
                            <div
                                aria-hidden="true"
                                className="absolute size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_1px_4px_rgba(0,0,0,0.6)]"
                                style={{ left: `${saturation}%`, top: `${100 - brightness}%`, backgroundColor: value }}
                            />
                        </div>

                        <div className="mt-3 flex items-center gap-2">
                            <span aria-hidden="true" className="size-5 shrink-0 rounded-full border border-black/30" style={{ backgroundColor: value }} />
                            <div
                                ref={hueRef}
                                role="slider"
                                tabIndex={0}
                                aria-label={`${label} hue`}
                                aria-valuemin={0}
                                aria-valuemax={360}
                                aria-valuenow={Math.round(hue)}
                                onPointerDown={handlePointer('hue')}
                                onPointerMove={handlePointerMove('hue')}
                                onPointerUp={endDrag}
                                onPointerCancel={endDrag}
                                onKeyDown={handleHueKeyDown}
                                className={cn('relative h-3 w-full cursor-ew-resize touch-none rounded-full outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)]')}
                                style={{ background: 'linear-gradient(90deg, #f00 0%, #ff0 17%, #0f0 33%, #0ff 50%, #00f 67%, #f0f 83%, #f00 100%)' }}
                            >
                                <div
                                    aria-hidden="true"
                                    className="absolute top-1/2 size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_1px_4px_rgba(0,0,0,0.6)]"
                                    style={{ left: `${(hue / 360) * 100}%`, backgroundColor: `hsl(${Math.round(hue)}, 100%, 50%)` }}
                                />
                            </div>
                        </div>

                        <div className="mt-3 grid grid-cols-3 gap-2">
                            {(['R', 'G', 'B'] as const).map((channel, index) => (
                                <label key={channel} className="block">
                                    <input
                                        ref={(node) => {
                                            rgbInputRefs.current[index] = node
                                        }}
                                        type="text"
                                        inputMode="numeric"
                                        value={rgbDrafts[index]}
                                        onChange={(event) => {
                                            const next = rgbDrafts.map((draft, draftIndex) => (draftIndex === index ? event.target.value : draft)) as [string, string, string]
                                            setRgbDrafts(next)
                                            commitRgbDrafts(next)
                                        }}
                                        onBlur={() => {
                                            const rgb = hexToRgb(valueRef.current)
                                            if (rgb) setRgbDrafts([String(rgb.r), String(rgb.g), String(rgb.b)])
                                        }}
                                        onKeyDown={(event) => {
                                            if (event.key === 'Enter') event.currentTarget.blur()
                                            if (event.key === 'Escape') {
                                                event.preventDefault()
                                                const rgb = hexToRgb(valueRef.current)
                                                if (rgb) setRgbDrafts([String(rgb.r), String(rgb.g), String(rgb.b)])
                                                setOpen(false)
                                                triggerRef.current?.focus()
                                            }
                                        }}
                                        aria-label={`${label} ${channel} channel`}
                                        className="h-8 w-full rounded-md border border-[var(--settings-border)] bg-[var(--settings-control)] px-2 text-center text-xs tabular-nums text-[var(--settings-text)] outline-none focus:border-[var(--accent-primary)]"
                                    />
                                    <span className="mt-1 block text-center text-[10px] text-[var(--settings-text-muted)]">{channel}</span>
                                </label>
                            ))}
                        </div>
                        {footer ? <div className="mt-3 border-t border-[var(--settings-divider)] pt-3">{footer}</div> : null}
                    </div>,
                document.body
            ) : null}
        </>
    )
}
