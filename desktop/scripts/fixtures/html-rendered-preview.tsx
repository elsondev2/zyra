import React, { useCallback, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import HtmlRenderedPreview from '../../src/renderer/src/components/ui/file-preview/HtmlRenderedPreview'
import { NativeOverlayPortal } from '../../src/renderer/src/components/ui/native-overlay-portal'
import { VIEWPORT_PRESETS } from '../../src/renderer/src/components/ui/file-preview/viewport'
import { installDesktopLinkHandler } from '../../src/renderer/src/lib/desktop-links'
import { navigateHtmlPreviewLink } from '../../src/renderer/src/components/ui/file-preview/html-preview-links'
import { useFilePreviewNavigationHistory } from '../../src/renderer/src/components/ui/file-preview/useFilePreviewNavigationHistory'
import type { PreviewFile, PreviewMediaItem, PreviewOpenOptions } from '../../src/renderer/src/components/ui/file-preview/types'

const style = document.createElement('style')
style.textContent = 'html,body,#root{width:100%;height:100%;margin:0}.h-full{height:100%}.w-full{width:100%}.min-h-0{min-height:0}.overflow-hidden{overflow:hidden}.block{display:block}.mx-auto{margin-left:auto;margin-right:auto}'
document.head.append(style)
const emptyMedia: PreviewMediaItem[] = []
const activatedLinks: string[] = []
document.body.dataset.activatedLinks = '[]'
const record = (target: string) => { activatedLinks.push(target); document.body.dataset.activatedLinks = JSON.stringify(activatedLinks) }
installDesktopLinkHandler(async target => { record(target); return { success: true } })

function Fixture({ initialFile, initialContent, follow }: { initialFile: PreviewFile; initialContent: string; follow: boolean }) {
    const [file, setFile] = useState(initialFile)
    const [content, setContent] = useState(initialContent)
    const open = useCallback(async (next: { name: string; path: string }, _ext: string, options?: PreviewOpenOptions) => {
        const response = await fetch('/__html-preview-source?path=' + encodeURIComponent(next.path))
        if (!response.ok) throw new Error('Linked fixture file could not be read')
        const text = await response.text()
        setContent(text)
        setFile({ ...next, type: 'html', htmlLocation: options?.htmlLocation })
    }, [])
    const intent = useCallback((action: () => void | Promise<void>) => { void action() }, [])
    const history = useFilePreviewNavigationHistory({ file, mediaItems: emptyMedia, onNavigate: open, requestExternalIntent: intent })
    useEffect(() => {
        document.body.dataset.currentFile = file.path
        ;(window as any).__previewBack = history.navigateBack
        ;(window as any).__previewForward = history.navigateForward
    }, [file, history.navigateBack, history.navigateForward])
    return <NativeOverlayPortal>
        <button id="owner-control" style={{ position: 'fixed', right: 8, top: 8, zIndex: 10 }} onClick={() => { document.body.dataset.ownerControlClicked = '1' }}>App control</button>
        <HtmlRenderedPreview filePath={file.path} fileName={file.name} content={content} location={file.htmlLocation}
            viewport="responsive" presetConfig={VIEWPORT_PRESETS.responsive} isExpanded
            onInternalLinkClick={async target => {
                record(target)
                return follow ? navigateHtmlPreviewLink({ href: target, filePath: file.path, openPreview: open }) : true
            }}
            onLinkNotice={message => { document.body.dataset.linkNotice = message }} />
    </NativeOverlayPortal>
}

async function mount() {
    const query = new URL(window.location.href).searchParams
    const filePath = query.get('path') || ''
    const response = await fetch('/__html-preview-source')
    if (!response.ok) throw new Error(`fixture source failed: ${response.status}`)
    const content = await response.text()
    const root = document.getElementById('root')
    if (!root) throw new Error('fixture root is missing')
    createRoot(root).render(<Fixture initialFile={{ path: filePath, name: filePath.split(/[\\/]/).pop() || 'preview.html', type: 'html' }} initialContent={content} follow={query.has('follow')} />)
    document.body.dataset.sourceCharacters = String(content.length)
}
void mount().catch(error => { document.body.dataset.fixtureError = error instanceof Error ? error.message : String(error) })
