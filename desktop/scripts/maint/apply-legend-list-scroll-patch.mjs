import { readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const LEGEND_LIST_VERSION = '3.3.5'
const scriptDirectory = dirname(fileURLToPath(import.meta.url))
const desktopDirectory = resolve(scriptDirectory, '../..')
const packageDirectory = resolve(desktopDirectory, 'node_modules/@legendapp/list')
const packageMetadata = JSON.parse(await readFile(resolve(packageDirectory, 'package.json'), 'utf8'))

if (packageMetadata.version !== LEGEND_LIST_VERSION) {
    throw new Error(
        `LegendList scroll patch expects ${LEGEND_LIST_VERSION}, found ${packageMetadata.version}. Review the upstream fix before changing versions.`
    )
}

const originalBlock = [
    '            temporaryPaddingRef.current = { baseline: baselinePaddingEnd, value: temporaryPaddingEnd };',
    '            contentNode.style[axis.paddingEndProp] = temporaryPaddingEnd;'
].join('\n')
const patchedBlock = [
    '            contentNode.style[axis.paddingEndProp] = temporaryPaddingEnd;',
    '            temporaryPaddingRef.current = { baseline: baselinePaddingEnd, value: contentNode.style[axis.paddingEndProp] };'
].join('\n')

// Connected containers all belong to this same parent. Atomic moves preserve
// iframe documents, native details state and focus while restoring DOM order.
// Older browser clients retain LegendList's original insertion behavior.
const originalReorder = [
    '      if (nextStableElement) {',
    '        container.insertBefore(element, nextStableElement);',
    '      } else {',
    '        container.appendChild(element);',
    '      }'
].join('\n')
const patchedReorder = [
    '      if (typeof container.moveBefore === "function") {',
    '        container.moveBefore(element, nextStableElement);',
    '      } else if (nextStableElement) {',
    '        container.insertBefore(element, nextStableElement);',
    '      } else {',
    '        container.appendChild(element);',
    '      }'
].join('\n')
const patches = [
    { name: 'scroll padding', original: originalBlock, patched: patchedBlock },
    { name: 'state-preserving DOM reorder', original: originalReorder, patched: patchedReorder }
]
let appliedCount = 0
for (const fileName of ['react.js', 'react.mjs']) {
    const filePath = resolve(packageDirectory, fileName)
    const source = await readFile(filePath, 'utf8')
    let next = source
    for (const patch of patches) {
        if (next.includes(patch.patched)) continue
        if (next.split(patch.original).length !== 2) {
            throw new Error(`LegendList ${patch.name} patch expected one matching block in ${fileName}.`)
        }
        next = next.replace(patch.original, patch.patched)
    }
    if (next === source) continue
    await writeFile(filePath, next, 'utf8')
    appliedCount += 1
}

console.log(
    appliedCount > 0
        ? `[legend-list-scroll-patch] patched ${appliedCount} web bundle${appliedCount === 1 ? '' : 's'}`
        : '[legend-list-scroll-patch] already applied'
)
