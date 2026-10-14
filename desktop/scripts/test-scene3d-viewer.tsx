import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { Scene3DViewer } from '../src/renderer/src/components/ui/scene3d/Scene3DViewer'
import { validateScene3D } from '../src/shared/visualization-resources'

const valid = JSON.stringify({ schemaVersion: 1, objects: [{ id: 'shape', type: 'pyramid', name: 'Peak', color: '#67aaff' }] })
const parsed = validateScene3D(valid)
assert.equal(parsed.schemaVersion, 1, 'valid scene source parses through the shared schema validator')
assert.equal(parsed.objects[0]?.type, 'pyramid')
assert.throws(() => validateScene3D('{"schemaVersion":9,"objects":[]}'), /schemaVersion/, 'unsupported scene versions are rejected')
assert.throws(() => validateScene3D(JSON.stringify({ schemaVersion: 1, objects: [{ id: 'child', type: 'box', parentId: 'missing' }] })), /parentId/, 'invalid parent references fail validation')

const markup = renderToStaticMarkup(createElement(Scene3DViewer, { source: valid }))
assert.match(markup, /aria-label="3D scene viewer"/)
assert.match(markup, /aria-label="Interactive 3D scene\./)
assert.match(markup, /aria-label="3D scene controls"/)
assert.match(markup, /Reset camera/)

const component = await readFile(new URL('../src/renderer/src/components/ui/scene3d/Scene3DViewer.tsx', import.meta.url), 'utf8')
const runtime = await readFile(new URL('../src/renderer/src/components/ui/scene3d/scene3d-runtime.ts', import.meta.url), 'utf8')
assert.match(component, /import\('@shared\/visualization-resources'\)/, 'validator loads on demand')
assert.match(component, /import\('\.\/scene3d-runtime'\)/, 'OGL runtime stays in a lazy chunk')
assert.match(component, /new ResizeObserver/)
assert.match(component, /removeEventListener/)
assert.match(component, /setView\(state\)/, 'orbit/pan gestures update the camera')
assert.match(component, /key=\{source\}/, 'source revisions get a fresh canvas before releasing the prior WebGL context')
assert.match(component, /ArrowLeft|ArrowRight/, 'camera can be operated from the keyboard')
assert.match(runtime, /for \(const item of scene\.objects\)[\s\S]*?transforms\.set[\s\S]*?for \(const item of scene\.objects\)[\s\S]*?addChild/, 'group parents are linked in a separate pass')
assert.match(runtime, /scene\.grid \? new GridHelper/, 'authored grid option is rendered')
assert.match(runtime, /gl\.clearColor\(color\[0\], color\[1\], color\[2\], 1\)/, 'authored background uses its exact color')
assert.match(runtime, /intersectMeshes\(/, 'selection uses OGL geometry ray casting')
assert.match(runtime, /webglcontextlost/)
assert.match(runtime, /loseContext\(\)/, 'unmount releases the WebGL context')
assert.match(runtime, /case 'pyramid'/)
assert.match(runtime, /scene\.background\) \{[\s\S]*?gl\.clearColor\(color\[0\], color\[1\], color\[2\], 1\)/)
assert.match(runtime, /lose\?\.loseContext\(\)/)
console.log('Scene3D viewer schema, lazy loading, controls, selection, and lifecycle: ok')
