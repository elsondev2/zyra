import path from 'node:path'
import { build, stop } from 'esbuild'

export async function buildBrowserVendor(root) {
  const desktop = path.resolve(root, '../../desktop')
  try {
    await build({
      absWorkingDir: desktop, entryPoints: {monaco:'monaco-editor'},
      outdir: path.join(root,'dist/browser-vendor/monaco'),
      bundle:true, splitting:true, format:'esm', platform:'browser', target:'chrome125',
      chunkNames:'chunks/[name]-[hash]', assetNames:'assets/[name]-[hash]',
      loader:{'.ttf':'file','.wasm':'file'}, legalComments:'eof',
      define:{'process.env.NODE_ENV':'"production"'}
    })
    console.log('Built local Monaco editor and styles')
  } finally { stop() }
}
