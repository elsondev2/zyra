import { Check, ChevronDown, Copy, Expand, Play, Square, Trash2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { VscodeEntryIcon } from '@/components/ui/VscodeEntryIcon'
import { useSettings } from '@/lib/settings'
import type { PreviewFile, PreviewTab } from './types'
import type { ViewportPreset } from './viewport'
import { PreviewExpandedHeaderBar } from './PreviewExpandedHeaderBar'
import { PreviewHeaderEditMenu } from './PreviewHeaderEditMenu'
import { PreviewHeaderStatusActions } from './PreviewHeaderStatusActions'
import { PreviewHeaderHtmlControls } from './PreviewHeaderHtmlControls'

interface PreviewModalHeaderProps {
    file: PreviewFile
    showCloseButton?: boolean
    previewModeEnabled: boolean
    mode: 'preview' | 'edit'
    isEditable: boolean
    isDirty: boolean
    isSaving: boolean
    isExpanded: boolean
    allowExpanded?: boolean
    leftPanelOpen: boolean
    rightPanelOpen: boolean
    loadingEditableContent?: boolean
    onModeChange: (mode: 'preview' | 'edit') => void
    onSave: () => void
    onRevert: () => void
    onToggleExpanded: () => void
    onToggleLeftPanel: () => void
    onToggleRightPanel: () => void
    viewport: ViewportPreset
    onViewportChange: (viewport: ViewportPreset) => void
    csvDistinctColorsEnabled: boolean
    onCsvDistinctColorsEnabledChange: (enabled: boolean) => void
    onOpenInBrowser: () => void
    onClose: () => void
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

function formatPreviewFileName(name: string, maxLength: number): string {
    const raw = String(name || '').trim()
    if (!raw || raw.length <= maxLength) return raw

    const dotIndex = raw.lastIndexOf('.')
    const hasExtension = dotIndex > 0 && dotIndex < raw.length - 1
    const extension = hasExtension ? raw.slice(dotIndex) : ''
    const baseName = hasExtension ? raw.slice(0, dotIndex) : raw
    const budget = Math.max(8, maxLength - extension.length - 3)
    const startLength = Math.max(4, Math.ceil(budget * 0.6))
    const endLength = Math.max(3, budget - startLength)

    if (baseName.length <= startLength + endLength + 3) return raw
    return `${baseName.slice(0, startLength)}...${baseName.slice(-endLength)}${extension}`
}

export default function PreviewModalHeader(props: PreviewModalHeaderProps) {
    if (props.isExpanded) {
        return (
            <PreviewExpandedHeaderBar
                file={props.file}
                showCloseButton={props.showCloseButton}
                previewModeEnabled={props.previewModeEnabled}
                mode={props.mode}
                isEditable={props.isEditable}
                isDirty={props.isDirty}
                isSaving={props.isSaving}
                leftPanelOpen={props.leftPanelOpen}
                rightPanelOpen={props.rightPanelOpen}
                loadingEditableContent={props.loadingEditableContent}
                viewport={props.viewport}
                onViewportChange={props.onViewportChange}
                csvDistinctColorsEnabled={props.csvDistinctColorsEnabled}
                onCsvDistinctColorsEnabledChange={props.onCsvDistinctColorsEnabledChange}
                onOpenInBrowser={props.onOpenInBrowser}
                onClose={props.onClose}
                onModeChange={props.onModeChange}
                onSave={props.onSave}
                onRevert={props.onRevert}
                onToggleExpanded={props.onToggleExpanded}
                onToggleLeftPanel={props.onToggleLeftPanel}
                onToggleRightPanel={props.onToggleRightPanel}
                canRunPython={props.canRunPython}
                pythonRunState={props.pythonRunState}
                pythonHasOutput={props.pythonHasOutput}
                pythonRunMode={props.pythonRunMode}
                onRunPython={props.onRunPython}
                onStopPython={props.onStopPython}
                onClearPythonOutput={props.onClearPythonOutput}
                onPythonRunModeChange={props.onPythonRunModeChange}
                previewTabs={props.previewTabs}
                activePreviewTabId={props.activePreviewTabId}
                onSelectPreviewTab={props.onSelectPreviewTab}
                onClosePreviewTab={props.onClosePreviewTab}
                canCreateSiblingFile={props.canCreateSiblingFile}
                onCreateSiblingFile={props.onCreateSiblingFile}
            />
        )
    }

    return <PreviewWindowedHeader {...props} />
}

function PreviewWindowedHeader({
    file,
    showCloseButton = true,
    previewModeEnabled,
    mode,
    isEditable,
    isDirty,
    isSaving,
    isExpanded,
    allowExpanded = true,
    loadingEditableContent,
    onModeChange,
    onSave,
    onRevert,
    onToggleExpanded,
    viewport,
    onViewportChange,
    csvDistinctColorsEnabled,
    onCsvDistinctColorsEnabledChange,
    onOpenInBrowser,
    onClose,
    canRunPython = false,
    pythonRunState = 'idle',
    pythonHasOutput = false,
    pythonRunMode = 'terminal',
    onRunPython,
    onStopPython,
    onClearPythonOutput,
    onPythonRunModeChange
}: PreviewModalHeaderProps) {
    const { settings } = useSettings()
    const iconTheme = settings.theme === 'light' ? 'light' : 'dark'
    const isHtml = file.type === 'html'
    const isCsv = file.type === 'csv'
    const isMediaFile = file.type === 'image' || file.type === 'video' || file.type === 'audio'
    const isEditMode = mode === 'edit'
    const isPythonRunning = pythonRunState === 'running'
    const containerRef = useRef<HTMLDivElement | null>(null)
    const pythonRunModeMenuRef = useRef<HTMLDivElement | null>(null)
    const [headerWidth, setHeaderWidth] = useState(1280)
    const [copied, setCopied] = useState(false)
    const [pythonRunModeMenuOpen, setPythonRunModeMenuOpen] = useState(false)

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
            if (!pythonRunModeMenuRef.current?.contains(target)) setPythonRunModeMenuOpen(false)
        }
        window.addEventListener('mousedown', handlePointerDown)
        return () => window.removeEventListener('mousedown', handlePointerDown)
    }, [pythonRunModeMenuOpen])

    const handleCopyPath = () => {
        navigator.clipboard.writeText(file.path)
        setCopied(true)
        window.setTimeout(() => setCopied(false), 1500)
    }

    const isCompactHtmlHeader = isHtml && headerWidth < 1024
    const isVeryCompactHtmlHeader = isHtml && headerWidth < 820
    const isUltraCompactHtmlHeader = isHtml && headerWidth < 680
    const isCompactHeader = headerWidth < 980
    const visibleFileName = formatPreviewFileName(file.name, headerWidth < 760 ? 26 : headerWidth < 980 ? 36 : 52)

    const controlGroupClass = 'flex items-center gap-0.5 rounded-md border border-white/10 bg-white/[0.035] p-0.5 shrink-0'
    const iconButtonBaseClass = 'inline-flex h-6 w-6 items-center justify-center rounded-md border transition-colors'
    const ghostIconButtonClass = `${iconButtonBaseClass} border-transparent text-white/55 hover:bg-white/10 hover:text-white`
    const activeIconButtonClass = `${iconButtonBaseClass} border-white/15 bg-white/10 text-white`
    const showWindowedEditMenu = !isMediaFile && (previewModeEnabled || isEditable)

    return (
        <div
            ref={containerRef}
            className={cn(
                'flex items-center justify-between gap-2 border-b border-white/5 bg-white/[0.02] shrink-0',
                isCompactHeader
                    ? cn('flex-wrap py-1', showCloseButton ? 'pl-2.5 pr-0' : 'px-2.5')
                    : cn('py-1', showCloseButton ? 'pl-3.5 pr-0' : 'px-3.5'),
                isUltraCompactHtmlHeader ? 'gap-2' : ''
            )}
        >
            <div className={cn('flex items-center gap-2 min-w-0', isCompactHeader ? 'flex-1 flex-wrap w-full' : '', isUltraCompactHtmlHeader ? 'w-full' : '')}>
                <VscodeEntryIcon
                    pathValue={file.path || file.name}
                    kind="file"
                    theme={iconTheme}
                    className="size-4 shrink-0"
                />
                <div className="min-w-0 flex items-center gap-1.5">
                    <h3 className="truncate text-[13px] font-semibold text-white" title={file.name}>
                        {visibleFileName}
                    </h3>
                    <button
                        onClick={handleCopyPath}
                        className={cn(
                            'p-1 rounded transition-all shrink-0',
                            copied ? 'text-emerald-400 bg-emerald-400/10' : 'text-white/40 hover:text-white hover:bg-white/10'
                        )}
                        title={copied ? 'Copied!' : `Copy path: ${file.path}`}
                    >
                        {copied ? <Check size={14} /> : <Copy size={14} />}
                    </button>
                </div>

                {showWindowedEditMenu ? (
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

                {!isMediaFile && canRunPython ? (
                    <div className={controlGroupClass}>
                        <div ref={pythonRunModeMenuRef} className="relative inline-flex items-center rounded-lg border border-white/10 bg-black/10">
                            <button
                                type="button"
                                onClick={isPythonRunning ? onStopPython : onRunPython}
                                className={cn(
                                    'inline-flex h-6 w-6 items-center justify-center rounded-l-md transition-colors',
                                    isPythonRunning ? 'bg-amber-500/15 text-amber-200 hover:bg-amber-500/25' : 'bg-emerald-500/15 text-emerald-200 hover:bg-emerald-500/25'
                                )}
                                title={isPythonRunning ? 'Stop Python run' : `Run Python (${pythonRunMode === 'terminal' ? 'terminal' : 'output'})`}
                            >
                                {isPythonRunning ? <Square size={13} /> : <Play size={13} />}
                            </button>
                            <button
                                type="button"
                                onClick={() => setPythonRunModeMenuOpen((current) => !current)}
                                className="inline-flex h-6 w-5 items-center justify-center rounded-r-md border-l border-white/10 text-white/70 transition-colors hover:bg-white/10 hover:text-white"
                                title="Choose run mode"
                                aria-expanded={pythonRunModeMenuOpen}
                            >
                                <ChevronDown size={12} className={cn('transition-transform', pythonRunModeMenuOpen && 'rotate-180')} />
                            </button>

                            {pythonRunModeMenuOpen ? (
                                <div className="absolute right-0 top-7 z-40 w-44 rounded-lg border border-white/10 bg-sparkle-card p-1.5 shadow-2xl">
                                    <button
                                        type="button"
                                        onClick={() => {
                                            onPythonRunModeChange?.('terminal')
                                            setPythonRunModeMenuOpen(false)
                                        }}
                                        className={cn(
                                            'flex w-full items-center justify-between rounded-md px-2 py-1.5 text-xs transition-colors',
                                            pythonRunMode === 'terminal'
                                                ? 'bg-[var(--accent-primary)]/20 text-[var(--accent-primary)]'
                                                : 'text-sparkle-text-secondary hover:bg-white/[0.03] hover:text-sparkle-text'
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
                                            'mt-0.5 flex w-full items-center justify-between rounded-md px-2 py-1.5 text-xs transition-colors',
                                            pythonRunMode === 'output'
                                                ? 'bg-[var(--accent-primary)]/20 text-[var(--accent-primary)]'
                                                : 'text-sparkle-text-secondary hover:bg-white/[0.03] hover:text-sparkle-text'
                                        )}
                                    >
                                        <span>Run in Output</span>
                                        {pythonRunMode === 'output' ? <Check size={12} /> : null}
                                    </button>
                                </div>
                            ) : null}
                        </div>

                        <button
                            type="button"
                            onClick={onClearPythonOutput}
                            disabled={!pythonHasOutput && !isPythonRunning}
                            className={cn(
                                ghostIconButtonClass,
                                (pythonHasOutput || isPythonRunning)
                                    ? ''
                                    : 'cursor-not-allowed border-transparent text-white/25 hover:bg-transparent hover:text-white/25'
                            )}
                            title="Clear run output"
                        >
                            <Trash2 size={13} />
                        </button>
                    </div>
                ) : null}

                {!isMediaFile && allowExpanded ? (
                    <div className={controlGroupClass}>
                        <button
                            onClick={onToggleExpanded}
                            className={cn(isExpanded ? activeIconButtonClass : ghostIconButtonClass)}
                            title={isExpanded ? 'Return to windowed view' : 'Expand workspace'}
                        >
                            <span className="relative block h-4 w-4">
                                <Expand
                                    size={16}
                                    className={cn(
                                        'absolute inset-0 transition-all duration-250 ease-out',
                                        isExpanded ? 'scale-[0.9] rotate-180 opacity-100' : 'scale-100 rotate-0 opacity-100'
                                    )}
                                />
                            </span>
                        </button>
                    </div>
                ) : null}
            </div>

            {isHtml && !isEditMode ? (
                <PreviewHeaderHtmlControls
                    isCompactHtmlHeader={isCompactHtmlHeader}
                    isVeryCompactHtmlHeader={isVeryCompactHtmlHeader}
                    isUltraCompactHtmlHeader={isUltraCompactHtmlHeader}
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
                showCloseButton={showCloseButton}
                controlGroupClass={controlGroupClass}
            />
        </div>
    )
}
