import { cn } from '@/lib/utils'
import PreviewBody from './PreviewBody'
import PreviewErrorBoundary from './PreviewErrorBoundary'
import PreviewModalHeader from './PreviewModalHeader'
import { PreviewModalDialogs } from './PreviewModalDialogs'
import { PreviewNavigationSidebar } from './PreviewNavigationSidebar'
import { PreviewExpandedWorkspace } from './PreviewExpandedWorkspace'
import { PreviewInspectorSidebar } from './PreviewInspectorSidebar'
import { PreviewExpandedPreviewArea } from './PreviewExpandedPreviewArea'
import type { PreviewModalLayoutProps } from './previewModalLayout.types'

export function PreviewModalLayout(props: PreviewModalLayoutProps) {
    const {
        file,
        shellMode = 'modal',
        loading,
        truncated,
        size,
        previewBytes,
        projectPath,
        mediaItems,
        openMediaItem,
        onInternalLinkClick,
        mode,
        isExpanded,
        allowExpanded = true,
        canEdit,
        isDirty,
        isSaving,
        leftPanelOpen,
        rightPanelOpen,
        leftPanelWidth,
        rightPanelWidth,
        isResizingPanels,
        setFindRequestToken,
        setReplaceRequestToken,
        findRequestToken,
        replaceRequestToken,
        editorWordWrap,
        setEditorWordWrap,
        editorMinimapEnabled,
        setEditorMinimapEnabled,
        editorFontSize,
        setEditorFontSize,
        focusLine,
        saveError,
        sourceContent,
        draftContent,
        onDraftContentChange,
        loadingEditableContent,
        viewport,
        setViewport,
        csvDistinctColorsEnabled,
        setCsvDistinctColorsEnabled,
        pythonRunState,
        pythonRunMode,
        pythonHasOutput,
        setPythonRunMode,
        canRunPython,
        onRunPython,
        onStopPython,
        onClearPythonOutput,
        onOpenInBrowser,
        gitDiffText,
        gitDiffSummary,
        handleModeChange,
        handleSave,
        handleRevert,
        handleCloseRequest,
        setIsExpanded,
        setLeftPanelOpen,
        setRightPanelOpen,
        modalStyle,
        previewSurfaceRef,
        previewResetKey,
        lineMarkersOverride,
        presetConfig,
        isCsv,
        isHtml,
        isCompactHtmlViewport,
        centerHtmlRenderedPreview,
        flushResponsiveHtmlPreview,
        hasBottomPanel,
        outlineItems,
        onOutlineSelect,
        onMinimizeLeftPanel,
        onOpenLinkedPreview,
        onOpenLinkedPreviewInNewTab,
        folderTreeRefreshToken = 0,
        preserveSidebarContextRequest = null,
        previewTabs,
        activePreviewTabId,
        onSelectPreviewTab,
        onClosePreviewTab,
        canCreateSiblingFile = false,
        onCreateSiblingFile,
        longLineCount,
        trailingWhitespaceCount,
        jsonDiagnostic,
        isEditorToolsEnabled,
        getEditorToolButtonClass,
        pythonPanel,
        previewBottomOverlay,
        previewBottomOverlayPadding = 0,
        previewModeEnabled,
        showUnsavedModal,
        conflictModifiedAt,
        dismissUnsaved,
        discardUnsaved,
        confirmUnsaved,
        dismissConflict,
        reloadConflict,
        overwriteConflict
    } = props

    const isMediaFile = file.type === 'image' || file.type === 'video' || file.type === 'audio'
    const previewSurfaceBackgroundClass = file.type === 'md' && mode === 'preview'
        ? 'bg-sparkle-card'
        : 'bg-sparkle-bg'
    const lockPreviewBodyHeight = mode === 'edit'
        || isCsv
        || isHtml
        || hasBottomPanel
    const shouldStretchPreviewBody = lockPreviewBodyHeight || isMediaFile

    const isWindowShell = shellMode === 'window'

    function renderPreviewBody(fillEditorHeight: boolean) {
        return (
            <PreviewErrorBoundary resetKey={previewResetKey}>
                <PreviewBody
                    file={file}
                    content={sourceContent}
                    loading={loading}
                    meta={{ truncated, size, previewBytes }}
                    projectPath={projectPath}
                    onInternalLinkClick={onInternalLinkClick}
                    gitDiffText={gitDiffText}
                    viewport={viewport}
                    presetConfig={presetConfig}
                    csvDistinctColorsEnabled={csvDistinctColorsEnabled}
                    mode={mode}
                    editableContent={draftContent}
                    onEditableContentChange={onDraftContentChange}
                    isEditable={canEdit}
                    loadingEditableContent={loadingEditableContent}
                    editorWordWrap={editorWordWrap}
                    editorMinimapEnabled={editorMinimapEnabled}
                    editorFontSize={editorFontSize}
                    findRequestToken={findRequestToken}
                    replaceRequestToken={replaceRequestToken}
                    focusLine={focusLine}
                    fillEditorHeight={fillEditorHeight}
                    lineMarkersOverride={lineMarkersOverride}
                    previewFocusLine={focusLine}
                    isExpanded={isExpanded}
                    mediaItems={mediaItems}
                    onSelectMedia={openMediaItem}
                />
            </PreviewErrorBoundary>
        )
    }

    const previewHeaderNode = (
        <PreviewModalHeader
            file={file}
            showCloseButton={!isWindowShell}
            previewModeEnabled={previewModeEnabled}
            mode={mode}
            isEditable={canEdit}
            isDirty={isDirty}
            isSaving={isSaving}
            isExpanded={isExpanded}
            allowExpanded={allowExpanded}
            leftPanelOpen={leftPanelOpen}
            rightPanelOpen={rightPanelOpen}
            loadingEditableContent={loadingEditableContent}
            viewport={viewport}
            csvDistinctColorsEnabled={csvDistinctColorsEnabled}
            pythonRunState={pythonRunState}
            pythonHasOutput={pythonHasOutput}
            pythonRunMode={pythonRunMode}
            onClose={handleCloseRequest}
            onToggleExpanded={() => {
                if (!allowExpanded) return
                setIsExpanded((current) => !current)
            }}
            onToggleLeftPanel={() => setLeftPanelOpen((current) => !current)}
            onToggleRightPanel={() => setRightPanelOpen((current) => !current)}
            onModeChange={handleModeChange}
            onSave={handleSave}
            onRevert={handleRevert ?? (() => undefined)}
            onViewportChange={setViewport}
            onCsvDistinctColorsEnabledChange={setCsvDistinctColorsEnabled}
            canRunPython={canRunPython}
            onPythonRunModeChange={setPythonRunMode}
            onRunPython={onRunPython}
            onStopPython={onStopPython}
            onClearPythonOutput={onClearPythonOutput}
            onOpenInBrowser={onOpenInBrowser}
            previewTabs={previewTabs}
            activePreviewTabId={activePreviewTabId}
            onSelectPreviewTab={onSelectPreviewTab}
            onClosePreviewTab={onClosePreviewTab}
            canCreateSiblingFile={canCreateSiblingFile}
            onCreateSiblingFile={onCreateSiblingFile}
        />
    )

    const expandedPreviewArea = (
        <PreviewExpandedPreviewArea
            previewSurfaceRef={previewSurfaceRef}
            centerHtmlRenderedPreview={centerHtmlRenderedPreview}
            isCompactHtmlViewport={isCompactHtmlViewport}
            overflowLocked={mode === 'edit' || isCsv || isHtml || hasBottomPanel}
            surfaceBackgroundClass={previewSurfaceBackgroundClass}
            shouldStretchPreviewBody={shouldStretchPreviewBody}
            hasBottomPanel={hasBottomPanel}
            mode={mode}
            previewContent={renderPreviewBody(true)}
            bottomOverlay={previewBottomOverlay}
            bottomOverlayPadding={previewBottomOverlayPadding}
        />
    )

    const expandedRightInspector = (
        <PreviewInspectorSidebar
            filePath={file.path}
            gitDiffSummary={gitDiffSummary}
            mode={mode}
            isDirty={isDirty}
            setFindRequestToken={setFindRequestToken}
            setReplaceRequestToken={setReplaceRequestToken}
            isEditorToolsEnabled={isEditorToolsEnabled}
            getEditorToolButtonClass={getEditorToolButtonClass}
            editorWordWrap={editorWordWrap}
            setEditorWordWrap={setEditorWordWrap}
            editorMinimapEnabled={editorMinimapEnabled}
            setEditorMinimapEnabled={setEditorMinimapEnabled}
            editorFontSize={editorFontSize}
            setEditorFontSize={setEditorFontSize}
            trailingWhitespaceCount={trailingWhitespaceCount}
            longLineCount={longLineCount}
            jsonDiagnostic={jsonDiagnostic}
        />
    )

    const modalContent = (
        <div
            className={cn(
                'flex transition-[background-color,padding,backdrop-filter] duration-320 ease-[cubic-bezier(0.16,1,0.3,1)]',
                isWindowShell
                    ? 'min-h-0 flex-1 items-stretch justify-stretch bg-sparkle-bg'
                    : isExpanded
                        ? 'fixed left-0 right-0 bottom-0 top-[46px] z-[45] items-stretch justify-stretch bg-sparkle-bg'
                        : 'fixed inset-0 z-[80] items-center justify-center bg-black/70 backdrop-blur-md'
            )}
            onClick={!isWindowShell && !isExpanded ? handleCloseRequest : undefined}
            style={!isWindowShell && !isExpanded ? { animation: 'fadeIn 0.18s ease-out' } : undefined}
            onWheel={(event) => event.stopPropagation()}
        >
            <div
                className={cn(
                    'flex flex-col overflow-hidden',
                    isWindowShell
                        ? 'min-h-0 w-full flex-1 bg-sparkle-card'
                        : 'will-change-[opacity,width,height,max-width,max-height,border-radius,margin,box-shadow,border-color] transition-[width,max-width,height,max-height,border-radius,margin,box-shadow,border-color,opacity] duration-320 ease-[cubic-bezier(0.16,1,0.3,1)]',
                    !isWindowShell && (
                        isExpanded
                            ? 'bg-sparkle-card h-full w-full max-h-none max-w-none opacity-100 m-0 rounded-none border-0 shadow-none'
                            : isMediaFile
                                ? 'bg-sparkle-card m-4 h-[min(86vh,860px)] w-[min(90vw,1220px)] rounded-2xl border border-white/10 opacity-100 shadow-2xl'
                                : 'bg-sparkle-card m-4 w-full max-h-[90vh] max-w-[95vw] rounded-2xl border border-white/10 opacity-100 shadow-2xl'
                    )
                )}
                onClick={!isWindowShell && !isExpanded ? (event => event.stopPropagation()) : undefined}
                style={isWindowShell ? undefined : modalStyle}
            >
                {!isExpanded ? previewHeaderNode : null}
                {!isExpanded && saveError ? <div className="border-b border-red-500/20 bg-red-500/10 px-4 py-2 text-xs text-red-200">{saveError}</div> : null}

                {isExpanded ? (
                    <PreviewExpandedWorkspace
                        header={previewHeaderNode}
                        saveError={saveError}
                        leftPanelOpen={leftPanelOpen}
                        leftPanelWidth={leftPanelWidth}
                        rightPanelOpen={rightPanelOpen}
                        rightPanelWidth={rightPanelWidth}
                        isResizingPanels={isResizingPanels}
                        leftSidebar={
                            <PreviewNavigationSidebar
                                file={file}
                                projectPath={projectPath}
                                outlineItems={outlineItems}
                                onOutlineSelect={onOutlineSelect}
                                onMinimizePanel={onMinimizeLeftPanel}
                                onOpenLinkedPreview={onOpenLinkedPreview}
                                onOpenLinkedPreviewInNewTab={onOpenLinkedPreviewInNewTab}
                                refreshToken={folderTreeRefreshToken}
                                preserveContextRequest={preserveSidebarContextRequest}
                            />
                        }
                        previewArea={expandedPreviewArea}
                        rightInspector={expandedRightInspector}
                    />
                ) : (
                    <div ref={previewSurfaceRef} className="group/preview relative flex-1 min-h-0">
                        <div
                            className={cn(
                                'h-full w-full custom-scrollbar flex items-stretch justify-center',
                                previewSurfaceBackgroundClass,
                                isMediaFile
                                    ? 'p-0'
                                    : flushResponsiveHtmlPreview
                                        ? 'p-0'
                                        : (isCompactHtmlViewport ? 'p-2 sm:p-3' : 'p-4'),
                                mode === 'edit' || isCsv || isHtml || hasBottomPanel || isMediaFile
                                    ? 'overflow-hidden'
                                    : 'overflow-auto'
                            )}
                            style={{ overscrollBehavior: 'contain' }}
                    >
                            <div
                                className={cn('w-full flex flex-col', shouldStretchPreviewBody ? 'h-full min-h-0' : 'min-h-full')}
                                style={{ paddingBottom: previewBottomOverlay && previewBottomOverlayPadding > 0 ? `${previewBottomOverlayPadding}px` : undefined }}
                            >
                                <div className={cn(shouldStretchPreviewBody && 'min-h-0', hasBottomPanel ? 'flex-1' : (shouldStretchPreviewBody ? 'h-full' : ''), hasBottomPanel && mode !== 'edit' ? 'overflow-auto custom-scrollbar' : '', centerHtmlRenderedPreview ? 'flex items-center justify-center' : '')}>
                                    {renderPreviewBody(false)}
                                </div>
                            </div>
                        </div>
                        {previewBottomOverlay ? (
                            <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 m-0 flex items-end p-0">
                                <div className="pointer-events-auto m-0 w-full p-0">
                                    {previewBottomOverlay}
                                </div>
                            </div>
                        ) : null}
                    </div>
                )}
                {pythonPanel}
            </div>
            <PreviewModalDialogs
                fileName={file.name}
                showUnsavedModal={showUnsavedModal}
                conflictModifiedAt={conflictModifiedAt}
                onCloseUnsaved={dismissUnsaved}
                onDiscardUnsaved={discardUnsaved}
                onSaveUnsaved={confirmUnsaved}
                onCloseConflict={dismissConflict}
                onReloadConflict={reloadConflict}
                onOverwriteConflict={overwriteConflict}
            />
        </div>
    )

    return modalContent
}
