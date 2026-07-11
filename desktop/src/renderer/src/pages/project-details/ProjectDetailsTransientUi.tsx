import { AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { FilePreviewModal } from '@/components/ui/FilePreviewModal'
import { ServerScriptRunModal } from './ServerScriptRunModal'

export interface ProjectDetailsTransientUiProps {
    [key: string]: any
}

export function ProjectDetailsTransientUi(props: ProjectDetailsTransientUiProps) {
    const {
        pendingScriptRun,
        scriptPortInput,
        setScriptPortInput,
        setScriptRunError,
        scriptExposeNetwork,
        setScriptExposeNetwork,
        scriptAdvancedOpen,
        setScriptAdvancedOpen,
        scriptExtraArgsInput,
        setScriptExtraArgsInput,
        scriptEnvInput,
        setScriptEnvInput,
        scriptRunError,
        scriptCommandPreview,
        scriptRunner,
        closeScriptRunModal,
        handleConfirmScriptRun,
        projectPath,
        previewFile,
        previewTabs,
        activePreviewTabId,
        previewMediaItems,
        previewContent,
        loadingPreview,
        previewTruncated,
        previewSize,
        previewBytes,
        previewModifiedAt,
        openPreview,
        openPreviewInNewTab,
        setActivePreviewTab,
        closePreviewTab,
        reorderPreviewTabs,
        closePreview,
        onPreviewSaved,
        toast,
        navigate,
        setToast
    } = props

    return (
        <>
            <ServerScriptRunModal
                pendingScriptRun={pendingScriptRun}
                scriptPortInput={scriptPortInput}
                setScriptPortInput={(value) => {
                    setScriptPortInput(value)
                    setScriptRunError(null)
                }}
                scriptExposeNetwork={scriptExposeNetwork}
                setScriptExposeNetwork={(value) => {
                    setScriptExposeNetwork(value)
                    setScriptRunError(null)
                }}
                scriptAdvancedOpen={scriptAdvancedOpen}
                setScriptAdvancedOpen={setScriptAdvancedOpen}
                scriptExtraArgsInput={scriptExtraArgsInput}
                setScriptExtraArgsInput={(value) => {
                    setScriptExtraArgsInput(value)
                    setScriptRunError(null)
                }}
                scriptEnvInput={scriptEnvInput}
                setScriptEnvInput={(value) => {
                    setScriptEnvInput(value)
                    setScriptRunError(null)
                }}
                scriptRunError={scriptRunError}
                scriptCommandPreview={scriptCommandPreview}
                scriptRunner={scriptRunner}
                onClose={closeScriptRunModal}
                onConfirm={handleConfirmScriptRun}
            />

            {previewFile && (
                <FilePreviewModal
                    file={previewFile}
                    previewTabs={previewTabs}
                    activePreviewTabId={activePreviewTabId}
                    content={previewContent}
                    loading={loadingPreview}
                    truncated={previewTruncated}
                    size={previewSize}
                    previewBytes={previewBytes}
                    modifiedAt={previewModifiedAt}
                    projectPath={projectPath}
                    onOpenLinkedPreview={openPreview}
                    onOpenLinkedPreviewInNewTab={openPreviewInNewTab}
                    onSelectPreviewTab={setActivePreviewTab}
                    onClosePreviewTab={closePreviewTab}
                    onReorderPreviewTabs={reorderPreviewTabs}
                    mediaItems={previewMediaItems}
                    onSaved={onPreviewSaved}
                    onClose={closePreview}
                />
            )}

            {toast && (
                <div
                    className={cn(
                        'fixed bottom-4 right-4 z-[80] max-w-sm rounded-xl px-4 py-3 text-sm shadow-lg backdrop-blur-md transition-all duration-300',
                        toast.tone === 'error'
                            ? 'border border-red-500/30 bg-red-500/10 text-red-200'
                            : toast.tone === 'success'
                                ? 'border border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
                                : 'border border-amber-500/30 bg-amber-500/10 text-amber-300',
                        toast.visible ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0 pointer-events-none'
                    )}
                >
                    <div className="flex items-start gap-2">
                        <AlertCircle size={16} className="mt-0.5 shrink-0" />
                        <div className="flex flex-col gap-1">
                            <span>{toast.message}</span>
                            {toast.actionTo && toast.actionLabel && (
                                <button
                                    onClick={() => {
                                        navigate(toast.actionTo!)
                                        setToast(null)
                                    }}
                                    className={cn(
                                        'text-left text-xs font-medium underline underline-offset-2 transition-colors',
                                        toast.tone === 'error'
                                            ? 'text-red-100 hover:text-red-50'
                                            : toast.tone === 'success'
                                                ? 'text-emerald-100 hover:text-emerald-50'
                                                : 'text-amber-200 hover:text-amber-100'
                                    )}
                                >
                                    {toast.actionLabel}
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </>
    )
}
