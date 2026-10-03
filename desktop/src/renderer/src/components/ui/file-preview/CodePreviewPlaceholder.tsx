import { useLayoutEffect } from 'react'
/** Show the already-read file immediately while the editor module initializes. */
const MAX_PREVIEW_CHARS = 48_000
const MAX_PREVIEW_LINES = 2_000

export function CodePreviewPlaceholder({ content, onReadable, fontSize = 13, wordWrap = 'on', lineNumberStart = 1, lineHeight = 20, paddingTop = 14, paddingBottom = 14 }: { content: string; onReadable?: () => void; fontSize?: number; wordWrap?: 'on' | 'off'; lineNumberStart?: number; lineHeight?: number; paddingTop?: number; paddingBottom?: number }) {
    useLayoutEffect(() => { onReadable?.() }, [onReadable])
    const text = content.slice(0, MAX_PREVIEW_CHARS)
    const allLines = text.split(/\r\n|\r|\n/)
    const lines = allLines.slice(0, MAX_PREVIEW_LINES)
    const hasMoreContent = content.length > text.length || allLines.length > lines.length
    const lineNumberDigits = Math.max(5, String(lineNumberStart + lines.length - 1).length)
    const wrapped = wordWrap !== 'off'
    const codeFont = 'var(--font-code, ui-monospace, monospace)'
    return <div className="h-full w-full overflow-auto" aria-busy="true" aria-label="Preparing code editor">
        <div className={wrapped ? 'w-full min-w-0' : 'w-max min-w-full'} style={{ fontFamily: codeFont, fontSize, paddingTop, paddingBottom, paddingRight: 16 }}>
            {lines.map((line, index) => <div key={index} className={wrapped ? 'flex w-full min-w-0' : 'flex w-max min-w-full'} style={{ minHeight: lineHeight }}>
                <span aria-hidden="true" className="sticky left-0 z-[1] flex shrink-0 select-none items-start justify-end bg-[var(--color-card)] pr-2 text-sparkle-text-muted" style={{ flex: `0 0 calc(${lineNumberDigits}ch + 8px)`, lineHeight: `${lineHeight}px` }}>{lineNumberStart + index}</span>
                <span className={wrapped ? 'min-w-0 flex-1 text-sparkle-text' : 'min-w-max text-sparkle-text'} style={{ lineHeight: `${lineHeight}px`, whiteSpace: wrapped ? 'pre-wrap' : 'pre', overflowWrap: wrapped ? 'anywhere' : 'normal' }}>{line || '\u00a0'}</span>
            </div>)}
        </div>
        {hasMoreContent ? <p className="px-4 text-[11px] text-sparkle-text-muted">The rest of the file will appear when the editor is ready.</p> : null}
    </div>
}
