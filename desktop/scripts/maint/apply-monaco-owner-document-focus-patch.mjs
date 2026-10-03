import { readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// Zyra portals previews into same-origin native overlay documents. Monaco's
// standalone bundle only registers the importing window in getActiveElement(),
// so checking that global document misclassifies focus in a portaled editor.
// Keep shadow-root handling intact; only change the non-shadow fallback.
const expectedVersion = '0.56.0'
const desktop = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const packageRoot = resolve(desktop, 'node_modules/monaco-editor')
const metadata = JSON.parse(await readFile(resolve(packageRoot, 'package.json'), 'utf8'))
if (metadata.version !== expectedVersion) {
    throw new Error(`Monaco focus patch expects ${expectedVersion}, found ${metadata.version}. Review upstream focus handling before upgrading.`)
}
const patches = [
    {
        file: 'esm/vs/editor/browser/controller/editContext/native/nativeEditContextUtils.js',
        replacements: [{
            before: 'const activeElement = shadowRoot ? shadowRoot.activeElement : getActiveElement();',
            after: 'const activeElement = shadowRoot ? shadowRoot.activeElement : this._domNode.ownerDocument.activeElement;'
        }]
    },
    {
        file: 'esm/vs/editor/browser/controller/editContext/textArea/textAreaEditContextInput.js',
        replacements: [
            {
                before: 'return getActiveElement() === this._actual;',
                after: 'return this._actual.ownerDocument.activeElement === this._actual;'
            },
            {
                before: 'activeElement = getActiveElement();',
                after: 'activeElement = textArea.ownerDocument.activeElement;'
            }
        ]
    }
]
// Resolve every replacement before writing, so upstream drift cannot half-apply.
const updates = []
for (const patch of patches) {
    const path = resolve(packageRoot, patch.file)
    const original = await readFile(path, 'utf8')
    let source = original
    for (const { before, after } of patch.replacements) {
        if (source.includes(after)) continue
        if (source.split(before).length !== 2) throw new Error(`Monaco focus patch expected one matching block in ${patch.file}`)
        source = source.replace(before, after)
    }
    if (source !== original) updates.push({ path, source })
}
for (const { path, source } of updates) await writeFile(path, source, 'utf8')
console.log(`[monaco-owner-document-focus-patch] ${updates.length ? `patched ${updates.length} files` : 'already applied'}`)
