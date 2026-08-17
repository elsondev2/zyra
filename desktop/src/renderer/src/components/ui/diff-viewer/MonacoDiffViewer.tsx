import { DiffEditor, Editor } from '@monaco-editor/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { editor as MonacoEditor } from 'monaco-editor'
import { getAppearanceCodeFontStack, useSettings } from '@/lib/settings'
import { monaco } from '@/lib/monaco/runtime'
import { useThemeRevision } from '@/lib/use-theme-revision'

const MONACO_DIFF_THEME_ID = 'devscope-diff'

interface MonacoDiffViewerProps {
    filePath: string
    diff: string
    height?: string
    renderSideBySide?: boolean
}

function readThemeVariable(name: string, fallback: string): string {
    if (typeof window === 'undefined') return fallback
    const computed = getComputedStyle(document.body)
    const value = computed.getPropertyValue(name).trim()
    return value || fallback
}

function applyMonacoDiffTheme(appearance: 'light' | 'dark') {
    const isLightTheme = appearance === 'light'
    const text = readThemeVariable('--color-text', isLightTheme ? '#1e293b' : '#e2e8f0')
    const textDark = readThemeVariable('--color-text-dark', isLightTheme ? '#475569' : '#cbd5e1')
    const textSecondary = readThemeVariable('--color-text-secondary', isLightTheme ? '#64748b' : '#94a3b8')
    const card = readThemeVariable('--color-card', isLightTheme ? '#ffffff' : '#131c2c')
    const bg = readThemeVariable('--color-bg', isLightTheme ? '#f9fafb' : '#0c121f')
    const border = readThemeVariable('--color-border', isLightTheme ? '#e2e8f0' : '#1f2a3d')
    const accent = readThemeVariable('--accent-primary', isLightTheme ? '#2563eb' : '#60a5fa')
    const inserted = readThemeVariable('--status-success', isLightTheme ? '#15803d' : '#4ade80')
    const removed = readThemeVariable('--status-danger', isLightTheme ? '#b91c1c' : '#f87171')

    const themeData: monaco.editor.IStandaloneThemeData = {
        base: isLightTheme ? 'vs' : 'vs-dark',
        inherit: true,
        rules: [],
        colors: {
            'editor.background': card,
            'editor.foreground': text,
            'editor.lineHighlightBackground': 'transparent',
            'editorCursor.foreground': accent,
            'editorLineNumber.foreground': textSecondary,
            'editorLineNumber.activeForeground': textDark,
            'editor.selectionBackground': `${accent}33`,
            'editor.inactiveSelectionBackground': `${accent}20`,
            'editorIndentGuide.background1': `${border}99`,
            'editorIndentGuide.activeBackground1': `${textSecondary}aa`,
            'editorRuler.foreground': `${border}99`,
            'editorGutter.background': card,
            'editorOverviewRuler.border': border,
            'editorBracketMatch.border': accent,
            'editorBracketMatch.background': `${accent}1f`,
            'minimap.background': bg,
            'minimapSlider.background': `${accent}33`,
            'minimapSlider.hoverBackground': `${accent}55`,
            'minimapSlider.activeBackground': `${accent}77`,
            'scrollbarSlider.background': `${accent}33`,
            'scrollbarSlider.hoverBackground': `${accent}55`,
            'scrollbarSlider.activeBackground': `${accent}77`,
            // Diff-specific colors
            'diffEditor.insertedTextBackground': `${inserted}${isLightTheme ? '33' : '22'}`,
            'diffEditor.removedTextBackground': `${removed}${isLightTheme ? '33' : '22'}`,
            'diffEditor.insertedLineBackground': `${inserted}${isLightTheme ? '18' : '10'}`,
            'diffEditor.removedLineBackground': `${removed}${isLightTheme ? '18' : '10'}`,
            'diffEditor.diagonalFill': `${border}66`,
            'diffEditorGutter.insertedLineBackground': `${inserted}${isLightTheme ? '25' : '15'}`,
            'diffEditorGutter.removedLineBackground': `${removed}${isLightTheme ? '25' : '15'}`,
            'diffEditorOverview.insertedForeground': inserted,
            'diffEditorOverview.removedForeground': removed
        }
    }

    try {
        monaco.editor.defineTheme(MONACO_DIFF_THEME_ID, themeData)
        monaco.editor.setTheme(MONACO_DIFF_THEME_ID)
    } catch (error) {
        console.error('Failed to apply Monaco diff theme:', error)
        monaco.editor.setTheme(isLightTheme ? 'vs' : 'vs-dark')
    }
}

function getLanguageFromFilePath(filePath: string): string {
    const ext = filePath.split('.').pop()?.toLowerCase()
    const languageMap: Record<string, string> = {
        js: 'javascript',
        jsx: 'javascript',
        ts: 'typescript',
        tsx: 'typescript',
        json: 'json',
        html: 'html',
        htm: 'html',
        css: 'css',
        scss: 'scss',
        sass: 'scss',
        less: 'less',
        md: 'markdown',
        py: 'python',
        rb: 'ruby',
        go: 'go',
        rs: 'rust',
        java: 'java',
        c: 'c',
        cpp: 'cpp',
        cs: 'csharp',
        php: 'php',
        sh: 'shell',
        bash: 'shell',
        yml: 'yaml',
        yaml: 'yaml',
        xml: 'xml',
        sql: 'sql'
    }
    return languageMap[ext || ''] || 'plaintext'
}

function parseDiffToOriginalAndModified(diff: string): { original: string; modified: string } {
    const lines = diff.split('\n')
    const originalLines: string[] = []
    const modifiedLines: string[] = []

    let inHunk = false

    for (const line of lines) {
        // Skip diff metadata
        if (line.startsWith('diff ') || line.startsWith('index ')) {
            continue
        }

        // Skip file headers but mark that we're about to enter content
        if (line.startsWith('--- ') || line.startsWith('+++ ')) {
            continue
        }

        // Hunk header - marks the start of actual diff content
        if (line.startsWith('@@ ')) {
            inHunk = true
            continue
        }

        // Only process lines after we've seen a hunk header
        if (!inHunk) {
            continue
        }

        if (line.startsWith('-')) {
            // Removed line - only in original
            originalLines.push(line.substring(1))
        } else if (line.startsWith('+')) {
            // Added line - only in modified
            modifiedLines.push(line.substring(1))
        } else {
            // Context line - in both (handle lines that start with space or are empty)
            const contextLine = line.startsWith(' ') ? line.substring(1) : line
            originalLines.push(contextLine)
            modifiedLines.push(contextLine)
        }
    }

    return {
        original: originalLines.join('\n'),
        modified: modifiedLines.join('\n')
    }
}

export default function MonacoDiffViewer({ filePath, diff, height = '100%', renderSideBySide = true }: MonacoDiffViewerProps) {
    const { settings } = useSettings()
    const themeRevision = useThemeRevision()
    const language = useMemo(() => getLanguageFromFilePath(filePath), [filePath])
    const { original, modified } = useMemo(() => parseDiffToOriginalAndModified(diff), [diff])
    const [compactLayout, setCompactLayout] = useState(() => {
        if (typeof window === 'undefined') return false
        return window.innerWidth < 980
    })
    const [didMountDiffEditor, setDidMountDiffEditor] = useState(false)
    const [forceUnifiedFallback, setForceUnifiedFallback] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const editorRef = useRef<MonacoEditor.IStandaloneDiffEditor | null>(null)
    const modelsRef = useRef<{ original: monaco.editor.ITextModel | null; modified: monaco.editor.ITextModel | null }>({
        original: null,
        modified: null
    })
    const hasParsedDiffContent = original.length > 0 || modified.length > 0
    const diffInstanceKey = useMemo(() => `${filePath}:${diff.length}`, [filePath, diff.length])
    const originalModelPath = useMemo(() => `diff://${encodeURIComponent(filePath || 'unknown')}/original`, [filePath])
    const modifiedModelPath = useMemo(() => `diff://${encodeURIComponent(filePath || 'unknown')}/modified`, [filePath])
    const unifiedModelPath = useMemo(() => `diff://${encodeURIComponent(filePath || 'unknown')}/unified`, [filePath])

    useEffect(() => {
        try {
            applyMonacoDiffTheme(settings.appearanceResolvedMode)
        } catch (err) {
            console.error('Failed to apply Monaco theme:', err)
            setError('Failed to initialize theme')
        }
    }, [settings.theme, settings.appearanceResolvedMode, settings.accentColor.primary, themeRevision])

    useEffect(() => {
        if (typeof window === 'undefined') return

        const updateLayout = () => {
            setCompactLayout(window.innerWidth < 980)
        }

        window.addEventListener('resize', updateLayout)
        return () => window.removeEventListener('resize', updateLayout)
    }, [])

    useEffect(() => {
        setDidMountDiffEditor(false)
        setForceUnifiedFallback(false)
    }, [diffInstanceKey])

    useEffect(() => {
        if (!hasParsedDiffContent || didMountDiffEditor) return
        const fallbackTimer = window.setTimeout(() => {
            setForceUnifiedFallback(true)
        }, 2500)
        return () => window.clearTimeout(fallbackTimer)
    }, [hasParsedDiffContent, didMountDiffEditor, diffInstanceKey])

    // Cleanup models on unmount
    useEffect(() => {
        return () => {
            if (modelsRef.current.original && !modelsRef.current.original.isDisposed()) {
                modelsRef.current.original.dispose()
            }
            if (modelsRef.current.modified && !modelsRef.current.modified.isDisposed()) {
                modelsRef.current.modified.dispose()
            }
            modelsRef.current = { original: null, modified: null }
        }
    }, [])

    const diffOptions: MonacoEditor.IStandaloneDiffEditorConstructionOptions = {
        readOnly: true,
        renderSideBySide: compactLayout ? false : renderSideBySide,
        enableSplitViewResizing: true,
        renderOverviewRuler: true,
        scrollBeyondLastLine: false,
        automaticLayout: true,
        minimap: {
            enabled: true,
            side: 'right',
            renderCharacters: false,
            showSlider: 'always',
            size: 'proportional'
        },
        lineNumbers: 'on',
        scrollbar: {
            vertical: 'visible',
            horizontal: 'visible',
            useShadows: false,
            verticalScrollbarSize: 10,
            horizontalScrollbarSize: 10
        },
        fontFamily: getAppearanceCodeFontStack(settings.appearanceCodeFont),
        fontSize: 13,
        lineHeight: 20,
        padding: { top: 12, bottom: 12 },
        renderLineHighlight: 'none',
        selectionHighlight: false,
        occurrencesHighlight: 'off',
        ignoreTrimWhitespace: false,
        renderIndicators: true,
        originalEditable: false,
        diffCodeLens: false,
        diffWordWrap: 'off'
    }

    const unifiedOptions: MonacoEditor.IStandaloneEditorConstructionOptions = {
        readOnly: true,
        domReadOnly: true,
        minimap: {
            enabled: !compactLayout,
            side: 'right',
            renderCharacters: false,
            showSlider: 'always',
            size: 'proportional'
        },
        lineNumbers: 'on',
        scrollBeyondLastLine: false,
        automaticLayout: true,
        scrollbar: {
            vertical: 'visible',
            horizontal: 'visible',
            useShadows: false,
            verticalScrollbarSize: 10,
            horizontalScrollbarSize: 10
        },
        fontFamily: getAppearanceCodeFontStack(settings.appearanceCodeFont),
        fontSize: compactLayout ? 12 : 13,
        lineHeight: compactLayout ? 18 : 20,
        padding: { top: 12, bottom: 12 },
        wordWrap: 'off',
        renderLineHighlight: 'none'
    }

    const handleEditorDidMount = (editor: MonacoEditor.IStandaloneDiffEditor) => {
        setDidMountDiffEditor(true)
        editorRef.current = editor
        const model = editor.getModel()
        if (model) {
            modelsRef.current.original = model.original
            modelsRef.current.modified = model.modified
        }
    }

    if (error) {
        return (
            <div className="flex items-center justify-center h-full text-red-400 text-sm">
                {error}
            </div>
        )
    }

    if (!hasParsedDiffContent || forceUnifiedFallback) {
        return (
            <Editor
                key={`${diffInstanceKey}:unified`}
                height={height}
                language="diff"
                path={unifiedModelPath}
                value={diff}
                theme={MONACO_DIFF_THEME_ID}
                options={unifiedOptions}
                loading={
                    <div className="flex items-center justify-center h-full text-white/50 text-sm">
                        Loading diff editor...
                    </div>
                }
            />
        )
    }

    return (
        <DiffEditor
            key={`${diffInstanceKey}:split`}
            height={height}
            language={language}
            original={original}
            modified={modified}
            originalModelPath={originalModelPath}
            modifiedModelPath={modifiedModelPath}
            theme={MONACO_DIFF_THEME_ID}
            options={diffOptions}
            onMount={handleEditorDidMount}
            loading={
                <div className="flex items-center justify-center h-full text-white/50 text-sm">
                    Loading diff editor...
                </div>
            }
        />
    )
}
