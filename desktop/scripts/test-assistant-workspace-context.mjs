import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { transformSync } from 'esbuild'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

const require = createRequire(import.meta.url)
const source = readFileSync(new URL('../src/renderer/src/pages/assistant/assistant-workspace-context.ts', import.meta.url), 'utf8')
const code = transformSync(source.replaceAll('import.meta.hot', 'hot'), { loader: 'ts', format: 'cjs' }).code
const hot = { data: {} }
function reload() {
    const exports = {}
    const module = { exports }
    new Function('require', 'module', 'exports', 'hot', code)(require, module, exports, hot)
    return module.exports
}
const previous = reload()
const refreshed = reload()
assert.equal(previous.AssistantWorkspaceContext, refreshed.AssistantWorkspaceContext)
function Consumer() {
    return createElement('span', null, refreshed.useAssistantWorkspaceLayout().paneLayout.test)
}
assert.equal(renderToStaticMarkup(createElement(previous.AssistantWorkspaceContext.Provider,
    { value: { paneLayout: { test: 'retained workspace' } } }, createElement(Consumer))), '<span>retained workspace</span>')
assert.throws(() => renderToStaticMarkup(createElement(Consumer)), /shared workspace layout/)
console.log('Workspace context survives module refresh with a retained provider; missing-provider errors remain explicit: ok')
