import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../src/renderer/src/components/ui/file-preview/usePreviewFileSearch.ts', import.meta.url), 'utf8')
assert.doesNotMatch(source, /__zyra_search_catalog_warm__|warmPreviewFileSearchIndex|requestIdleCallback\(warm/, 'opening Files must not index the whole project before a search')
assert.match(source, /if \(!normalizedQuery \|\| !normalizedProjectPath \|\| !normalizedScopePath\)/, 'an empty query stops before indexed search')
assert.match(source, /searchIndexedPaths\(\{[\s\S]*?term: normalizedQuery/, 'a real query still searches the index')
console.log('Preview file search startup check passed')
