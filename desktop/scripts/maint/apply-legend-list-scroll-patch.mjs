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

let appliedCount = 0
for (const fileName of ['react.js', 'react.mjs']) {
    const filePath = resolve(packageDirectory, fileName)
    const source = await readFile(filePath, 'utf8')
    if (source.includes(patchedBlock)) continue
    if (!source.includes(originalBlock)) {
        throw new Error(`LegendList scroll patch could not find the expected block in ${fileName}.`)
    }
    await writeFile(filePath, source.replace(originalBlock, patchedBlock), 'utf8')
    appliedCount += 1
}

console.log(
    appliedCount > 0
        ? `[legend-list-scroll-patch] patched ${appliedCount} web bundle${appliedCount === 1 ? '' : 's'}`
        : '[legend-list-scroll-patch] already applied'
)
