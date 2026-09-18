import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { build, stop } from 'esbuild'

export async function buildBrowserWorkers(root, selected) {
  const desktop = path.resolve(root, '../../desktop')
  const workers = JSON.parse(await readFile(path.join(root, 'scripts/browser-workers.json'), 'utf8'))
  for (const [name, worker] of Object.entries(workers)) {
    if (selected && !selected.includes(name)) continue
    try {
      await build({
        absWorkingDir:desktop, entryPoints:{[name]:worker.entry},
        outdir:path.join(root, 'dist/browser-workers'), bundle:true, splitting:true,
        format:'esm', platform:'browser', target:'chrome125',
        chunkNames:'chunks/[name]-[hash]', assetNames:'assets/[name]-[hash]',
        loader:{'.wasm':'file','.ttf':'file'}, legalComments:'eof',
        define:{'process.env.NODE_ENV':'"production"'}
      })
      console.log(`Built local browser worker: ${name}`)
    } finally { stop() }
  }
}
