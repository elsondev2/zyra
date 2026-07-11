import { useCallback, useEffect, useMemo } from 'react'
import {
    DndContext,
    DragOverlay,
    closestCenter,
    pointerWithin,
} from '@dnd-kit/core'
import { createPortal } from 'react-dom'
import { getParentFolderPath } from '@/lib/filesystem/fileSystemPaths'
import { useSettings } from '@/lib/settings'
import { isEditableFileType, PREVIEW_TERMINAL_MIN_HEIGHT } from './file-preview/modalShared'
import type { FilePreviewModalProps } from './file-preview/modalTypes'
import { PreviewModalLayout } from './file-preview/PreviewModalLayout'
import { PreviewPythonOutputPanel } from './file-preview/PreviewPythonOutputPanel'
import { PreviewTerminalPanel } from './file-preview/PreviewTerminalPanel'
import { useFilePreviewModalAnalysis } from './file-preview/useFilePreviewModalAnalysis'
import { useFilePreviewModalInteractions } from './file-preview/useFilePreviewModalInteractions'
import { useFilePreview } from './file-preview/useFilePreview'
import { useFilePreviewChrome } from './file-preview/useFilePreviewChrome'
import { useFilePreviewEditSession } from './file-preview/useFilePreviewEditSession'
import { useFilePreviewPython } from './file-preview/useFilePreviewPython'
import { useFilePreviewTerminal } from './file-preview/useFilePreviewTerminal'
import { usePreviewSiblingMediaItems } from './file-preview/usePreviewSiblingMediaItems'

export function FilePreviewModal({
    file,
    previewTabs,
    activePreviewTabId,
    content,
    loading,
    truncated,
    size,
    previewBytes,
    modifiedAt,
    projectPath,
    shellMode = 'modal',
    disableFullscreen = false,
    onOpenLinkedPreview,
    onOpenLinkedPreviewInNewTab,
    onSelectPreviewTab,
    onClosePreviewTab,
    onReorderPreviewTabs,
    mediaItems = [],
    onSaved,
    onClose
}: FilePreviewModalProps) {
    const { settings, updateSettings } = useSettings()
    const isCsv = file.type === 'csv'
    const isHtml = file.type === 'html'
    const previewModeEnabled = file.type === 'md' || file.type === 'csv' || file.type === 'html'
    const canEdit = isEditableFileType(file.type)
    const defaultMode: 'preview' | 'edit' = !previewModeEnabled && canEdit
        ? 'edit'
        : canEdit ? settings.filePreviewDefaultMode : 'preview'
    const initialMode: 'preview' | 'edit' = (file.startInEditMode && canEdit) || (!previewModeEnabled && canEdit) ? 'edit' : defaultMode
    const defaultStartExpanded = disableFullscreen ? false : settings.filePreviewOpenInFullscreen
    const defaultLeftPanelOpen = settings.filePreviewFullscreenShowLeftPanel
    const defaultRightPanelOpen = settings.filePreviewFullscreenShowRightPanel
    const canRunPython = file.type === 'code'
        && (file.language === 'python' || /\.py$/i.test(file.name) || /\.py$/i.test(file.path))
    const canUsePreviewTerminal = Boolean(projectPath || file.path)
    const resolvedPreviewTabs = useMemo(
        () => (previewTabs && previewTabs.length > 0 ? previewTabs : [{ id: file.path || file.name, file }]),
        [file, previewTabs]
    )
    const resolvedActivePreviewTabId = activePreviewTabId ?? resolvedPreviewTabs[0]?.id ?? null
    const createDestinationDirectory = useMemo(
        () => getParentFolderPath(file.path) || projectPath || '',
        [file.path, projectPath]
    )
    const canCreateSiblingFile = Boolean(createDestinationDirectory && onOpenLinkedPreview)
    const effectiveMediaItems = usePreviewSiblingMediaItems({
        file,
        projectPath,
        mediaItems
    })
    const terminalInitialHeight = Math.max(
        PREVIEW_TERMINAL_MIN_HEIGHT,
        Math.min(720, Math.round(settings.filePreviewTerminalPanelHeight || 220))
    )

    const {
        mode,
        setMode,
        gitDiffText,
        gitDiffSummary,
        sourceContent,
        draftContent,
        setDraftContent,
        loadingEditableContent,
        isSaving,
        saveError,
        setSaveError,
        showUnsavedModal,
        conflictModifiedAt,
        setConflictModifiedAt,
        isDirty,
        dismissUnsavedChanges,
        discardUnsavedChanges,
        confirmUnsavedChanges,
        handleSave,
        ensureEditableContentLoaded,
        reloadFromDisk,
        overwriteOnConflict,
        requestIntent,
        requestExternalIntent,
        handleCloseRequest
    } = useFilePreviewEditSession({
        file,
        content,
        truncated,
        modifiedAt: modifiedAt ?? undefined,
        projectPath,
        canEdit,
        initialMode,
        onSaved,
        onClose
    })

    const {
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
        presetConfig
    } = useFilePreviewChrome({
        defaultStartExpanded,
        defaultLeftPanelOpen,
        defaultRightPanelOpen,
        initialFocusLine: file.focusLine ?? null,
        initialFocusLineRequestId: file.focusLineRequestId ?? null
    })
    const effectiveIsExpanded = disableFullscreen ? false : isExpanded

    useEffect(() => {
        if (!disableFullscreen || !isExpanded) return
        setIsExpanded(false)
    }, [disableFullscreen, isExpanded, setIsExpanded])

    const {
        setTerminalVisible,
        terminalSessions,
        terminalState,
        terminalPanelPhase,
        terminalGroupKey,
        terminalHeight,
        terminalError,
        terminalShellLabel,
        terminalNewShell,
        setTerminalNewShell,
        currentTerminalSession,
        terminalTheme,
        terminalHostRef,
        shouldShowTerminalPanel,
        renderTerminalPanel,
        queueTerminalCommand,
        clearTerminalOutput,
        focusTerminal,
        createPreviewTerminalSession,
        stopPreviewTerminalSession,
        selectPreviewTerminalSession,
        startTerminalResize
    } = useFilePreviewTerminal({
        canUsePreviewTerminal,
        file,
        projectPath,
        defaultShell: settings.defaultShell,
        accentColorPrimary: settings.accentColor.primary,
        themeKey: settings.theme,
        initialHeight: terminalInitialHeight,
        persistHeight: (height) => {
            if (settings.filePreviewTerminalPanelHeight === height) return
            updateSettings({ filePreviewTerminalPanelHeight: height })
        }
    })

    const {
        pythonRunState,
        pythonRunMode,
        setPythonRunMode,
        pythonOutputEntries,
        pythonInterpreter,
        pythonCommand,
        pythonOutputVisible,
        pythonOutputHeight,
        pythonShowTimestamps,
        setPythonShowTimestamps,
        pythonOutputScrollRef,
        handleRunPython,
        stopPythonRun,
        clearPythonOutput,
        startPythonOutputResize
    } = useFilePreviewPython({
        canRunPython,
        file,
        projectPath,
        mode,
        isDirty,
        defaultRunMode: settings.filePreviewPythonRunMode,
        handleSave,
        queueTerminalCommand,
        defaultShell: settings.defaultShell
    })

    const {
        folderTreeRefreshToken,
        preserveSidebarContextRequest,
        dndSensors,
        openMediaItem,
        handleInternalMarkdownLink,
        handleSelectPreviewTab,
        handleClosePreviewTab,
        handleOpenLinkedPreview,
        handleOpenLinkedPreviewInNewTab,
        handleOpenInBrowser,
        handleOpenCreateSiblingFileModal,
        handlePreviewDragStart,
        handlePreviewDragCancel,
        handlePreviewDragEnd,
        dragOverlay,
        createFileModal
    } = useFilePreviewModalInteractions({
        file,
        mediaItems: effectiveMediaItems,
        settingsTheme: settings.theme,
        resolvedActivePreviewTabId,
        createDestinationDirectory,
        canCreateSiblingFile,
        onOpenLinkedPreview,
        onOpenLinkedPreviewInNewTab,
        onSelectPreviewTab,
        onClosePreviewTab,
        onReorderPreviewTabs,
        requestExternalIntent
    })

    useEffect(() => {
        const originalOverflow = document.body.style.overflow
        document.body.style.overflow = 'hidden'
        return () => {
            document.body.style.overflow = originalOverflow
        }
    }, [])

    useEffect(() => {
        if (settings.filePreviewPythonRunMode === pythonRunMode) return
        updateSettings({ filePreviewPythonRunMode: pythonRunMode })
    }, [pythonRunMode, settings.filePreviewPythonRunMode, updateSettings])

    const handleModeChange = useCallback(async (nextMode: 'preview' | 'edit') => {
        if (nextMode === mode) return
        if (!previewModeEnabled && nextMode === 'preview') return
        if (nextMode === 'preview') {
            requestIntent('preview')
            return
        }
        if (!canEdit) return
        const loaded = await ensureEditableContentLoaded()
        if (!loaded) return
        setMode('edit')
    }, [canEdit, ensureEditableContentLoaded, mode, previewModeEnabled, requestIntent, setMode])

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'e' && canEdit && previewModeEnabled) {
                event.preventDefault()
                void handleModeChange(mode === 'edit' ? 'preview' : 'edit')
                return
            }
            if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's' && mode === 'edit') {
                event.preventDefault()
                void handleSave()
                return
            }
            if (event.key === 'Escape') {
                event.preventDefault()
                handleCloseRequest()
            }
        }

        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [canEdit, handleCloseRequest, handleModeChange, handleSave, mode, previewModeEnabled])


    const {
        totalFileLines,
        isCompactHtmlViewport,
        isHtmlRenderedPreview,
        previewResetKey,
        localDiffPreview,
        outlineItems,
        longLineCount,
        trailingWhitespaceCount,
        jsonDiagnostic,
        isEditorToolsEnabled,
        getEditorToolButtonClass,
        handleOutlineItemSelect
    } = useFilePreviewModalAnalysis({
        file,
        mode,
        isExpanded: effectiveIsExpanded,
        rightPanelOpen,
        viewport,
        presetWidth: presetConfig.width,
        sourceContent,
        draftContent,
        isDirty,
        previewSurfaceRef,
        setFocusLine
    })
    const showPythonOutputPanel = canRunPython && (pythonOutputVisible || pythonRunState !== 'idle')
    const hasBottomPanel = showPythonOutputPanel
    const centerHtmlRenderedPreview = isHtmlRenderedPreview && !hasBottomPanel
    const flushResponsiveHtmlPreview = isHtmlRenderedPreview && viewport === 'responsive' && !effectiveIsExpanded

    const pythonOutputPanel = showPythonOutputPanel ? (
        <PreviewPythonOutputPanel fileName={file.name} visible={showPythonOutputPanel} runState={pythonRunState} interpreter={pythonInterpreter} command={pythonCommand} entries={pythonOutputEntries} height={pythonOutputHeight} showTimestamps={pythonShowTimestamps} scrollRef={pythonOutputScrollRef} onResizeStart={startPythonOutputResize} onToggleTimestamps={() => setPythonShowTimestamps((current) => !current)} onClear={clearPythonOutput} />
    ) : null

    const terminalPanel = renderTerminalPanel ? (
        <PreviewTerminalPanel
            render={renderTerminalPanel}
            phase={terminalPanelPhase}
            height={terminalHeight}
            state={terminalState}
            shellLabel={terminalShellLabel}
            sessions={terminalSessions}
            groupKey={terminalGroupKey}
            currentSession={currentTerminalSession}
            themeBackground={terminalTheme.background}
            hostRef={terminalHostRef}
            onHostInteract={focusTerminal}
            error={terminalError}
            onResizeStart={startTerminalResize}
            newShell={terminalNewShell}
            onNewShellChange={setTerminalNewShell}
            onNew={(shell) => { void createPreviewTerminalSession(shell) }}
            onClear={clearTerminalOutput}
            onStop={(sessionId) => { void stopPreviewTerminalSession(sessionId) }}
            onMinimize={() => setTerminalVisible(false)}
            onSelect={selectPreviewTerminalSession}
        />
    ) : null
    const previewBottomOverlayPadding = 0

    const modalContent = (
        <PreviewModalLayout
            file={file}
            shellMode={shellMode}
            loading={loading}
            truncated={truncated}
            size={size ?? undefined}
            previewBytes={previewBytes ?? undefined}
            projectPath={projectPath}
            mediaItems={effectiveMediaItems}
            openMediaItem={openMediaItem}
            onInternalLinkClick={handleInternalMarkdownLink}
            mode={mode}
            isExpanded={effectiveIsExpanded}
            allowExpanded={!disableFullscreen}
            canEdit={canEdit}
            isDirty={isDirty}
            isSaving={isSaving}
            leftPanelOpen={leftPanelOpen}
            rightPanelOpen={rightPanelOpen}
            leftPanelWidth={leftPanelWidth}
            rightPanelWidth={rightPanelWidth}
            isResizingPanels={isResizingPanels}
            setFindRequestToken={setFindRequestToken}
            setReplaceRequestToken={setReplaceRequestToken}
            findRequestToken={findRequestToken}
            replaceRequestToken={replaceRequestToken}
            editorWordWrap={editorWordWrap}
            setEditorWordWrap={setEditorWordWrap}
            editorMinimapEnabled={editorMinimapEnabled}
            setEditorMinimapEnabled={setEditorMinimapEnabled}
            editorFontSize={editorFontSize}
            setEditorFontSize={setEditorFontSize}
            focusLine={focusLine}
            saveError={saveError}
            sourceContent={sourceContent}
            draftContent={draftContent}
            onDraftContentChange={(nextValue) => {
                setDraftContent(nextValue)
                if (saveError) setSaveError(null)
            }}
            loadingEditableContent={loadingEditableContent}
            viewport={viewport}
            setViewport={setViewport}
            csvDistinctColorsEnabled={csvDistinctColorsEnabled}
            setCsvDistinctColorsEnabled={setCsvDistinctColorsEnabled}
            pythonRunState={pythonRunState}
            pythonRunMode={pythonRunMode}
            pythonHasOutput={pythonOutputEntries.length > 0}
            setPythonRunMode={setPythonRunMode}
            canRunPython={canRunPython}
            onRunPython={handleRunPython}
            onStopPython={stopPythonRun}
            onClearPythonOutput={clearPythonOutput}
            onOpenInBrowser={handleOpenInBrowser}
            gitDiffText={gitDiffText}
            gitDiffSummary={gitDiffSummary}
            liveDiffPreview={localDiffPreview}
            totalFileLines={totalFileLines}
            handleModeChange={handleModeChange}
            handleSave={handleSave}
            handleRevert={() => { setDraftContent(sourceContent); setSaveError(null) }}
            handleCloseRequest={handleCloseRequest}
            setIsExpanded={setIsExpanded}
            setLeftPanelOpen={setLeftPanelOpen}
            setRightPanelOpen={setRightPanelOpen}
            modalStyle={modalStyle}
            previewSurfaceRef={previewSurfaceRef}
            previewResetKey={previewResetKey}
            lineMarkersOverride={localDiffPreview?.markers}
            presetConfig={presetConfig}
            isCsv={isCsv}
            isHtml={isHtml}
            isCompactHtmlViewport={isCompactHtmlViewport}
            centerHtmlRenderedPreview={centerHtmlRenderedPreview}
            flushResponsiveHtmlPreview={flushResponsiveHtmlPreview}
            hasBottomPanel={hasBottomPanel}
            outlineItems={outlineItems}
            onOutlineSelect={handleOutlineItemSelect}
            onMinimizeLeftPanel={() => setLeftPanelOpen(false)}
            onOpenLinkedPreview={handleOpenLinkedPreview}
            onOpenLinkedPreviewInNewTab={handleOpenLinkedPreviewInNewTab}
            folderTreeRefreshToken={folderTreeRefreshToken}
            preserveSidebarContextRequest={preserveSidebarContextRequest}
            previewTabs={resolvedPreviewTabs}
            activePreviewTabId={resolvedActivePreviewTabId}
            onSelectPreviewTab={handleSelectPreviewTab}
            onClosePreviewTab={handleClosePreviewTab}
            canCreateSiblingFile={canCreateSiblingFile}
            onCreateSiblingFile={handleOpenCreateSiblingFileModal}
            longLineCount={longLineCount}
            trailingWhitespaceCount={trailingWhitespaceCount}
            jsonDiagnostic={jsonDiagnostic}
            isEditorToolsEnabled={isEditorToolsEnabled}
            getEditorToolButtonClass={getEditorToolButtonClass}
            pythonPanel={pythonOutputPanel}
            previewBottomOverlay={terminalPanel}
            previewBottomOverlayPadding={previewBottomOverlayPadding}
            showUnsavedModal={showUnsavedModal}
            conflictModifiedAt={conflictModifiedAt}
            previewModeEnabled={previewModeEnabled}
            dismissUnsaved={dismissUnsavedChanges}
            discardUnsaved={discardUnsavedChanges}
            confirmUnsaved={confirmUnsavedChanges}
            dismissConflict={() => setConflictModifiedAt(null)}
            reloadConflict={async () => { if (await reloadFromDisk()) setConflictModifiedAt(null) }}
            overwriteConflict={async () => { if (await overwriteOnConflict()) setConflictModifiedAt(null) }}
        />
    )

    const modalWithDnd = (
        <DndContext
            sensors={dndSensors}
            collisionDetection={(args) => {
                const pointerCollisions = pointerWithin(args)
                if (pointerCollisions.length > 0) return pointerCollisions
                return closestCenter(args)
            }}
            onDragStart={handlePreviewDragStart}
            onDragCancel={handlePreviewDragCancel}
            onDragEnd={handlePreviewDragEnd}
        >
            {modalContent}
            <DragOverlay zIndex={240}>
                {dragOverlay}
            </DragOverlay>
        </DndContext>
    )

    if (shellMode === 'window' || typeof document === 'undefined') {
        return (
            <>
                {modalWithDnd}
                {createFileModal}
            </>
        )
    }

    return createPortal(
        <>
            {modalWithDnd}
            {createFileModal}
        </>,
        document.body
    )
}

export { useFilePreview }

export default FilePreviewModal
