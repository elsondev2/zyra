import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
    readPreviewContentCache,
    writePreviewContentCache,
    type PreviewContentSnapshot
} from '../src/renderer/src/components/ui/file-preview/preview-content-cache'
import { scanPreviewInspectorStats } from '../src/renderer/src/components/ui/file-preview/useFilePreviewModalAnalysis'
import {
    buildVisiblePreviewTreeModel,
    computePreviewVirtualRange,
    previewVirtualRangeCoversViewport
} from '../src/renderer/src/components/ui/file-preview/previewVirtualTreeModel'

function snapshot(content: string): PreviewContentSnapshot {
    return {
        content,
        truncated: false,
        size: content.length,
        previewBytes: content.length,
        modifiedAt: 1
    }
}

const cache = new Map<string, PreviewContentSnapshot>()
writePreviewContentCache(cache, 'C:/project/first.md', snapshot('first'))
writePreviewContentCache(cache, 'C:/project/second.md', snapshot('second'))
assert.equal(readPreviewContentCache(cache, 'c:\\project\\first.md')?.content, 'first', 'preview cache keys are path-normalized')
assert.equal([...cache.keys()].at(-1), 'c:/project/first.md', 'cache reads refresh least-recently-used order')
for (let index = 0; index < 12; index += 1) {
    writePreviewContentCache(cache, `C:/project/${index}.txt`, snapshot(String(index)))
}
assert.equal(cache.size <= 8, true, 'preview content cache remains bounded')
writePreviewContentCache(cache, 'C:/project/too-large.txt', snapshot('x'.repeat(600_001)))
assert.equal(readPreviewContentCache(cache, 'C:/project/too-large.txt'), null, 'oversized previews do not stay resident')

assert.deepEqual(
    scanPreviewInspectorStats(`short\n${'x'.repeat(121)}\ntrailing  `),
    { totalFileLines: 3, longLineCount: 1, trailingWhitespaceCount: 1 },
    'inspector line metrics share one text scan'
)

const historyNavigationSource = readFileSync(new URL('../src/renderer/src/components/ui/file-preview/PreviewHistoryNavigation.tsx', import.meta.url), 'utf8')
const previewHookSource = readFileSync(new URL('../src/renderer/src/components/ui/file-preview/useFilePreview.ts', import.meta.url), 'utf8')
const terminalHookSource = readFileSync(new URL('../src/renderer/src/components/ui/file-preview/useFilePreviewTerminal.ts', import.meta.url), 'utf8')
const terminalRuntimeSource = readFileSync(new URL('../src/renderer/src/components/ui/file-preview/previewTerminalRuntime.ts', import.meta.url), 'utf8')
const textPreviewSource = readFileSync(new URL('../src/renderer/src/components/ui/file-preview/TextPreviewContent.tsx', import.meta.url), 'utf8')
const layoutSource = readFileSync(new URL('../src/renderer/src/components/ui/file-preview/PreviewModalLayout.tsx', import.meta.url), 'utf8')
const analysisSource = readFileSync(new URL('../src/renderer/src/components/ui/file-preview/useFilePreviewModalAnalysis.tsx', import.meta.url), 'utf8')
const csvSource = readFileSync(new URL('../src/renderer/src/components/ui/file-preview/CsvPreviewTable.tsx', import.meta.url), 'utf8')
const virtualTreeSource = readFileSync(new URL('../src/renderer/src/components/ui/file-preview/PreviewVirtualFileTree.tsx', import.meta.url), 'utf8')
const virtualWindowSource = readFileSync(new URL('../src/renderer/src/components/ui/file-preview/usePreviewVirtualWindow.ts', import.meta.url), 'utf8')
const desktopPackage = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
    dependencies?: Record<string, string>
    scripts?: Record<string, string>
}
assert.equal(historyNavigationSource.includes('ChevronLeft'), true, 'preview history uses tailless chevrons')
assert.equal(historyNavigationSource.includes('ArrowLeft'), false)
assert.equal(previewHookSource.includes('readPreviewContentCache'), true, 'replaced files paint from bounded memory while reopening')
assert.equal(previewHookSource.includes('window.devscope.readFileContent(file.path)'), true, 'cached previews still revalidate against disk')
assert.equal(terminalHookSource.includes("import { Terminal as XtermTerminal } from 'xterm'"), false, 'ordinary previews do not eagerly load the terminal runtime')
assert.equal(terminalHookSource.includes('loadPreviewTerminalRuntime'), true, 'preview terminal uses the shared lazy runtime adapter')
assert.equal(terminalRuntimeSource.includes("import('xterm')"), true, 'terminal code loads only when a terminal surface mounts')
assert.equal(textPreviewSource.includes("lazy(() => import('../MarkdownRenderer'))"), true, 'non-Markdown previews do not load the Markdown parser stack')
assert.equal(textPreviewSource.includes("lazy(() => import('./CsvPreviewTable'))"), true, 'non-tabular previews do not load CSV rendering')
assert.equal(layoutSource.includes("await import('./PreviewNavigationSidebar')"), true, 'windowed previews skip expanded navigation code')
assert.equal(layoutSource.includes("await import('./PreviewInspectorSidebar')"), true, 'windowed previews skip expanded inspector code')
assert.equal(analysisSource.includes('useDeferredValue(draftContent)'), true, 'diff and inspector analysis cannot block urgent editor keystrokes')
assert.equal(csvSource.includes('content.length > 100_000'), true, 'large CSV parsing waits for an idle interaction frame')
const visibleTreeModel = buildVisiblePreviewTreeModel([
    {
        name: 'src',
        path: 'C:/project/src',
        type: 'directory',
        isHidden: false,
        childrenLoaded: true,
        children: [{ name: 'main.ts', path: 'C:/project/src/main.ts', type: 'file', isHidden: false }]
    },
    { name: 'package.json', path: 'C:/project/package.json', type: 'file', isHidden: false }
], new Set(['c:/project/src']))
assert.deepEqual(visibleTreeModel.rows.map((row) => [row.node.name, row.depth]), [
    ['src', 0],
    ['main.ts', 1],
    ['package.json', 0]
], 'expanded hierarchy flattens into stable visible rows before rendering')
assert.equal(visibleTreeModel.rowIndexByKey.get('c:/project/src/main.ts'), 1, 'the same traversal builds keyboard and target lookup indexes')
assert.equal(visibleTreeModel.horizontalContentWidth >= 240, true, 'the same traversal measures horizontal tree width')

const millionRowRange = computePreviewVirtualRange({
    rowCount: 1_000_000,
    rowHeight: 24,
    scrollTop: 12_000_000,
    viewportHeight: 600,
    overscan: 10
})
assert.equal(millionRowRange.end - millionRowRange.start <= 46, true, 'a million-row tree mounts only one viewport plus overscan')
assert.equal(previewVirtualRangeCoversViewport({
    range: millionRowRange,
    rowCount: 1_000_000,
    rowHeight: 24,
    scrollTop: 12_000_048,
    viewportHeight: 600,
    guardRows: 3
}), true, 'small native scroll movement reuses the current rendered window')
assert.equal(previewVirtualRangeCoversViewport({
    range: millionRowRange,
    rowCount: 1_000_000,
    rowHeight: 24,
    scrollTop: 12_002_400,
    viewportHeight: 600,
    guardRows: 3
}), false, 'the rendered window advances once the viewport reaches its guard boundary')
assert.equal(virtualTreeSource.includes('rows.slice(range.start, range.end)'), true, 'React receives only the virtual row window')
assert.equal(virtualWindowSource.includes("addEventListener('scroll', scheduleRangeUpdate, { passive: true })"), true, 'native scroll uses one passive listener')
assert.equal(virtualWindowSource.includes('window.requestAnimationFrame'), true, 'scroll calculations are frame-coalesced')
assert.equal(desktopPackage.dependencies?.['@pierre/trees'], undefined, 'the slow tree framework is absent from production dependencies')
assert.equal(desktopPackage.scripts?.postinstall?.includes('patch-pierre-trees.mjs'), false, 'the retired package patch is absent from installation')

console.log('File preview performance contract: ok')
