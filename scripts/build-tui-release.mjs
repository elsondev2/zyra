import { spawn, spawnSync } from 'node:child_process'
import { mkdir, readFile } from 'node:fs/promises'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')
const args = Object.fromEntries(process.argv.slice(2).map((value) => {
  const [key, ...rest] = value.replace(/^--/, '').split('=')
  return [key, rest.join('=') || true]
}))
const packageJson = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'))
const version = String(args.version || packageJson.version)
const output = path.resolve(root, String(args.output || `zyra-v${version}.zip`))
const include = [
  'AGENTS.md', 'README.md', 'LICENSE', 'THIRD_PARTY_NOTICES.md',
  'package.json', 'package-lock.json', 'install.cmd', 'install.ps1', 'install.sh', 'zyra.cmd', 'zyra.ps1',
  'bin', 'src', 'prompts', 'agents', 'workflows', 'commands', 'themes'
]
await mkdir(path.dirname(output), { recursive: true })
const existing = include.filter((candidate) => {
  const result = spawnSync('git', ['ls-files', candidate], { cwd: root, encoding: 'utf8', windowsHide: true })
  return result.status === 0 && result.stdout.trim().length > 0
})
await run('git', ['archive', '--format=zip', `--output=${output}`, 'HEAD', '--', ...existing])
console.log(`Built standalone Zyra TUI ${version}: ${path.relative(root, output)}`)

function run(command, commandArgs, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, commandArgs, { cwd: root, windowsHide: true, stdio: options.allowFailure ? 'ignore' : 'inherit' })
    child.once('error', reject)
    child.once('exit', (code) => {
      if (code === 0 || options.allowFailure) resolve({ code: code ?? 1 })
      else reject(new Error(`${command} exited with ${code}`))
    })
  })
}
