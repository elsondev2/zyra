import { Check, ChevronDown, Minimize2, PanelLeft, PanelRight, Play, Square, Trash2, X } from 'lucide-react'
import { type ReactNode, useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { useSettings } from '@/lib/settings'
import type { PreviewFile, PreviewTab } from './types'
import type { ViewportPreset } from './viewport'
import { PreviewHeaderEditMenu } from './PreviewHeaderEditMenu'
import { PreviewHeaderHtmlControls } from './PreviewHeaderHtmlControls'
import { PreviewHeaderStatusActions } from './PreviewHeaderStatusActions'
import { PreviewTabStrip } from './PreviewTabStrip'

type PreviewExpandedHeaderBarProps = {
    file: PreviewFile
    showCloseButton?: boolean
    previewModeEnabled: boolean
    mode: 'preview' | 'edit'
    isEditable: boolean
    isDirty: boolean
    isSaving: boolean
    leftPanelOpen: boolean
    rightPanelOpen: boolean
    loadingEditableContent?: boolean
    viewport: ViewportPreset
    onViewportChange: (viewport: ViewportPreset) => void
    csvDistinctColorsEnabled: boolean
    onCsvDistinctColorsEnabledChange: (enabled: boolean) => void
    onOpenInBrowser: () => void
    onClose: () => void
    onModeChange: (mode: 'preview' | 'edit') => void
    onSave: () => void
    onRevert: () => void
    onToggleExpanded: () => void
    onToggleLeftPanel: () => void
    onToggleRightPanel: () => void
    canRunPython?: boolean
    pythonRunState?: 'idle' | 'running' | 'success' | 'failed' | 'stopped'
    pythonHasOutput?: boolean
    pythonRunMode?: 'terminal' | 'output'
    onRunPython?: () => void
    onStopPython?: () => void
    onClearPythonOutput?: () => void
    onPythonRunModeChange?: (mode: 'terminal' | 'output') => void
    previewTabs: PreviewTab[]
    activePreviewTabId: string | null
    onSelectPreviewTab: (tabId: string) => void
    onClosePreviewTab: (tabId: string) => void
    canCreateSiblingFile?: boolean
    onCreateSiblingFile?: () => void
}

type HeaderIconButtonProps = {
    active?: boolean
    disabled?: boolean
    title: string
    onClick?: () => void
    children: ReactNode
    tone?: 'default' | 'success' | 'warning'
    activeClassName?: string
}

function HeaderIconButton({
    active = false,
    disabled = false,
    title,
    onClick,
    children,
    tone = 'default',
    activeClassName
}: HeaderIconButtonProps) {
    const activeClass = activeClassName || (tone === 'success'
        ? 'bg-emerald-500/12 text-emerald-100'
        : tone === 'warning'
            ? 'bg-amber-500/12 text-amber-100'
            : 'bg-white/[0.07] text-white')
    const toneClass = disabled
        ? 'cursor-not-allowed text-white/25 hover:bg-transparent hover:text-white/25'
        : tone === 'success'
            ? 'text-emerald-200 hover:bg-emerald-500/10 hover:text-emerald-100'
            : tone === 'warning'
                ? 'text-amber-200 hover:bg-amber-500/10 hover:text-amber-100'
                : 'text-white/42 hover:bg-white/[0.05] hover:text-white/82'

    return (
        <button
            type="button"
            onClick={disabled ? undefined : onClick}
            disabled={disabled}
            title={title}
            className={cn(
                'inline-flex h-6 w-6 items-center justify-center rounded-md border transition-[opacity,color,background-color,border-color] duration-200',
                active ? 'opacity-100 border-white/[0.08]' : 'border-transparent opacity-62 hover:opacity-100',
                active ? activeClass : toneClass
            )}
        >
            {children}
        </button>
    )
}

export function PreviewExpandedHeaderBar({
    file,
    showCloseButton = true,
    previewModeEnabled,
    mode,
    isEditable,
    isDirty,
    isSaving,
    leftPanelOpen,
    rightPanelOpen,
    loadingEditableContent,
    viewport,
    onViewportChange,
    csvDistinctColorsEnabled,
    onCsvDistinctColorsEnabledChange,
    onOpenInBrowser,
    onClose,
    onModeChange,
    onSave,
    onRevert,
    onToggleExpanded,
    onToggleLeftPanel,
    onToggleRightPanel,
    canRunPython = false,
    pythonRunState = 'idle',
    pythonHasOutput = false,
    pythonRunMode = 'terminal',
    onRunPython,
    onStopPython,
    onClearPythonOutput,
    onPythonRunModeChange,
    previewTabs,
    activePreviewTabId,
    onSelectPreviewTab,
    onClosePreviewTab,
    canCreateSiblingFile = false,
    onCreateSiblingFile
}: PreviewExpandedHeaderBarProps) {
    const { settings } = useSettings()
    const iconTheme = settings.theme === 'light' ? 'light' : 'dark'
    const containerRef = useRef<HTMLDivElement | null>(null)
    const pythonRunModeMenuRef = useRef<HTMLDivElement | null>(null)
    const [headerWidth, setHeaderWidth] = useState(1280)
    const [pythonRunModeMenuOpen, setPythonRunModeMenuOpen] = useState(false)

    const isHtml = file.type === 'html'
    const isCsv = file.type === 'csv'
    const isMediaFile = file.type === 'image' || file.type === 'video' || file.type === 'audio'
    const isEditMode = mode === 'edit'
    const isPythonRunning = pythonRunState === 'running'
    const showEditMenu = !isMediaFile && (previewModeEnabled || isEditable)
    const isCompactHtmlHeader = isHtml && headerWidth < 1100
    const isVeryCompactHtmlHeader = isHtml && headerWidth < 860
    const isUltraCompactHtmlHeader = isHtml && headerWidth < 720
    useEffect(() => {
        const node = containerRef.current
        if (!node) return

        const updateWidth = () => setHeaderWidth(node.clientWidth || 1280)
        updateWidth()

        const observer = new ResizeObserver(updateWidth)
        observer.observe(node)
        return () => observer.disconnect()
    }, [])

    useEffect(() => {
        if (!pythonRunModeMenuOpen) return

        const handlePointerDown = (event: MouseEvent) => {
            const target = event.target as Node | null
            if (!pythonRunModeMenuRef.current?.contains(target)) {
                setPythonRunModeMenuOpen(false)
            }
        }

        const handleEscape = (event: KeyboardEvent) => {
            if (event.key === 'Escape') setPythonRunModeMenuOpen(false)
        }

        window.addEventListener('mousedown', handlePointerDown)
        window.addEventListener('keydown', handleEscape)
        return () => {
            window.removeEventListener('mousedown', handlePointerDown)
            window.removeEventListener('keydown', handleEscape)
        }
    }, [pythonRunModeMenuOpen])

    return (
        <div
            ref={containerRef}
            className="group/header relative z-30 flex h-9 min-h-9 items-stretch justify-between gap-2 overflow-visible border-b border-white/[0.06] bg-[#0a0f16]/98 px-0"
        >
            <div className="flex min-w-0 flex-1 items-stretch gap-2 overflow-hidden">
                <div className="flex min-w-0 flex-1 items-stretch overflow-hidden">
                    <PreviewTabStrip
                        tabs={previewTabs}
                        activeTabId={activePreviewTabId}
                        activeTabDirty={isDirty}
                        iconTheme={iconTheme}
                        canCreateSiblingFile={canCreateSiblingFile}
                        onSelectTab={onSelectPreviewTab}
                        onCloseTab={onClosePreviewTab}
                        onCreateSiblingFile={onCreateSiblingFile}
                    />
                </div>

                {isHtml && !isEditMode ? (
                    <PreviewHeaderHtmlControls
                        isCompactHtmlHeader={isCompactHtmlHeader}
                        isVeryCompactHtmlHeader={isVeryCompactHtmlHeader}
                        isUltraCompactHtmlHeader={isUltraCompactHtmlHeader}
                        isIdeChrome={true}
                        viewport={viewport}
                        onViewportChange={onViewportChange}
                    />
                ) : null}

                <PreviewHeaderStatusActions
                    isEditMode={isEditMode}
                    isHtml={isHtml}
                    isCsv={isCsv}
                    csvDistinctColorsEnabled={csvDistinctColorsEnabled}
                    onCsvDistinctColorsEnabledChange={onCsvDistinctColorsEnabledChange}
                    onOpenInBrowser={onOpenInBrowser}
                    onClose={onClose}
                    showCloseButton={false}
                    isIdeChrome={true}
                    controlGroupClass=""
                />
            </div>

            <div className="flex shrink-0 items-center gap-0.5">
                {!isMediaFile && canRunPython ? (
                    <>
                        <div ref={pythonRunModeMenuRef} className="relative flex items-center gap-0.5">
                            <HeaderIconButton
                                active={isPythonRunning}
                                title={isPythonRunning ? 'Stop Python run' : `Run Python (${pythonRunMode === 'terminal' ? 'terminal' : 'output'})`}
                                onClick={isPythonRunning ? onStopPython : onRunPython}
                                tone={isPythonRunning ? 'warning' : 'success'}
                            >
                                {isPythonRunning ? <Square size={13} /> : <Play size={13} />}
                            </HeaderIconButton>
                            <HeaderIconButton
                                active={pythonRunModeMenuOpen}
                                title="Choose Python run mode"
                                onClick={() => setPythonRunModeMenuOpen((current) => !current)}
                            >
                                <ChevronDown size={12} className={cn('transition-transform', pythonRunModeMenuOpen && 'rotate-180')} />
                            </HeaderIconButton>

                            {pythonRunModeMenuOpen ? (
                                <div className="absolute right-0 top-7 z-40 w-44 rounded-lg border border-white/[0.08] bg-[#111927] p-1 shadow-2xl shadow-black/60">
                                    <button
                                        type="button"
                                        onClick={() => {
                                            onPythonRunModeChange?.('terminal')
                                            setPythonRunModeMenuOpen(false)
                                        }}
                                        className={cn(
                                            'flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-xs transition-colors',
                                            pythonRunMode === 'terminal'
                                                ? 'bg-white/[0.08] text-white'
                                                : 'text-white/68 hover:bg-white/[0.05] hover:text-white'
                                        )}
                                    >
                                        <span>Run in Terminal</span>
                                        {pythonRunMode === 'terminal' ? <Check size={12} /> : null}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            onPythonRunModeChange?.('output')
                                            setPythonRunModeMenuOpen(false)
                                        }}
                                        className={cn(
                                            'mt-0.5 flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-xs transition-colors',
                                            pythonRunMode === 'output'
                                                ? 'bg-white/[0.08] text-white'
                                                : 'text-white/68 hover:bg-white/[0.05] hover:text-white'
                                        )}
                                    >
                                        <span>Run in Output</span>
                                        {pythonRunMode === 'output' ? <Check size={12} /> : null}
                                    </button>
                                </div>
                            ) : null}
                        </div>

                        <HeaderIconButton
                            disabled={!pythonHasOutput && !isPythonRunning}
                            title="Clear run output"
                            onClick={onClearPythonOutput}
                        >
                            <Trash2 size={13} />
                        </HeaderIconButton>
                    </>
                ) : null}

                <HeaderIconButton
                    active={leftPanelOpen}
                    title={leftPanelOpen ? 'Hide left panel' : 'Show left panel'}
                    onClick={onToggleLeftPanel}
                    activeClassName="border-white/70 bg-white text-[#0a0f16] opacity-100"
                >
                    <PanelLeft size={15} />
                </HeaderIconButton>
                <HeaderIconButton
                    active={rightPanelOpen}
                    title={rightPanelOpen ? 'Hide right panel' : 'Show right panel'}
                    onClick={onToggleRightPanel}
                    activeClassName="border-white/70 bg-white text-[#0a0f16] opacity-100"
                >
                    <PanelRight size={15} />
                </HeaderIconButton>
                <HeaderIconButton
                    active={true}
                    title="Return to windowed view"
                    onClick={onToggleExpanded}
                    activeClassName="bg-white/[0.08] text-white opacity-100"
                >
                    <Minimize2 size={14} />
                </HeaderIconButton>
                {showEditMenu ? (
                    <PreviewHeaderEditMenu
                        previewModeEnabled={previewModeEnabled}
                        isEditable={isEditable}
                        isEditMode={isEditMode}
                        isDirty={isDirty}
                        isSaving={isSaving}
                        loadingEditableContent={loadingEditableContent}
                        onModeChange={onModeChange}
                        onSave={onSave}
                        onRevert={onRevert}
                    />
                ) : null}
                {showCloseButton ? (
                    <HeaderIconButton
                        title="Close preview"
                        onClick={onClose}
                    >
                        <X size={14} />
                    </HeaderIconButton>
                ) : null}
            </div>
        </div>
    )
}
