import { parsePatchFiles } from '@pierre/diffs'
import { FileDiff } from '@pierre/diffs/react'
import { createPortal } from 'react-dom'
import { createRoot } from 'react-dom/client'
import { ensureDiffContainerStyles } from '../../src/renderer/src/components/ui/diff-viewer/ensureDiffContainerStyles'

const patch = `diff --git a/AGENTS.md b/AGENTS.md
--- a/AGENTS.md
+++ b/AGENTS.md
@@ -93,3 +93,4 @@
 ## Validation

-- Old guidance
+- New guidance
+- More guidance
`

const assert = (condition: unknown, message: string) => {
    if (!condition) throw new Error(message)
}

const settle = () => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
const until = async (predicate: () => unknown, message: string) => {
    const start = performance.now()
    while (!predicate()) {
        if (performance.now() - start > 5000) throw new Error(`Timed out: ${message}`)
        await settle()
    }
}

async function checkMode(diffStyle: 'unified' | 'split') {
    const frame = document.createElement('iframe')
    frame.style.cssText = 'width:900px;height:500px;border:0'
    document.body.append(frame)
    const child = frame.contentDocument!
    const root = createRoot(document.createElement('div'))
    const mount = child.createElement('div')
    child.body.append(mount)
    const fileDiff = parsePatchFiles(patch)[0].files[0]

    root.render(createPortal(<FileDiff fileDiff={fileDiff} options={{ diffStyle, theme: 'pierre-dark', themeType: 'dark' }} />, mount))
    await until(() => child.querySelector('diffs-container')?.shadowRoot?.querySelector('[data-code]'), `${diffStyle} diff markup`)

    const host = child.querySelector('diffs-container')!
    const shadow = host.shadowRoot!
    const code = shadow.querySelector<HTMLElement>('[data-code]')!
    const gutter = shadow.querySelector<HTMLElement>('[data-gutter]')!
    const content = shadow.querySelector<HTMLElement>('[data-content]')!
    assert(!child.defaultView!.customElements.get('diffs-container'), 'overlay registry must be separate')
    assert(child.defaultView!.getComputedStyle(code).display !== 'grid', 'unstyled overlay reproduces stacked columns')
    assert(content.textContent?.includes('## Validation'), 'diff content exists before style repair')

    ensureDiffContainerStyles(mount)
    assert(child.defaultView!.getComputedStyle(code).display === 'grid', `${diffStyle} diff grid restored`)
    assert(Math.abs(content.getBoundingClientRect().top - gutter.getBoundingClientRect().top) < 1, `${diffStyle} gutter and content align`)
    ensureDiffContainerStyles(mount)
    assert(shadow.adoptedStyleSheets.length === 1, `${diffStyle} stylesheet is installed once`)

    if (diffStyle === 'unified') {
        root.unmount()
        frame.remove()
    }
    return `${diffStyle} overlay diff layout and content`
}

;(window as any).diffOverlayChecks = (async () => [await checkMode('unified'), await checkMode('split')])()
