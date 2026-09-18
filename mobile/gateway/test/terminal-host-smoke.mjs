import { build } from '../../../desktop/node_modules/esbuild/lib/main.js';
import electron from '../../../desktop/node_modules/electron/index.js';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const outfile = path.join(root, 'mobile/.state/terminal-host-smoke.cjs');
await build({ entryPoints: [path.join(root, 'mobile/gateway/test/fixtures/terminal-host-smoke.ts')], outfile, bundle: true,
  platform: 'node', format: 'cjs', target: 'node22', external: ['node-pty'],
  alias: { 'electron-log': path.join(root, 'mobile/gateway/test/fixtures/terminal-log.ts') }, logLevel: 'warning' });
const code = await new Promise((resolve, reject) => {
  const child = spawn(electron, [outfile], { cwd: path.join(root, 'mobile/.state'), windowsHide: true,
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', NODE_PATH: path.join(root, 'desktop/node_modules') }, stdio: 'inherit' });
  child.on('error', reject); child.on('exit', code => resolve(code ?? 1));
});
process.exitCode = code;
