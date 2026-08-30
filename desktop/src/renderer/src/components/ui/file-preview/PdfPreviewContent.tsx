import { useThemeRevision } from '@/lib/use-theme-revision'
import { getFileUrl } from './utils'

export default function PdfPreviewContent({ filePath, fileName }: { filePath: string; fileName: string }) {
    useThemeRevision()
    const colorScheme = typeof document !== 'undefined' && document.body.classList.contains('light') ? 'light' : 'dark'

    return (
        <div className="document-preview-root h-full min-h-0 w-full overflow-hidden bg-[var(--document-preview-desk)]">
            <iframe
                src={getFileUrl(filePath)}
                title={`PDF preview: ${fileName}`}
                className="h-full w-full border-0 bg-[var(--document-preview-page)]"
                style={{ colorScheme }}
            />
        </div>
    )
}
