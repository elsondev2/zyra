import { memo, useEffect, useMemo, useState } from 'react'
import { getFileUrl } from '@/components/ui/file-preview/utils'
import { AssistantFileAttachmentCard, AssistantPastedTextCard } from './AssistantAttachmentCards'
import { AssistantAttachmentImageCard } from './AssistantAttachmentImageCard'
import AssistantAttachmentPreviewModal from './AssistantAttachmentPreviewModal'
import type { ComposerContextFile } from './assistant-composer-types'
import { getContentTypeTag, getContextFileMeta, toKbLabel } from './assistant-composer-utils'
import {
    canRenderAttachmentImage,
    isClipboardAttachmentReference,
    type ParsedUserAttachment
} from './assistant-timeline-helpers'

function isImageAttachment(attachment: ParsedUserAttachment): boolean {
    return attachment.type.toUpperCase() === 'IMAGE'
        || String(attachment.mime || '').toLowerCase().startsWith('image/')
}

function parseAttachmentSize(value: string | null): number | undefined {
    const size = Number.parseInt(String(value || ''), 10)
    return Number.isFinite(size) && size >= 0 ? size : undefined
}

function buildPreviewFile(
    attachment: ParsedUserAttachment,
    resolvedPath: string | null
): ComposerContextFile | null {
    const image = isImageAttachment(attachment)
    if (!resolvedPath && !attachment.content && !attachment.preview) return null
    return {
        id: attachment.id,
        path: resolvedPath || attachment.path || attachment.displayName,
        name: attachment.displayName,
        mimeType: attachment.mime || (image ? 'image/*' : 'text/plain'),
        kind: image ? 'image' : attachment.type.toUpperCase() === 'CODE' ? 'code' : 'doc',
        content: attachment.content || undefined,
        previewText: attachment.preview || undefined,
        sizeBytes: parseAttachmentSize(attachment.size),
        source: attachment.isClipboard ? 'paste' : 'manual'
    }
}

export const AssistantReviewPromptAttachments = memo(function AssistantReviewPromptAttachments({
    attachments
}: {
    attachments: ParsedUserAttachment[]
}) {
    const [resolvedClipboardPaths, setResolvedClipboardPaths] = useState<Record<string, string>>({})
    const [previewFile, setPreviewFile] = useState<ComposerContextFile | null>(null)

    useEffect(() => {
        let cancelled = false
        const clipboardAttachments = attachments.filter((attachment) => isClipboardAttachmentReference(attachment.path))
        if (clipboardAttachments.length === 0) {
            setResolvedClipboardPaths({})
            return () => {
                cancelled = true
            }
        }

        void Promise.all(clipboardAttachments.map(async (attachment) => {
            const result = await window.devscope.assistant.resolveClipboardAttachment({
                reference: attachment.path || ''
            })
            return result.success && result.path ? [attachment.id, result.path] as const : null
        })).then((entries) => {
            if (cancelled) return
            setResolvedClipboardPaths(Object.fromEntries(
                entries.filter((entry): entry is readonly [string, string] => Boolean(entry))
            ))
        })

        return () => {
            cancelled = true
        }
    }, [attachments])

    const previewMeta = useMemo(() => previewFile ? getContextFileMeta(previewFile) : null, [previewFile])

    if (attachments.length === 0) return null

    return (
        <>
            <div className="custom-scrollbar mt-2 max-w-full overflow-x-auto pb-1">
                <div className="flex w-max min-w-full gap-2">
                    {attachments.map((attachment) => {
                        const resolvedPath = attachment.path && isClipboardAttachmentReference(attachment.path)
                            ? (resolvedClipboardPaths[attachment.id] || null)
                            : attachment.path
                        const image = isImageAttachment(attachment)
                        const renderImage = image && canRenderAttachmentImage(resolvedPath)
                        const attachmentPreview = buildPreviewFile(attachment, resolvedPath)
                        const openPreview = attachmentPreview ? () => setPreviewFile(attachmentPreview) : undefined

                        if (renderImage) {
                            return (
                                <AssistantAttachmentImageCard
                                    key={attachment.id}
                                    name={attachment.displayName}
                                    src={getFileUrl(String(resolvedPath))}
                                    widthClassName="w-[152px]"
                                    heightClassName="h-[104px]"
                                    onClick={openPreview}
                                />
                            )
                        }

                        if (attachment.isClipboard && !image) {
                            return (
                                <AssistantPastedTextCard
                                    key={attachment.id}
                                    widthClassName="w-[124px]"
                                    previewText={attachment.content || attachment.preview}
                                    onClick={openPreview}
                                />
                            )
                        }

                        return (
                            <AssistantFileAttachmentCard
                                key={attachment.id}
                                widthClassName="w-[136px]"
                                name={attachment.displayName}
                                contentType={attachment.type}
                                category={attachment.type.toUpperCase() === 'CODE' ? 'code' : image ? 'image' : 'doc'}
                                pathLabel={attachment.isClipboard ? null : attachment.path}
                                previewText={attachment.preview}
                                onClick={openPreview}
                            />
                        )
                    })}
                </div>
            </div>
            <AssistantAttachmentPreviewModal
                file={previewFile}
                meta={previewMeta}
                contentType={previewFile ? getContentTypeTag(previewFile) : ''}
                sizeLabel={previewFile ? toKbLabel(previewFile.sizeBytes) : ''}
                showFormattingWarning={false}
                readOnly
                onClose={() => setPreviewFile(null)}
            />
        </>
    )
})
