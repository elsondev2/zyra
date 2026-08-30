import type { PreviewFile } from './types'

export type OfficePreviewType = Extract<PreviewFile['type'], 'docx' | 'xlsx' | 'pptx'>

export type OfficePreviewPosition = {
    index: number
    total: number
    unit: 'page' | 'sheet' | 'slide'
}

export type OfficePreviewViewerCallbacks = {
    onPositionChange: (position: OfficePreviewPosition) => void
    onScaleChange: (scale: number) => void
    onRenderError: (error: Error) => void
}

export type OfficePreviewViewer = {
    load: (source: string | ArrayBuffer) => Promise<void>
    destroy: () => void
    getScale: () => number
    zoomIn: () => void | Promise<void>
    zoomOut: () => void | Promise<void>
    fitWidth: () => void | Promise<void>
    fitPage: () => void | Promise<void>
    findText: (query: string) => Promise<number>
    findNext: () => Promise<void>
    findPrevious: () => Promise<void>
    clearFind: () => void
    getPosition: () => OfficePreviewPosition
}

const DESK_BACKGROUND = 'var(--office-preview-desk)'
const PAGE_SHADOW = '0 0 0 1px var(--office-preview-page-border), 0 12px 30px var(--office-preview-page-shadow)'

export async function createOfficePreviewViewer(
    type: OfficePreviewType,
    container: HTMLElement,
    callbacks: OfficePreviewViewerCallbacks
): Promise<OfficePreviewViewer> {
    if (type === 'docx') {
        const { DocxScrollViewer } = await import('@silurus/ooxml/docx')
        const viewer = new DocxScrollViewer(container, {
            mode: 'worker',
            useGoogleFonts: false,
            background: DESK_BACKGROUND,
            gap: 20,
            paddingTop: 20,
            paddingBottom: 28,
            paddingLeft: 20,
            paddingRight: 20,
            overscan: 1,
            pageShadow: PAGE_SHADOW,
            enableTextSelection: true,
            enableElementSelection: true,
            enableHyperlinks: true,
            onVisiblePageChange: (index, total) => callbacks.onPositionChange({ index, total, unit: 'page' }),
            onScaleChange: callbacks.onScaleChange,
            onError: callbacks.onRenderError
        })
        return {
            load: (source) => viewer.load(source),
            destroy: () => viewer.destroy(),
            getScale: () => viewer.getScale(),
            zoomIn: () => viewer.zoomIn(),
            zoomOut: () => viewer.zoomOut(),
            fitWidth: () => viewer.fitWidth(),
            fitPage: () => viewer.fitPage(),
            findText: async (query) => (await viewer.findText(query)).length,
            findNext: async () => { await viewer.findNext() },
            findPrevious: async () => { await viewer.findPrev() },
            clearFind: () => viewer.clearFind(),
            getPosition: () => ({ index: viewer.topVisiblePage, total: viewer.pageCount, unit: 'page' })
        }
    }

    if (type === 'pptx') {
        const { PptxScrollViewer } = await import('@silurus/ooxml/pptx')
        const viewer = new PptxScrollViewer(container, {
            mode: 'worker',
            useGoogleFonts: false,
            background: DESK_BACKGROUND,
            gap: 22,
            paddingTop: 22,
            paddingBottom: 30,
            paddingLeft: 22,
            paddingRight: 22,
            overscan: 1,
            mediaOverscan: 0,
            pageShadow: PAGE_SHADOW,
            enableMediaPlayback: false,
            enableTextSelection: true,
            enableElementSelection: true,
            enableHyperlinks: true,
            onVisibleSlideChange: (index, total) => callbacks.onPositionChange({ index, total, unit: 'slide' }),
            onScaleChange: callbacks.onScaleChange,
            onError: callbacks.onRenderError
        })
        return {
            load: (source) => viewer.load(source),
            destroy: () => viewer.destroy(),
            getScale: () => viewer.getScale(),
            zoomIn: () => viewer.zoomIn(),
            zoomOut: () => viewer.zoomOut(),
            fitWidth: () => viewer.fitWidth(),
            fitPage: () => viewer.fitPage(),
            findText: async (query) => (await viewer.findText(query)).length,
            findNext: async () => { await viewer.findNext() },
            findPrevious: async () => { await viewer.findPrev() },
            clearFind: () => viewer.clearFind(),
            getPosition: () => ({ index: viewer.topVisibleSlide, total: viewer.slideCount, unit: 'slide' })
        }
    }

    const { XlsxViewer } = await import('@silurus/ooxml/xlsx')
    const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent-primary').trim() || '#8b5cf6'
    const viewer = new XlsxViewer(container, {
        mode: 'worker',
        useGoogleFonts: false,
        resizable: true,
        showScrollbars: true,
        showZoomSlider: false,
        selectionColor: accent,
        enableElementSelection: true,
        enableHyperlinks: true,
        onSheetChange: (index, total) => callbacks.onPositionChange({ index, total, unit: 'sheet' }),
        onScaleChange: callbacks.onScaleChange,
        onError: callbacks.onRenderError
    })
    return {
        load: (source) => viewer.load(source),
        destroy: () => viewer.destroy(),
        getScale: () => viewer.getScale(),
        zoomIn: () => viewer.zoomIn(),
        zoomOut: () => viewer.zoomOut(),
        fitWidth: () => viewer.fitWidth(),
        fitPage: () => viewer.fitPage(),
        findText: async (query) => (await viewer.findText(query)).length,
        findNext: async () => { await viewer.findNext() },
        findPrevious: async () => { await viewer.findPrev() },
        clearFind: () => viewer.clearFind(),
        getPosition: () => ({ index: viewer.sheetIndex, total: viewer.sheetCount, unit: 'sheet' })
    }
}
