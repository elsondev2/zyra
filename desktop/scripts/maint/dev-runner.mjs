import path from 'node:path'
import { spawn } from 'node:child_process'
import { installDevCommand } from '../../../scripts/install-dev-command.mjs'

try {
  const command = await installDevCommand()
  console.log(`Dev TUI command: zyra-dev (${command.path})`)
  if (!command.pathConfigured) console.log(`Add ${path.dirname(command.path)} to PATH to use zyra-dev.`)
} catch (error) {
  console.warn(`Could not register zyra-dev: ${error.message}`)
}

const electronViteCli = path.join(
  process.cwd(),
  'node_modules',
  'electron-vite',
  'dist',
  'cli.mjs'
)

const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE

const child = spawn(process.execPath, [electronViteCli, 'dev'], {
  stdio: 'inherit',
  env
})

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal)
    return
  }
  process.exit(code ?? 1)
})
