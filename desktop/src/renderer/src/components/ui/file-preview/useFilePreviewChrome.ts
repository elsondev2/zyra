import { useEffect, useMemo, useRef, useState } from 'react'
import { LEFT_PANEL_MAX_WIDTH, LEFT_PANEL_MIN_WIDTH, RIGHT_PANEL_MAX_WIDTH, RIGHT_PANEL_MIN_WIDTH } from './modalShared'
import { VIEWPORT_PRESETS, type ViewportPreset } from './viewport'

type UseFilePreviewChromeParams = {
    defaultStartExpanded: boolean
    defaultLeftPanelOpen: boolean
    defaultRightPanelOpen: boolean
    defaultCsvDistinctColorsEnabled: boolean
    defaultEditorWordWrap: 'on' | 'off'
    defaultEditorMinimapEnabled: boolean
    defaultEditorFontSize: number
    initialLeftPanelWidth?: number
    initialRightPanelWidth?: number
    onPanelWidthCommit?: (side: 'left' | 'right', width: number) => void
    initialFocusLine?: number | null
    initialFocusLineRequestId?: number | null
    active?: boolean
}

export function useFilePreviewChrome({
    defaultStartExpanded,
    defaultLeftPanelOpen,
    defaultRightPanelOpen,
    defaultCsvDistinctColorsEnabled,
    defaultEditorWordWrap,
    defaultEditorMinimapEnabled,
    defaultEditorFontSize,
    initialLeftPanelWidth = 256,
    initialRightPanelWidth = 288,
    onPanelWidthCommit,
    initialFocusLine = null,
    initialFocusLineRequestId = null,
    active = true
}: UseFilePreviewChromeParams) {
    const [viewport, setViewport] = useState<ViewportPreset>('responsive')
    const [isExpanded, setIsExpanded] = useState(defaultStartExpanded)
    const [leftPanelOpen, setLeftPanelOpen] = useState(defaultLeftPanelOpen)
    const [rightPanelOpen, setRightPanelOpen] = useState(defaultRightPanelOpen)
    const [leftPanelWidth, setLeftPanelWidth] = useState(initialLeftPanelWidth)
    const [rightPanelWidth, setRightPanelWidth] = useState(initialRightPanelWidth)
    const [isResizingPanels, setIsResizingPanels] = useState(false)
    const [csvDistinctColorsEnabled, setCsvDistinctColorsEnabled] = useState(defaultCsvDistinctColorsEnabled)
    const [editorWordWrap, setEditorWordWrap] = useState<'on' | 'off'>(defaultEditorWordWrap)
    const [editorMinimapEnabled, setEditorMinimapEnabled] = useState(defaultEditorMinimapEnabled)
    const [editorFontSize, setEditorFontSize] = useState(defaultEditorFontSize)
    const [findRequestToken, setFindRequestToken] = useState(0)
    const [replaceRequestToken, setReplaceRequestToken] = useState(0)
    const [focusLine, setFocusLine] = useState<number | null>(initialFocusLine)

    const previewSurfaceRef = useRef<HTMLDivElement | null>(null)
    const panelResizeRef = useRef<{ side: 'left' | 'right'; startX: number; startWidth: number } | null>(null)
    const leftPanelWidthRef = useRef(leftPanelWidth)
    const rightPanelWidthRef = useRef(rightPanelWidth)
    const resizeFrameRef = useRef<number | null>(null)
    const pendingResizeClientXRef = useRef<number | null>(null)

    useEffect(() => {
        if (!initialFocusLine) {
            setFocusLine(null)
            return
        }

        let disposed = false
        setFocusLine(null)
        let frameId: number | null = null
        let timeoutId: ReturnType<typeof setTimeout> | null = null
        if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
            frameId = window.requestAnimationFrame(() => {
                if (!disposed) setFocusLine(initialFocusLine)
            })
        } else {
            timeoutId = setTimeout(() => {
                if (!disposed) setFocusLine(initialFocusLine)
            }, 0)
        }

        return () => {
            disposed = true
            if (frameId !== null && typeof window !== 'undefined' && typeof window.cancelAnimationFrame === 'function') {
                window.cancelAnimationFrame(frameId)
                return
            }
            if (timeoutId !== null) clearTimeout(timeoutId)
        }
    }, [initialFocusLine, initialFocusLineRequestId])

    useEffect(() => {
        leftPanelWidthRef.current = leftPanelWidth
    }, [leftPanelWidth])

    useEffect(() => {
        rightPanelWidthRef.current = rightPanelWidth
    }, [rightPanelWidth])

    useEffect(() => {
        if (!active) return
        const applyBodyDragState = (active: boolean) => {
            if (active) {
                document.documentElement.style.setProperty('cursor', 'col-resize', 'important')
                document.documentElement.style.setProperty('user-select', 'none', 'important')
                document.body.style.setProperty('cursor', 'col-resize', 'important')
                document.body.style.setProperty('user-select', 'none', 'important')
                return
            }

            document.documentElement.style.removeProperty('cursor')
            document.documentElement.style.removeProperty('user-select')
            document.body.style.removeProperty('cursor')
            document.body.style.removeProperty('user-select')
        }

        const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

        const applyResize = (clientX: number) => {
            const resize = panelResizeRef.current
            if (!resize) return

            if (resize.side === 'left') {
                const delta = clientX - resize.startX
                const nextWidth = clamp(resize.startWidth + delta, LEFT_PANEL_MIN_WIDTH, LEFT_PANEL_MAX_WIDTH)
                leftPanelWidthRef.current = nextWidth
                setLeftPanelWidth(nextWidth)
                return
            }

            const delta = resize.startX - clientX
            const nextWidth = clamp(resize.startWidth + delta, RIGHT_PANEL_MIN_WIDTH, RIGHT_PANEL_MAX_WIDTH)
            rightPanelWidthRef.current = nextWidth
            setRightPanelWidth(nextWidth)
        }

        const handlePointerMove = (event: PointerEvent) => {
            if (!panelResizeRef.current) return
            pendingResizeClientXRef.current = event.clientX
            if (resizeFrameRef.current !== null) return
            resizeFrameRef.current = window.requestAnimationFrame(() => {
                resizeFrameRef.current = null
                const clientX = pendingResizeClientXRef.current
                pendingResizeClientXRef.current = null
                if (clientX !== null) applyResize(clientX)
            })
        }

        const stopResize = () => {
            const resize = panelResizeRef.current
            const pendingClientX = pendingResizeClientXRef.current
            if (resizeFrameRef.current !== null) {
                window.cancelAnimationFrame(resizeFrameRef.current)
                resizeFrameRef.current = null
            }
            pendingResizeClientXRef.current = null
            if (resize && pendingClientX !== null) applyResize(pendingClientX)
            panelResizeRef.current = null
            setIsResizingPanels(false)
            applyBodyDragState(false)
            if (resize) onPanelWidthCommit?.(resize.side, resize.side === 'left' ? leftPanelWidthRef.current : rightPanelWidthRef.current)
            window.removeEventListener('pointermove', handlePointerMove)
            window.removeEventListener('pointerup', stopResize)
            window.removeEventListener('pointercancel', stopResize)
        }

        const handlePointerDown = (event: PointerEvent) => {
            const target = event.target as HTMLElement | null
            const side = target?.dataset?.previewResizeSide
            if (side !== 'left' && side !== 'right') return

            event.preventDefault()
            panelResizeRef.current = {
                side,
                startX: event.clientX,
                startWidth: side === 'left' ? leftPanelWidthRef.current : rightPanelWidthRef.current
            }
            setIsResizingPanels(true)
            applyBodyDragState(true)
            window.addEventListener('pointermove', handlePointerMove)
            window.addEventListener('pointerup', stopResize)
            window.addEventListener('pointercancel', stopResize)
        }

        const handleSeparatorKeyDown = (event: KeyboardEvent) => {
            const target = event.target as HTMLElement | null
            const side = target?.dataset?.previewResizeSide
            if ((side !== 'left' && side !== 'right') || (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight')) return
            event.preventDefault()
            const direction = event.key === 'ArrowRight' ? 1 : -1
            const step = event.shiftKey ? 24 : 8
            if (side === 'left') {
                const nextWidth = clamp(leftPanelWidthRef.current + direction * step, LEFT_PANEL_MIN_WIDTH, LEFT_PANEL_MAX_WIDTH)
                leftPanelWidthRef.current = nextWidth
                setLeftPanelWidth(nextWidth)
                onPanelWidthCommit?.('left', nextWidth)
                return
            }
            const nextWidth = clamp(rightPanelWidthRef.current - direction * step, RIGHT_PANEL_MIN_WIDTH, RIGHT_PANEL_MAX_WIDTH)
            rightPanelWidthRef.current = nextWidth
            setRightPanelWidth(nextWidth)
            onPanelWidthCommit?.('right', nextWidth)
        }

        window.addEventListener('pointerdown', handlePointerDown)
        window.addEventListener('keydown', handleSeparatorKeyDown)
        return () => {
            window.removeEventListener('pointerdown', handlePointerDown)
            window.removeEventListener('keydown', handleSeparatorKeyDown)
            stopResize()
        }
    }, [active, onPanelWidthCommit])

    const modalStyle = useMemo(() => {
        if (isExpanded) {
            return {
                width: '100%',
                maxWidth: '100vw',
                maxHeight: 'calc(100vh - 34px)',
                height: '100%'
            }
        }

        return {
            width: 'min(1400px, 95vw)',
            maxWidth: '1400px',
            height: 'min(920px, 90vh)',
            maxHeight: '90vh'
        }
    }, [isExpanded])

    return {
        viewport,
        setViewport,
        isExpanded,
        setIsExpanded,
        leftPanelOpen,
        setLeftPanelOpen,
        rightPanelOpen,
        setRightPanelOpen,
        leftPanelWidth,
        rightPanelWidth,
        isResizingPanels,
        csvDistinctColorsEnabled,
        setCsvDistinctColorsEnabled,
        editorWordWrap,
        setEditorWordWrap,
        editorMinimapEnabled,
        setEditorMinimapEnabled,
        editorFontSize,
        setEditorFontSize,
        findRequestToken,
        setFindRequestToken,
        replaceRequestToken,
        setReplaceRequestToken,
        focusLine,
        setFocusLine,
        previewSurfaceRef,
        modalStyle,
        presetConfig: VIEWPORT_PRESETS[viewport]
    }
}
