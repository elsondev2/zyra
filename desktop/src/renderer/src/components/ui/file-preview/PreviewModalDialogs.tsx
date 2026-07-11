type PreviewModalDialogsProps = {
    fileName: string
    showUnsavedModal: boolean
    conflictModifiedAt: number | null
    onCloseUnsaved: () => void
    onDiscardUnsaved: () => void
    onSaveUnsaved: () => Promise<void>
    onCloseConflict: () => void
    onReloadConflict: () => Promise<void>
    onOverwriteConflict: () => Promise<void>
}

export function PreviewModalDialogs({
    fileName,
    showUnsavedModal,
    conflictModifiedAt,
    onCloseUnsaved,
    onDiscardUnsaved,
    onSaveUnsaved,
    onCloseConflict,
    onReloadConflict,
    onOverwriteConflict
}: PreviewModalDialogsProps) {
    return (
        <>
            {showUnsavedModal && (
                <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/50 backdrop-blur-sm px-4" onClick={onCloseUnsaved}>
                    <div className="w-full max-w-md rounded-2xl border border-amber-500/30 bg-sparkle-card p-5 shadow-2xl" onClick={(event) => event.stopPropagation()}>
                        <h3 className="text-sm font-semibold text-sparkle-text">Save changes before leaving?</h3>
                        <p className="mt-2 text-xs text-sparkle-text-secondary">
                            You have unsaved edits in <span className="font-medium text-sparkle-text">{fileName}</span>.
                        </p>
                        <div className="mt-4 flex items-center justify-end gap-2">
                            <button type="button" onClick={onCloseUnsaved} className="rounded-lg border border-sparkle-border px-3 py-1.5 text-sm text-sparkle-text-secondary transition-colors hover:bg-sparkle-card-hover hover:text-sparkle-text">Cancel</button>
                            <button type="button" onClick={onDiscardUnsaved} className="rounded-lg border border-amber-500/35 bg-amber-500/10 px-3 py-1.5 text-sm text-amber-200 transition-colors hover:bg-amber-500/20">Discard</button>
                            <button type="button" onClick={() => { void onSaveUnsaved() }} className="rounded-lg border border-emerald-500/40 bg-emerald-500/15 px-3 py-1.5 text-sm text-emerald-200 transition-colors hover:bg-emerald-500/25">Save</button>
                        </div>
                    </div>
                </div>
            )}

            {conflictModifiedAt !== null && (
                <div className="fixed inset-0 z-[95] flex items-center justify-center bg-black/55 backdrop-blur-sm px-4" onClick={onCloseConflict}>
                    <div className="w-full max-w-lg rounded-2xl border border-amber-500/30 bg-sparkle-card p-5 shadow-2xl" onClick={(event) => event.stopPropagation()}>
                        <h3 className="text-sm font-semibold text-sparkle-text">File Changed On Disk</h3>
                        <p className="mt-2 text-xs text-sparkle-text-secondary">
                            Another process updated this file after you opened it. Reload to keep disk state or overwrite with your current editor changes.
                        </p>
                        <div className="mt-4 flex items-center justify-end gap-2">
                            <button type="button" onClick={onCloseConflict} className="rounded-lg border border-sparkle-border px-3 py-1.5 text-sm text-sparkle-text-secondary transition-colors hover:bg-sparkle-card-hover hover:text-sparkle-text">Cancel</button>
                            <button type="button" onClick={() => { void onReloadConflict() }} className="rounded-lg border border-amber-500/35 bg-amber-500/10 px-3 py-1.5 text-sm text-amber-200 transition-colors hover:bg-amber-500/20">Reload</button>
                            <button type="button" onClick={() => { void onOverwriteConflict() }} className="rounded-lg border border-emerald-500/40 bg-emerald-500/15 px-3 py-1.5 text-sm text-emerald-200 transition-colors hover:bg-emerald-500/25">Overwrite</button>
                        </div>
                    </div>
                </div>
            )}
        </>
    )
}
