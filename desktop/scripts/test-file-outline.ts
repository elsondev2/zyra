import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
    buildMarkdownOutline,
    buildStructuralOutline,
    documentOutlineLanguageLabel,
    filterDocumentOutline,
    findDeepestOutlineItemAtLine,
    flattenVisibleOutline,
    shouldRefreshOutlineImmediately
} from '../src/renderer/src/components/ui/file-preview/documentOutline'
import { computePreviewVirtualRange } from '../src/renderer/src/components/ui/file-preview/previewVirtualTreeModel'
import { resolveMarkdownLineAnchor, resolveMarkdownSourceLineAtViewport } from '../src/renderer/src/components/ui/file-preview/markdownPreviewModeLocation'
import { readMonacoDocumentSymbolsWithRetry } from '../src/renderer/src/components/ui/file-preview/monacoDocumentSymbols'
import { attachPreviewEditorLifecycle } from '../src/renderer/src/components/ui/file-preview/monacoPreviewEditorLifecycle'

const markdownOutline = buildMarkdownOutline([
    '# Contributing to Zyra',
    '',
    '## Before opening a change',
    '',
    '### Checks',
    '',
    '## Pull requests'
].join('\n'))
assert.deepEqual(markdownOutline.map((item) => item.name), ['Contributing to Zyra'])
assert.deepEqual(markdownOutline[0]?.children.map((item) => item.name), ['Before opening a change', 'Pull requests'])
assert.equal(markdownOutline[0]?.children[0]?.children[0]?.name, 'Checks')
assert.equal(markdownOutline[0]?.children[1]?.headingId, 'pull-requests')
assert.equal(markdownOutline[0]?.children[0]?.endLine, 6, 'heading ranges stop before the next peer heading')

const pythonOutline = buildStructuralOutline([
    'class Workshop:',
    '    def open_project(self, path):',
    '        return path',
    '',
    '    async def run_checks(self):',
    '        return True',
    '',
    'def main():',
    '    return Workshop()'
].join('\n'), 'python')
assert.deepEqual(pythonOutline.map((item) => item.name), ['Workshop', 'main'])
assert.deepEqual(pythonOutline[0]?.children.map((item) => item.name), ['open_project', 'run_checks'])
assert.equal(pythonOutline[0]?.children[1]?.startLine, 5)

const rustOutline = buildStructuralOutline([
    'pub struct Session {',
    '    id: String,',
    '}',
    '',
    'impl Session {',
    '    pub fn title(&self) -> &str {',
    '        "Zyra"',
    '    }',
    '}'
].join('\n'), 'rust')
assert.deepEqual(rustOutline.map((item) => item.name), ['Session', 'Session'])
assert.equal(rustOutline[1]?.children[0]?.name, 'title')

const typescriptOutline = buildStructuralOutline([
    'import {',
    '    type ImportedShape,',
    '    useState',
    '} from \'react\'',
    '',
    'type LocalShape = { value: string }',
    '',
    'function realFunction() {',
    '    setLoading(false)',
    '}',
    '',
    'const arrowFunction = () => {',
    '    setQuery(\'\')',
    '}',
    '',
    'class Workshop {',
    '    run() {',
    '        focusVisibleItem(0)',
    '    }',
    '}'
].join('\n'), 'typescript')
assert.deepEqual(
    flattenVisibleOutline(typescriptOutline, new Set(), false).map(({ item }) => item.name),
    ['LocalShape', 'realFunction', 'arrowFunction', 'Workshop', 'run'],
    'the fast TypeScript map excludes imported names and ordinary function calls'
)

const authoritativeSymbol = {
    name: 'realFunction',
    detail: '',
    kind: 11,
    range: { startLineNumber: 8, startColumn: 1, endLineNumber: 10, endColumn: 2 },
    selectionRange: { startLineNumber: 8, startColumn: 10, endLineNumber: 8, endColumn: 22 },
    children: []
}
let symbolProviderCalls = 0
const retryWaits: number[] = []
const retryModel = { getLanguageId: () => 'typescript' }
const retryEditor = {
    getModel: () => retryModel,
    _commandService: {
        executeCommand: async () => {
            symbolProviderCalls += 1
            return symbolProviderCalls === 1 ? [] : [authoritativeSymbol]
        }
    }
}
const retriedSymbols = await readMonacoDocumentSymbolsWithRetry(
    retryEditor as unknown as Parameters<typeof readMonacoDocumentSymbolsWithRetry>[0],
    {
        retryDelaysMs: [90],
        wait: async (delayMs) => { retryWaits.push(delayMs) }
    }
)
assert.equal(symbolProviderCalls, 2, 'an initially empty Monaco provider receives one bounded readiness retry')
assert.deepEqual(retryWaits, [90])
assert.deepEqual(retriedSymbols, [authoritativeSymbol], 'the authoritative language-service outline replaces the quick map once ready')

const editorLifecycleNotifications: Array<unknown | null> = []
let notifyModelChanged = () => undefined
let modelListenerDisposed = false
const lifecycleEditor = {
    onDidChangeModel: (listener: () => void) => {
        notifyModelChanged = listener
        return { dispose: () => { modelListenerDisposed = true } }
    }
}
const detachEditorLifecycle = attachPreviewEditorLifecycle(
    lifecycleEditor as unknown as Parameters<typeof attachPreviewEditorLifecycle>[0],
    (editor) => { editorLifecycleNotifications.push(editor) }
)
assert.deepEqual(editorLifecycleNotifications, [lifecycleEditor], 'the preview editor is published on its first mount')
notifyModelChanged()
assert.deepEqual(editorLifecycleNotifications, [lifecycleEditor, lifecycleEditor], 'a reused Monaco editor is republished after switching file models')
detachEditorLifecycle()
assert.equal(modelListenerDisposed, true)
assert.deepEqual(editorLifecycleNotifications, [lifecycleEditor, lifecycleEditor, null], 'unmount clears the editor instead of leaving a hidden stale model')

const filtered = filterDocumentOutline(pythonOutline, 'checks')
assert.deepEqual(filtered.map((item) => item.name), ['Workshop'], 'search retains the ancestor chain')
assert.deepEqual(filtered[0]?.children.map((item) => item.name), ['run_checks'])

const collapsed = new Set([pythonOutline[0]!.id])
assert.deepEqual(
    flattenVisibleOutline(pythonOutline, collapsed, false).map(({ item }) => item.name),
    ['Workshop', 'main'],
    'collapsed branches hide their descendants'
)
assert.deepEqual(
    flattenVisibleOutline(filtered, collapsed, true).map(({ item }) => item.name),
    ['Workshop', 'run_checks'],
    'search temporarily expands matching branches'
)
assert.equal(findDeepestOutlineItemAtLine(pythonOutline, 5)?.name, 'run_checks')
assert.equal(documentOutlineLanguageLabel('code', 'tsx'), 'TypeScript')
assert.equal(documentOutlineLanguageLabel('md'), 'Markdown')
assert.equal(documentOutlineLanguageLabel('json'), 'JSON')
assert.equal(shouldRefreshOutlineImmediately('code', 'file.ts', 'file.ts'), false, 'typing retains the accurate code outline until its debounced replacement is ready')
assert.equal(shouldRefreshOutlineImmediately('md', 'README.md', 'README.md'), true, 'Markdown headings continue updating directly from source')
assert.equal(shouldRefreshOutlineImmediately('code', 'first.ts', 'second.ts'), true, 'a different code file receives its own immediate map')
const largeOutlineRange = computePreviewVirtualRange({
    rowCount: 5_000,
    rowHeight: 24,
    scrollTop: 60_000,
    viewportHeight: 600,
    overscan: 8
})
assert.equal(largeOutlineRange.end - largeOutlineRange.start <= 42, true, 'large outlines mount only the viewport and a small overscan')

const locationMarkdown = '# Start\n\none\n\n## Middle\n\ntwo\n\n## End\n\nthree\n'
assert.deepEqual(
    resolveMarkdownLineAnchor(locationMarkdown, 7),
    { sourceLine: 7, startHeadingId: 'middle', endHeadingId: 'end', progress: 0.5 },
    'editor lines map between their surrounding rendered Markdown headings'
)
assert.equal(resolveMarkdownSourceLineAtViewport({
    content: locationMarkdown,
    viewportTop: 250,
    documentTop: 0,
    documentBottom: 500,
    headingPositions: [
        { id: 'start', top: 0 },
        { id: 'middle', top: 200 },
        { id: 'end', top: 300 }
    ]
}), 7, 'rendered Markdown positions map back to the corresponding source line')

const panelSource = readFileSync(new URL('../src/renderer/src/components/ui/file-preview/PreviewOutlinePanel.tsx', import.meta.url), 'utf8')
const contextSource = readFileSync(new URL('../src/renderer/src/components/ui/file-preview/PreviewContextSidebar.tsx', import.meta.url), 'utf8')
const monacoBridgeSource = readFileSync(new URL('../src/renderer/src/components/ui/file-preview/monacoDocumentSymbols.ts', import.meta.url), 'utf8')
const monacoEditorSource = readFileSync(new URL('../src/renderer/src/components/ui/file-preview/MonacoPreviewEditor.tsx', import.meta.url), 'utf8')
assert.equal(panelSource.includes('placeholder="Search"'), true, 'the outline exposes a concise search prompt')
assert.equal(panelSource.includes('Mapping file...'), true, 'the outline describes its loading work in plain file-level language')
assert.equal(panelSource.includes('<FileEntryIcon'), true, 'the outline footer uses the existing file-language icon system')
assert.equal(panelSource.includes("symbolCount === 1 ? 'entry' : 'entries'"), true, 'the outline footer labels the language-specific entry count')
assert.equal(panelSource.includes('useLayoutEffect(() => {'), true, 'the lightweight file map is ready before the outline paints')
assert.equal(panelSource.includes('readMonacoDocumentSymbolsWithRetry(editor'), true, 'the panel upgrades its quick map to bounded-retry Monaco symbols')
assert.equal(panelSource.includes('usePreviewVirtualWindow({'), true, 'large outlines use the shared lightweight fixed-row virtual window')
assert.equal(panelSource.includes('visibleItems.slice(range.start, range.end)'), true, 'only the current outline window renders during scrolling')
assert.equal(
    panelSource.indexOf('void refreshLanguageOutline()') < panelSource.indexOf('const scheduleRefresh = () =>'),
    true,
    'the initial language-service map starts immediately while edit refreshes remain debounced'
)
assert.equal(panelSource.includes('editor.revealPositionNearTop(position, 0)'), true, 'code symbols reveal their real editor position')
assert.equal(panelSource.includes('MARKDOWN_PREVIEW_NAVIGATE_EVENT'), true, 'Markdown headings use the virtual preview navigation path')
assert.equal(contextSource.includes("type SidebarMode = 'outline' | 'inspector'"), true, 'Outline and Inspector remain separate dock modes')
assert.equal(contextSource.includes('flex h-7 w-full shrink-0 items-stretch'), true, 'the section switcher is a slim full-width strip')
assert.equal(contextSource.includes("flexBasis: active ? '88px' : '28px'"), true, 'inactive sections collapse to icons while the active section expands')
assert.equal(contextSource.includes('flex-grow 360ms cubic-bezier(0.22,1,0.36,1)'), true, 'section expansion uses the slower eased motion curve')
assert.equal(contextSource.includes("'ml-1.5 max-w-[72px] translate-x-0 opacity-100 delay-75 duration-300'"), true, 'the active label follows the tab expansion with a short stagger')
assert.equal(contextSource.includes("'scale-x-100 opacity-100 delay-100 duration-300'"), true, 'the active underline resolves after the section begins expanding')
assert.equal(contextSource.includes('rounded-'), false, 'the section strip keeps sharp corners')
assert.equal(monacoBridgeSource.includes("'_executeDocumentSymbolProvider'"), true, 'Monaco language-service symbols are used before syntax fallback')
assert.equal(monacoEditorSource.includes('attachPreviewEditorLifecycle('), true, 'the real preview editor republishes reused file models to Outline')

console.log('file outline tests passed')
