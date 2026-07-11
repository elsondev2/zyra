import { existsSync } from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

const repoRoot = process.cwd()
const electronDir = path.join(repoRoot, 'node_modules', 'electron')
const electronExe = path.join(electronDir, 'dist', process.platform === 'win32' ? 'electron.exe' : 'Electron')
const installScript = path.join(electronDir, 'install.js')

if (existsSync(electronExe)) {
  process.exit(0)
}

if (!existsSync(installScript)) {
  console.error('Electron package is missing install.js. Run your package manager install first.')
  process.exit(1)
}

console.log('Electron binary missing. Restoring local Electron install...')

const result = spawnSync(process.execPath, [installScript], {
  cwd: electronDir,
  stdio: 'inherit',
  env: process.env
})

if (result.status !== 0) {
  process.exit(result.status ?? 1)
}

if (!existsSync(electronExe)) {
  console.error('Electron install script completed, but the binary is still missing.')
  process.exit(1)
}
