import { useEffect, useMemo, useRef, useState } from 'react'
import { LEFT_PANEL_MAX_WIDTH, LEFT_PANEL_MIN_WIDTH, RIGHT_PANEL_MAX_WIDTH, RIGHT_PANEL_MIN_WIDTH } from './modalShared'
import { VIEWPORT_PRESETS, type ViewportPreset } from './viewport'

type UseFilePreviewChromeParams = {
    defaultStartExpanded: boolean
    defaultLeftPanelOpen: boolean
    defaultRightPanelOpen: boolean
    initialFocusLine?: number | null
    initialFocusLineRequestId?: number | null
}

export function useFilePreviewChrome({
    defaultStartExpanded,
    defaultLeftPanelOpen,
    defaultRightPanelOpen,
    initialFocusLine = null,
    initialFocusLineRequestId = null
}: UseFilePreviewChromeParams) {
    const [viewport, setViewport] = useState<ViewportPreset>('responsive')
    const [isExpanded, setIsExpanded] = useState(defaultStartExpanded)
    const [leftPanelOpen, setLeftPanelOpen] = useState(defaultLeftPanelOpen)
    const [rightPanelOpen, setRightPanelOpen] = useState(defaultRightPanelOpen)
    const [leftPanelWidth, setLeftPanelWidth] = useState(256)
    const [rightPanelWidth, setRightPanelWidth] = useState(288)
    const [isResizingPanels, setIsResizingPanels] = useState(false)
    const [csvDistinctColorsEnabled, setCsvDistinctColorsEnabled] = useState(true)
    const [editorWordWrap, setEditorWordWrap] = useState<'on' | 'off'>('on')
    const [editorMinimapEnabled, setEditorMinimapEnabled] = useState(true)
    const [editorFontSize, setEditorFontSize] = useState(13)
    const [findRequestToken, setFindRequestToken] = useState(0)
    const [replaceRequestToken, setReplaceRequestToken] = useState(0)
    const [focusLine, setFocusLine] = useState<number | null>(initialFocusLine)

    const previewSurfaceRef = useRef<HTMLDivElement | null>(null)
    const panelResizeRef = useRef<{ side: 'left' | 'right'; startX: number; startWidth: number } | null>(null)
    const leftPanelWidthRef = useRef(leftPanelWidth)
    const rightPanelWidthRef = useRef(rightPanelWidth)

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
        if (!isExpanded) return

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

        const handleMouseMove = (event: MouseEvent) => {
            const resize = panelResizeRef.current
            if (!resize) return

            if (resize.side === 'left') {
                const delta = event.clientX - resize.startX
                setLeftPanelWidth(clamp(resize.startWidth + delta, LEFT_PANEL_MIN_WIDTH, LEFT_PANEL_MAX_WIDTH))
                return
            }

            const delta = resize.startX - event.clientX
            setRightPanelWidth(clamp(resize.startWidth + delta, RIGHT_PANEL_MIN_WIDTH, RIGHT_PANEL_MAX_WIDTH))
        }

        const stopResize = () => {
            panelResizeRef.current = null
            setIsResizingPanels(false)
            applyBodyDragState(false)
            window.removeEventListener('mousemove', handleMouseMove)
            window.removeEventListener('mouseup', stopResize)
        }

        const handleMouseDown = (event: MouseEvent) => {
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
            window.addEventListener('mousemove', handleMouseMove)
            window.addEventListener('mouseup', stopResize)
        }

        window.addEventListener('mousedown', handleMouseDown)
        return () => {
            window.removeEventListener('mousedown', handleMouseDown)
            stopResize()
        }
    }, [isExpanded])

    const modalStyle = useMemo(() => {
        if (isExpanded) {
            return {
                width: '100%',
                maxWidth: 'none',
                maxHeight: '100%',
                height: '100%'
            }
        }

        return {
            animation: 'scaleIn 0.15s ease-out',
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
