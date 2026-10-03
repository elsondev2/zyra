import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'

const source = (path: string) => readFileSync(new URL(`../src/renderer/src/${path}`, import.meta.url), 'utf8')
const settings = source('pages/settings/FilesEditorSettings.tsx')
assert.match(settings, /control=\{<DiffLayoutPicker/, 'The visual selector sits in the right-hand setting control column')
assert.match(settings, /<DiffLayoutPicker[\s\S]*value=\{settings\.fileDiffRenderMode\}[\s\S]*updateSettings\(\{ fileDiffRenderMode \}\)/, 'Visual selection uses the existing persisted preference')

const { DiffLayoutPicker } = await import('../src/renderer/src/pages/settings/DiffLayoutPicker')
for (const value of ['stacked', 'split'] as const) {
    const html = renderToStaticMarkup(<DiffLayoutPicker value={value} onChange={() => {}} />)
    assert.match(html, /role="radiogroup" aria-label="File diff layout"/)
    assert.match(html, /ml-auto[^\"]*max-w-\[280px\]/, 'Selector stays compact and right aligned')
    assert.match(html, /flex h-2\.5 items-center/, 'Preview rows use the shorter height')
    assert.doesNotMatch(html, /Changes in one column|Before and after side by side/, 'Choices use previews and labels without explanatory text')
    assert.equal((html.match(/type="radio"/g) || []).length, 2)
    assert.equal((html.match(/checked=""/g) || []).length, 1)
    assert.match(html, new RegExp(`checked="" value="${value}"`))
    assert.match(html, /Stacked/)
    assert.match(html, /Split/)
    assert.equal((html.match(/data-diff-layout-preview=/g) || []).length, 2)
    assert.doesNotMatch(html, /role="combobox"|<select/)
}
// Capture the real input handlers during a React render, without mocking hooks.
const changes: string[] = []
function InteractionProbe() {
    const tree = DiffLayoutPicker({ value: 'stacked', onChange: value => changes.push(value) })
    for (const label of tree.props.children) {
        const input = label.props.children[0]
        assert.equal(input.props.checked, input.props.value === 'stacked')
        input.props.onChange()
    }
    return tree
}
renderToStaticMarkup(<InteractionProbe />)
assert.deepEqual(changes, ['stacked', 'split'], 'Both real radio callbacks forward their stored preference values')

const picker = source('pages/settings/DiffLayoutPicker.tsx')
assert.match(picker, /onChange=\{\(\) => onChange\(option\.value\)\}/, 'Native radio changes forward the chosen layout')
assert.match(picker, /peer-focus-visible:/, 'Keyboard focus remains visible on each preview')
const viewer = source('components/ui/diff-viewer/PatchDiffViewer.tsx')
assert.match(viewer, /mode === 'split' \? 'split' : 'unified'/, 'Stacked preview corresponds to the actual unified viewer')
console.log('Diff layout settings: visual previews, native radio selection, focus and persistence wiring: ok')
