import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'

for (const file of ['react.mjs', 'react.js']) {
    const source = await readFile(fileURLToPath(new URL(`../node_modules/@legendapp/list/${file}`, import.meta.url)), 'utf8')
    const start = source.indexOf('function sortDOMElements(')
    const end = source.indexOf('// src/', start)
    assert(start >= 0 && end > start, 'expected pinned LegendList reorder function')
    const sort = vm.runInNewContext(source.slice(start, end) + '\n;sortDOMElements')
    for (const atomic of [true, false]) {
        for (const order of [[0, 1, 2, 3], [3, 2, 1, 0], [1, 3, 0, 2], [2, 0, 3, 1]]) {
            const elements = order.map(index => ({ index }))
            const calls = []
            const container = {
                children: [...elements],
                insertBefore(node, reference) { calls.push('insert'); move(node, reference) },
                appendChild(node) { calls.push('append'); move(node, null) },
                ...(atomic ? { moveBefore(node, reference) { calls.push('atomic'); move(node, reference) } } : {})
            }
            function move(node, reference) {
                container.children.splice(container.children.indexOf(node), 1)
                container.children.splice(reference ? container.children.indexOf(reference) : container.children.length, 0, node)
            }
            sort(container, new Map(elements.map(element => [element, element.index])))
            assert.deepEqual(container.children.map(element => element.index), [0, 1, 2, 3], `${file}: DOM order must stay correct`)
            if (order.every((value, index) => value === index)) assert.equal(calls.length, 0, 'stable nodes need no move')
            else assert(calls.length > 0)
            if (atomic) assert(calls.every(call => call === 'atomic'), 'state-preserving moves must not fall back to removals')
            else assert(calls.every(call => call !== 'atomic'), 'older engines retain the insertion fallback')
        }
    }
}
console.log('LegendList stateful reorder: both web bundles preserve order, stable nodes, atomic moves and older-engine fallback')
