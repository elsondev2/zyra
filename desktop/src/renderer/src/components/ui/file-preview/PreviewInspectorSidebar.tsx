import type { Dispatch, ReactNode, SetStateAction } from 'react'
import { cn } from '@/lib/utils'
import type { GitDiffSummary } from './gitDiff'

type PreviewInspectorSidebarProps = {
    filePath: string
    gitDiffSummary: GitDiffSummary | null
    mode: 'preview' | 'edit'
    isDirty: boolean
    setFindRequestToken: Dispatch<SetStateAction<number>>
    setReplaceRequestToken: Dispatch<SetStateAction<number>>
    isEditorToolsEnabled: boolean
    getEditorToolButtonClass: (isActive?: boolean) => string
    editorWordWrap: 'on' | 'off'
    setEditorWordWrap: Dispatch<SetStateAction<'on' | 'off'>>
    editorMinimapEnabled: boolean
    setEditorMinimapEnabled: Dispatch<SetStateAction<boolean>>
    editorFontSize: number
    setEditorFontSize: Dispatch<SetStateAction<number>>
    trailingWhitespaceCount: number
    longLineCount: number
    jsonDiagnostic: { ok: boolean; message: string } | null
}

function InspectorCard({
    title,
    children
}: {
    title: string
    children: ReactNode
}) {
    return (
        <section className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]">
            <div className="text-[11px] font-medium text-sparkle-text">{title}</div>
            <div className="mt-1.5 space-y-1 text-[11px] text-sparkle-text-secondary">{children}</div>
        </section>
    )
}

export function PreviewInspectorSidebar({
    filePath,
    gitDiffSummary,
    mode,
    isDirty,
    setFindRequestToken,
    setReplaceRequestToken,
    isEditorToolsEnabled,
    getEditorToolButtonClass,
    editorWordWrap,
    setEditorWordWrap,
    editorMinimapEnabled,
    setEditorMinimapEnabled,
    editorFontSize,
    setEditorFontSize,
    trailingWhitespaceCount,
    longLineCount,
    jsonDiagnostic
}: PreviewInspectorSidebarProps) {
    return (
        <div className="flex min-h-0 flex-1 flex-col gap-3">
            <div className="px-1 text-[10px] uppercase tracking-[0.18em] text-sparkle-text-muted">Inspector</div>

            <InspectorCard title="File">
                <div className="break-all text-sparkle-text-secondary">{filePath}</div>
            </InspectorCard>

            <InspectorCard title="Git Snapshot">
                <div className="text-emerald-300">+{gitDiffSummary?.additions ?? 0}</div>
                <div className="text-red-300">-{gitDiffSummary?.deletions ?? 0}</div>
            </InspectorCard>

            <InspectorCard title="Edit Session">
                <div>{mode === 'edit' ? 'Editing enabled' : 'Preview mode'}</div>
                <div>{isDirty ? 'Unsaved changes present' : 'No unsaved changes'}</div>
            </InspectorCard>

            <InspectorCard title="Editor Tools">
                <div className="flex flex-wrap items-center gap-2">
                    <button
                        type="button"
                        onClick={() => setFindRequestToken((current) => current + 1)}
                        disabled={!isEditorToolsEnabled}
                        className={getEditorToolButtonClass(false)}
                    >
                        Find
                    </button>
                    <button
                        type="button"
                        onClick={() => setReplaceRequestToken((current) => current + 1)}
                        disabled={!isEditorToolsEnabled}
                        className={getEditorToolButtonClass(false)}
                    >
                        Replace
                    </button>
                </div>
                <div className="flex items-center justify-between">
                    <span>Wrap</span>
                    <button
                        type="button"
                        onClick={() => setEditorWordWrap((current) => current === 'on' ? 'off' : 'on')}
                        disabled={!isEditorToolsEnabled}
                        className={getEditorToolButtonClass(editorWordWrap === 'on')}
                    >
                        {editorWordWrap === 'on' ? 'On' : 'Off'}
                    </button>
                </div>
                <div className="flex items-center justify-between">
                    <span>Minimap</span>
                    <button
                        type="button"
                        onClick={() => setEditorMinimapEnabled((current) => !current)}
                        disabled={!isEditorToolsEnabled}
                        className={getEditorToolButtonClass(editorMinimapEnabled)}
                    >
                        {editorMinimapEnabled ? 'On' : 'Off'}
                    </button>
                </div>
                <div className="flex items-center justify-between">
                    <span>Font</span>
                    <div className="flex items-center gap-1">
                        <button
                            type="button"
                            onClick={() => setEditorFontSize((current) => Math.max(11, current - 1))}
                            disabled={!isEditorToolsEnabled}
                            className={getEditorToolButtonClass(false)}
                        >
                            -
                        </button>
                        <span className="min-w-[2rem] text-center text-sparkle-text-secondary">{editorFontSize}</span>
                        <button
                            type="button"
                            onClick={() => setEditorFontSize((current) => Math.min(22, current + 1))}
                            disabled={!isEditorToolsEnabled}
                            className={getEditorToolButtonClass(false)}
                        >
                            +
                        </button>
                    </div>
                </div>
            </InspectorCard>

            <InspectorCard title="Diagnostics">
                <div>Trailing whitespace lines: {trailingWhitespaceCount}</div>
                <div>Long lines (&gt;120): {longLineCount}</div>
                {jsonDiagnostic ? (
                    <div className={cn(jsonDiagnostic.ok ? 'text-emerald-300' : 'text-amber-300')}>
                        {jsonDiagnostic.message}
                    </div>
                ) : null}
            </InspectorCard>
        </div>
    )
}
