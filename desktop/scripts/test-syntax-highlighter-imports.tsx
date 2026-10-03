import assert from 'node:assert/strict'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { Prism, PrismLight, createElement as createSyntaxElement } from 'react-syntax-highlighter'
import DirectPrism from 'react-syntax-highlighter/dist/esm/prism'
import DirectPrismLight from 'react-syntax-highlighter/dist/esm/prism-light'
import directCreateElement from 'react-syntax-highlighter/dist/esm/create-element'
import { oneDark, oneLight } from 'react-syntax-highlighter/dist/esm/styles/prism'
import directOneDark from 'react-syntax-highlighter/dist/esm/styles/prism/one-dark'
import directOneLight from 'react-syntax-highlighter/dist/esm/styles/prism/one-light'

// Bun resolves the package root to CJS and explicit dist/esm paths to ESM.
// Compare their behavior rather than separate module instances' identities.
assert.equal(typeof PrismLight.registerLanguage, typeof DirectPrismLight.registerLanguage)
assert.deepEqual(oneDark, directOneDark)
assert.deepEqual(oneLight, directOneLight)
const elementProps = { node: { type: 'text' as const, value: 'same source' }, stylesheet: oneDark, useInlineStyles: true, key: 'source' }
assert.equal(renderToStaticMarkup(createSyntaxElement(elementProps)), renderToStaticMarkup(directCreateElement(elementProps)))
assert.deepEqual(Prism.supportedLanguages, DirectPrism.supportedLanguages)
for (const language of ['tsx', 'python', 'rust', 'go', 'cpp', 'css', 'yaml', 'markdown', 'unrecognized-language']) {
    for (const [before, after] of [[oneDark, directOneDark], [oneLight, directOneLight]]) {
        const props = { language, children: 'const ready = "yes";\nprint(ready)\n', wrapLongLines: true, showLineNumbers: true }
        assert.equal(renderToStaticMarkup(createElement(Prism, { ...props, style: before })),
            renderToStaticMarkup(createElement(DirectPrism, { ...props, style: after })))
    }
}
console.log('Direct syntax imports preserve the full Prism language set, light registration API, element factory, themes and rendered output.')
