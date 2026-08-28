#!/usr/bin/env node
import { spawn } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const packageJson = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'))
const forwardedArgs = process.argv.slice(2)
const inlineArg = (name) => forwardedArgs.find((value) => value.startsWith(`--${name}=`))?.slice(name.length + 3)
const version = String(inlineArg('version') || packageJson.version || '0.0.0')
const hasOutput = forwardedArgs.some((value) => value.startsWith('--output='))
const output = path.join(root, 'dist', `zyra-v${version}.zip`)
const builder = path.join(root, 'scripts', 'build-tui-release.mjs')

await run(process.execPath, [
  builder,
  ...forwardedArgs,
  ...(forwardedArgs.some((value) => value.startsWith('--version=')) ? [] : [`--version=${version}`]),
  ...(hasOutput ? [] : [`--output=${output}`]),
])

console.log('The final cross-platform SHA256SUMS is generated only after every release asset is assembled and validated.')

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: root,
      stdio: 'inherit',
      windowsHide: true,
    })
    child.once('error', reject)
    child.once('exit', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`${command} exited with code ${code ?? 'unknown'}`))
    })
  })
}
