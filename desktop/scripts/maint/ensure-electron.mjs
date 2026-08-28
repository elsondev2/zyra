import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

const repoRoot = process.cwd()
const electronDir = path.join(repoRoot, 'node_modules', 'electron')
const electronExecutableRelativePath = process.platform === 'win32'
  ? 'electron.exe'
  : process.platform === 'darwin'
    ? path.join('Electron.app', 'Contents', 'MacOS', 'Electron')
    : 'electron'
const electronExe = path.join(electronDir, 'dist', electronExecutableRelativePath)
const electronVersionFile = path.join(electronDir, 'dist', 'version')
const electronPackageFile = path.join(electronDir, 'package.json')
const packageLockFile = path.join(repoRoot, 'package-lock.json')
const installScript = path.join(electronDir, 'install.js')

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf8'))
}

let expectedVersion
let installedPackageVersion
try {
  expectedVersion = readJson(packageLockFile).packages?.['node_modules/electron']?.version
  installedPackageVersion = readJson(electronPackageFile).version
} catch {
  console.error('Electron package metadata is incomplete. Run your package manager install first.')
  process.exit(1)
}

if (!expectedVersion || installedPackageVersion !== expectedVersion) {
  console.error(`Electron package mismatch: lockfile requires ${expectedVersion || 'an unknown version'}, but node_modules contains ${installedPackageVersion || 'nothing'}. Remove node_modules/electron and run your package manager install again.`)
  process.exit(1)
}

const installedBinaryVersion = existsSync(electronVersionFile)
  ? readFileSync(electronVersionFile, 'utf8').trim().replace(/^v/, '')
  : ''
if (existsSync(electronExe) && installedBinaryVersion === expectedVersion) {
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

const restoredVersion = existsSync(electronVersionFile)
  ? readFileSync(electronVersionFile, 'utf8').trim().replace(/^v/, '')
  : ''
if (!existsSync(electronExe) || restoredVersion !== expectedVersion) {
  console.error(`Electron install script completed without the required ${expectedVersion} runtime.`)
  process.exit(1)
}
