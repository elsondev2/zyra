import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../src/renderer/src/index.css', import.meta.url), 'utf8')

assert.match(
    source,
    /::-webkit-scrollbar-track,[\s\S]*::-webkit-scrollbar-thumb,[\s\S]*::-webkit-scrollbar-corner[\s\S]*border-radius:\s*0\s*!important/,
    'every native app scrollbar surface must have square corners'
)
assert.match(
    source,
    /\.monaco-scrollable-element\s*>\s*\.scrollbar\s*>\s*\.slider[\s\S]*border-radius:\s*0\s*!important/,
    'Monaco virtual scrollbar sliders must follow the same square-corner rule'
)

console.log('Sharp scrollbar corners: ok')
