import { Suspense, lazy } from 'react'
import { resolveMonacoLanguage } from './monacoLanguage'

const MonacoEditorComponent = lazy(() => import('./MonacoPreviewEditor'))

interface SyntaxPreviewProps {
    content: unknown
    language: string
    filePath?: string
    projectPath?: string
    gitDiffText?: string
    readOnly?: boolean
    onChange?: (value: string) => void
    onEditorMount?: (editor: import('monaco-editor').editor.IStandaloneCodeEditor) => void
    wordWrap?: 'on' | 'off'
    minimapEnabled?: boolean
    fontSize?: number
    findRequestToken?: number
    replaceRequestToken?: number
    focusLine?: number | null
    height?: string
    lineMarkersOverride?: import('./gitDiff').GitLineMarker[]
}

function normalizeSyntaxContent(content: unknown): string {
    if (typeof content === 'string') return content
    if (content == null) return ''
    if (typeof content === 'number' || typeof content === 'boolean' || typeof content === 'bigint') {
        return String(content)
    }
    try {
        return JSON.stringify(content, null, 2)
    } catch {
        return String(content)
    }
}

function toMonacoModelPath(filePath?: string): string | undefined {
    if (!filePath) return undefined

    const normalizedPath = filePath.replace(/\\/g, '/')
    const encodedPath = encodeURI(normalizedPath).replace(/#/g, '%23').replace(/\?/g, '%3F')

    if (normalizedPath.startsWith('//')) {
        return `file:${encodedPath}`
    }

    if (/^[a-zA-Z]:\//.test(normalizedPath)) {
        return `file:///${encodedPath}`
    }

    if (normalizedPath.startsWith('/')) {
        return `file://${encodedPath}`
    }

    return `file:///${encodedPath}`
}

export default function SyntaxPreview({
    content,
    language,
    filePath,
    projectPath,
    gitDiffText,
    readOnly = true,
    onChange,
    onEditorMount,
    wordWrap,
    minimapEnabled,
    fontSize,
    findRequestToken,
    replaceRequestToken,
    focusLine,
    height,
    lineMarkersOverride
}: SyntaxPreviewProps) {
    const safeContent = normalizeSyntaxContent(content)
    const monacoLanguage = resolveMonacoLanguage(language)
    const isLargeFile = safeContent.length > 300_000
    const modelPath = toMonacoModelPath(filePath)

    return (
        <div className="devscope-monaco-preview w-full h-full min-h-0" style={{ height: height || '100%', background: 'var(--color-card)' }}>
            <Suspense
                fallback={
                    <div className="h-full w-full grid place-items-center text-sm text-white/60 bg-sparkle-card">
                        Loading editor preview...
                    </div>
                }
            >
                <MonacoEditorComponent
                    value={safeContent}
                    language={monacoLanguage}
                    modelPath={modelPath}
                    isLargeFile={isLargeFile}
                    filePath={filePath}
                    projectPath={projectPath}
                    gitDiffText={gitDiffText}
                    readOnly={readOnly}
                    onChange={onChange}
                    onEditorMount={onEditorMount}
                    wordWrap={wordWrap}
                    minimapEnabled={minimapEnabled}
                    fontSize={fontSize}
                    findRequestToken={findRequestToken}
                    replaceRequestToken={replaceRequestToken}
                    focusLine={focusLine}
                    lineMarkersOverride={lineMarkersOverride}
                />
            </Suspense>
        </div>
    )
}
