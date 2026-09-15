import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import os from 'node:os';
import { resolveConfig } from 'electron-vite';
import { build } from 'vite';

// Exercise the same development resolver that powers Electron's main bundle.
// Production builds suppress missing optional-peer modules and miss this failure.
const desktop = fileURLToPath(new URL('../', import.meta.url));
const repo = path.dirname(desktop);
process.chdir(desktop);
process.env.NODE_ENV = 'development';
process.env.NODE_ENV_ELECTRON_VITE = 'development';
const { config } = await resolveConfig({}, 'serve', 'development');
const directory = mkdtempSync(path.join(os.tmpdir(), 'zyra-mobile-dev-bundle-'));
try {
  await build({
    ...config.main,
    configFile: false,
    mode: 'development',
    logLevel: 'warn',
    build: {
      ...config.main.build,
      ssr: true,
      outDir: directory,
      minify: false,
      rollupOptions: {
        input: path.join(repo, 'mobile/gateway/src/desktop-entry.mjs'),
        output: { format: 'es', entryFileNames: 'gateway.mjs' }
      }
    }
  });
  const result = spawnSync(process.execPath, ['--test', path.join(repo, 'mobile/gateway/test/wire.test.mjs')], {
    stdio: 'inherit',
    env: { ...process.env, ZYRA_GATEWAY_TEST_BUNDLE: pathToFileURL(path.join(directory, 'gateway.mjs')).href },
    timeout: 30000
  });
  assert.ifError(result.error);
  assert.equal(result.status, 0, 'Development bundle must load and complete TLS pairing and large-frame transfers');
} finally {
  rmSync(directory, { recursive: true, force: true });
}
