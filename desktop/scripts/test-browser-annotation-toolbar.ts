import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../src/main/ipc/handlers/browser-preview-annotation-script.ts', import.meta.url), 'utf8')
assert.match(source, /cancelButton\.innerHTML = '<svg[^']*viewBox="0 0 24 24"[^']*<path d="M18 6 6 18M6 6l12 12"\/>/)
assert.match(source, /\.icon svg\{[^}]*width:16px;height:16px/)
assert.match(source, /cancelButton\.addEventListener\('click', cancel\)/)
console.log('Browser annotation toolbar icon check passed')
