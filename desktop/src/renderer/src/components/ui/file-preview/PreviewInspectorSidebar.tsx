import { Check, Copy, FileText, TriangleAlert } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { cn } from '@/lib/utils'
import type { GitDiffSummary } from './gitDiff'

type PreviewInspectorSidebarProps = {
    filePath: string
    gitDiffSummary: GitDiffSummary | null
    mode: 'preview' | 'edit'
    isDirty: boolean
    trailingWhitespaceCount: number
    longLineCount: number
    jsonDiagnostic: { ok: boolean; message: string } | null
}

function InspectorSection({ title, icon, children }: { title: string; icon?: ReactNode; children: ReactNode }) {
    return (
        <section className="border-b border-white/[0.06] py-3 last:border-b-0">
            <div className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold text-sparkle-text-muted/80">
                {icon}
                <span>{title}</span>
            </div>
            {children}
        </section>
    )
}

export function PreviewInspectorSidebar({
    filePath,
    gitDiffSummary,
    mode,
    isDirty,
    trailingWhitespaceCount,
    longLineCount,
    jsonDiagnostic
}: PreviewInspectorSidebarProps) {
    const [copied, setCopied] = useState(false)
    const fileName = filePath.replace(/\\/g, '/').split('/').filter(Boolean).at(-1) || filePath
    const additions = gitDiffSummary?.additions ?? 0
    const deletions = gitDiffSummary?.deletions ?? 0
    const hasChanges = additions > 0 || deletions > 0 || isDirty
    const diagnosticItems = [
        ...(trailingWhitespaceCount > 0 ? [`${trailingWhitespaceCount} trailing-whitespace ${trailingWhitespaceCount === 1 ? 'line' : 'lines'}`] : []),
        ...(longLineCount > 0 ? [`${longLineCount} ${longLineCount === 1 ? 'line' : 'lines'} over 120 characters`] : []),
        ...(jsonDiagnostic && !jsonDiagnostic.ok ? [jsonDiagnostic.message] : [])
    ]

    const copyPath = async () => {
        await navigator.clipboard.writeText(filePath)
        setCopied(true)
        window.setTimeout(() => setCopied(false), 1200)
    }

    return (
        <div className="custom-scrollbar flex min-h-0 flex-1 flex-col overflow-y-auto px-3">

            {hasChanges ? (
                <InspectorSection title="Changes">
                    <div className="flex items-center gap-2 text-[11px]">
                        {additions > 0 ? <span className="font-mono text-emerald-300">+{additions}</span> : null}
                        {deletions > 0 ? <span className="font-mono text-red-300">-{deletions}</span> : null}
                        {isDirty ? <span className="rounded-full bg-amber-400/10 px-2 py-0.5 text-[9px] font-medium text-amber-200">Unsaved</span> : null}
                    </div>
                </InspectorSection>
            ) : null}

            {diagnosticItems.length > 0 ? (
                <InspectorSection title="Diagnostics" icon={<TriangleAlert size={11} />}>
                    <div className="space-y-1 text-[11px] text-sparkle-text-secondary">
                        {diagnosticItems.map((item) => <div key={item}>{item}</div>)}
                    </div>
                </InspectorSection>
            ) : null}

            {!hasChanges && diagnosticItems.length === 0 ? (
                <div className="py-4 text-[11px] leading-5 text-sparkle-text-muted/65">
                    {mode === 'preview' ? 'No document issues or pending changes.' : 'No pending changes or diagnostics.'}
                </div>
            ) : null}

            <div className="mt-auto border-t border-white/[0.06] py-3">
                <div className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold text-sparkle-text-muted/80">
                    <FileText size={11} /> File
                </div>
                <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                        <div className="truncate text-[11px] font-medium text-sparkle-text" title={fileName}>{fileName}</div>
                        <div className="mt-0.5 line-clamp-2 break-all text-[9px] leading-4 text-sparkle-text-muted/65" title={filePath}>{filePath}</div>
                    </div>
                    <button
                        type="button"
                        onClick={() => void copyPath()}
                        className={cn(
                            'inline-flex size-6 shrink-0 items-center justify-center rounded-md transition-colors',
                            copied ? 'bg-emerald-400/10 text-emerald-300' : 'text-sparkle-text-muted hover:bg-white/[0.05] hover:text-sparkle-text'
                        )}
                        title={copied ? 'Copied' : 'Copy file path'}
                        aria-label={copied ? 'File path copied' : 'Copy file path'}
                    >
                        {copied ? <Check size={12} /> : <Copy size={12} />}
                    </button>
                </div>
            </div>
        </div>
    )
}
