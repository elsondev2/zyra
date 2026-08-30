import { Info, ListTree, type LucideIcon } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { editor as MonacoEditor } from 'monaco-editor'
import { cn } from '@/lib/utils'
import { PreviewInspectorSidebar } from './PreviewInspectorSidebar'
import { PreviewOutlinePanel } from './PreviewOutlinePanel'
import { supportsDocumentOutline } from './documentOutline'
import type { GitDiffSummary } from './gitDiff'
import type { PreviewFileType } from './types'

type PreviewContextSidebarProps = {
    filePath: string
    fileType: PreviewFileType
    language?: string
    content: string
    gitDiffSummary: GitDiffSummary | null
    mode: 'preview' | 'edit'
    isDirty: boolean
    trailingWhitespaceCount: number
    longLineCount: number
    jsonDiagnostic: { ok: boolean; message: string } | null
    editor: MonacoEditor.IStandaloneCodeEditor | null
}

type SidebarMode = 'outline' | 'inspector'

type SidebarSection = {
    id: SidebarMode
    label: string
    icon: LucideIcon
    disabled?: boolean
    title: string
}

export function PreviewContextSidebar(props: PreviewContextSidebarProps) {
    const outlineAvailable = supportsDocumentOutline(props.fileType)
    const [sidebarMode, setSidebarMode] = useState<SidebarMode>(() => outlineAvailable ? 'outline' : 'inspector')

    useEffect(() => {
        setSidebarMode(outlineAvailable ? 'outline' : 'inspector')
    }, [outlineAvailable, props.filePath])

    const sections: SidebarSection[] = [
        {
            id: 'outline',
            label: 'Outline',
            icon: ListTree,
            disabled: !outlineAvailable,
            title: outlineAvailable ? 'Show document outline' : 'Outline is unavailable for this file type'
        },
        {
            id: 'inspector',
            label: 'Inspector',
            icon: Info,
            title: 'Show file inspector'
        }
    ]

    return (
        <div className="flex h-full min-h-0 flex-col overflow-hidden">
            <div className="flex h-7 w-full shrink-0 items-stretch overflow-hidden border-b border-white/[0.07]" role="tablist" aria-label="File side panel sections">
                {sections.map((section) => {
                    const active = sidebarMode === section.id
                    const SectionIcon = section.icon
                    return (
                        <button
                            key={section.id}
                            type="button"
                            role="tab"
                            disabled={section.disabled}
                            onClick={() => setSidebarMode(section.id)}
                            className={cn(
                                'relative inline-flex min-w-7 items-center justify-center overflow-hidden border-r border-white/[0.055] px-2 text-[10px] font-medium outline-none last:border-r-0 motion-reduce:!transition-none',
                                active
                                    ? 'bg-[var(--surface-active)] text-sparkle-text'
                                    : 'text-sparkle-text-muted hover:bg-[var(--surface-hover)] hover:text-sparkle-text',
                                section.disabled && 'cursor-not-allowed opacity-35 hover:bg-transparent'
                            )}
                            style={{
                                flexGrow: active ? 1 : 0,
                                flexBasis: active ? '88px' : '28px',
                                transition: 'flex-grow 360ms cubic-bezier(0.22,1,0.36,1), flex-basis 360ms cubic-bezier(0.22,1,0.36,1), background-color 180ms ease-out, color 180ms ease-out, border-color 180ms ease-out'
                            }}
                            aria-selected={active}
                            aria-controls={`file-side-panel-${section.id}`}
                            aria-label={section.label}
                            title={section.title}
                        >
                            <SectionIcon
                                size={12}
                                className={cn(
                                    'shrink-0 transition-[transform,opacity] duration-300 ease-out motion-reduce:transition-none',
                                    active ? 'scale-105 opacity-100' : 'scale-100 opacity-75'
                                )}
                            />
                            <span
                                aria-hidden={!active}
                                className={cn(
                                    'overflow-hidden whitespace-nowrap transition-[max-width,margin,opacity,transform] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none',
                                    active
                                        ? 'ml-1.5 max-w-[72px] translate-x-0 opacity-100 delay-75 duration-300'
                                        : 'ml-0 max-w-0 -translate-x-1 opacity-0 delay-0 duration-150'
                                )}
                            >
                                {section.label}
                            </span>
                            <span
                                aria-hidden="true"
                                className={cn(
                                    'pointer-events-none absolute inset-x-0 bottom-0 h-px origin-center bg-[var(--accent-primary)]/70 transition-[opacity,transform] ease-out motion-reduce:transition-none',
                                    active
                                        ? 'scale-x-100 opacity-100 delay-100 duration-300'
                                        : 'scale-x-50 opacity-0 delay-0 duration-150'
                                )}
                            />
                        </button>
                    )
                })}
            </div>

            <div
                id={`file-side-panel-${sidebarMode}`}
                role="tabpanel"
                className="flex min-h-0 flex-1 flex-col"
            >
                {sidebarMode === 'outline' && outlineAvailable ? (
                    <PreviewOutlinePanel
                        filePath={props.filePath}
                        fileType={props.fileType}
                        language={props.language}
                        content={props.content}
                        mode={props.mode}
                        editor={props.editor}
                    />
                ) : (
                    <PreviewInspectorSidebar
                        filePath={props.filePath}
                        gitDiffSummary={props.gitDiffSummary}
                        mode={props.mode}
                        isDirty={props.isDirty}
                        trailingWhitespaceCount={props.trailingWhitespaceCount}
                        longLineCount={props.longLineCount}
                        jsonDiagnostic={props.jsonDiagnostic}
                    />
                )}
            </div>
        </div>
    )
}
