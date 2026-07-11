import { RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'
import TextPreviewContent from './TextPreviewContent'
import MediaPreviewContent from './MediaPreviewContent'
import type { PreviewFile, PreviewMediaItem, PreviewMeta } from './types'
import { formatPreviewBytes, isMediaPreviewType, isTextLikeFileType } from './utils'
import type { ViewportPreset, ViewportPresetConfig } from './viewport'
import SyntaxPreview from './SyntaxPreview'
import type { editor as MonacoEditor } from 'monaco-editor'
import type { GitLineMarker } from './gitDiff'
import HtmlRenderedPreview from './HtmlRenderedPreview'

interface PreviewBodyProps {
    file: PreviewFile
    content: string
    loading?: boolean
    meta: PreviewMeta
    projectPath?: string
    onInternalLinkClick?: (href: string) => Promise<void> | void
    gitDiffText?: string
    viewport: ViewportPreset
    presetConfig: ViewportPresetConfig
    csvDistinctColorsEnabled: boolean
    mode: 'preview' | 'edit'
    editableContent: string
    onEditableContentChange: (value: string) => void
    isEditable: boolean
    loadingEditableContent?: boolean
    onEditorMount?: (editor: MonacoEditor.IStandaloneCodeEditor) => void
    editorWordWrap?: 'on' | 'off'
    editorMinimapEnabled?: boolean
    editorFontSize?: number
    findRequestToken?: number
    replaceRequestToken?: number
    focusLine?: number | null
    fillEditorHeight?: boolean
    lineMarkersOverride?: GitLineMarker[]
    previewFocusLine?: number | null
    isExpanded?: boolean
    fullBleed?: boolean
    mediaItems?: PreviewMediaItem[]
    onSelectMedia?: (item: PreviewMediaItem) => Promise<void> | void
}

function resolveEditorLanguage(file: PreviewFile): string {
    if (file.type === 'md') return 'markdown'
    if (file.type === 'json') return 'json'
    if (file.type === 'csv') return file.language === 'tsv' ? 'plaintext' : 'csv'
    if (file.type === 'html') return 'html'
    if (file.type === 'code') return file.language || 'text'
    return 'text'
}

export default function PreviewBody({
    file,
    content,
    loading,
    meta,
    projectPath,
    onInternalLinkClick,
    gitDiffText,
    viewport,
    presetConfig,
    csvDistinctColorsEnabled,
    mode,
    editableContent,
    onEditableContentChange,
    isEditable,
    loadingEditableContent,
    onEditorMount,
    editorWordWrap,
    editorMinimapEnabled,
    editorFontSize,
    findRequestToken,
    replaceRequestToken,
    focusLine,
    fillEditorHeight = false,
    lineMarkersOverride,
    previewFocusLine,
    isExpanded = false,
    fullBleed = false,
    mediaItems,
    onSelectMedia
}: PreviewBodyProps) {
    const isTextLike = isTextLikeFileType(file.type)
    const useFullBleed = isExpanded || fullBleed

    if (loading || loadingEditableContent) {
        return (
            <div className="flex items-center justify-center py-24 w-full">
                <RefreshCw size={32} className="animate-spin text-white/20" />
            </div>
        )
    }

    if (mode === 'edit') {
        if (!isEditable) {
            return (
                <div className="w-full max-w-4xl rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
                    This file type is preview-only right now.
                </div>
            )
        }

        return (
            <div className={cn(
                'w-full h-full max-h-full max-w-[98%] bg-sparkle-card border border-white/5 overflow-hidden',
                (fillEditorHeight || useFullBleed) ? 'h-full max-h-full max-w-none rounded-none border-0' : ''
            )}>
                <SyntaxPreview
                    content={editableContent}
                    language={resolveEditorLanguage(file)}
                    filePath={file.path}
                    projectPath={projectPath}
                    gitDiffText={gitDiffText}
                    readOnly={false}
                    onChange={onEditableContentChange}
                    onEditorMount={onEditorMount}
                    wordWrap={editorWordWrap}
                    minimapEnabled={editorMinimapEnabled}
                    fontSize={editorFontSize}
                    findRequestToken={findRequestToken}
                    replaceRequestToken={replaceRequestToken}
                    focusLine={focusLine}
                    height={(fillEditorHeight || useFullBleed) ? '100%' : undefined}
                    lineMarkersOverride={lineMarkersOverride}
                />
            </div>
        )
    }

    if (isTextLike) {
        return (
            <div className="w-full h-full min-h-0">
                <TextPreviewContent
                    file={file}
                    content={content}
                    meta={meta}
                    projectPath={projectPath}
                    onInternalLinkClick={onInternalLinkClick}
                    gitDiffText={gitDiffText}
                    csvDistinctColorsEnabled={csvDistinctColorsEnabled}
                    focusLine={previewFocusLine}
                    isExpanded={useFullBleed}
                />
            </div>
        )
    }

    if (isMediaPreviewType(file.type)) {
        return (
            <div className={cn(
                'w-full h-full min-h-0 overflow-hidden',
                useFullBleed || file.type === 'image' ? '' : 'rounded-xl border border-white/5 bg-sparkle-card'
            )}>
                <MediaPreviewContent
                    file={file}
                    mediaItems={mediaItems}
                    onSelectMedia={onSelectMedia}
                    isExpanded={useFullBleed}
                />
            </div>
        )
    }

    return (
        <HtmlRenderedPreview
            filePath={file.path}
            fileName={file.name}
            content={content}
            viewport={viewport}
            presetConfig={presetConfig}
            isExpanded={useFullBleed}
        />
    )
}
