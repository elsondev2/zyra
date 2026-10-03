import { build } from 'esbuild';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import electronPath from 'electron';
const desktop = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const directory = await mkdtemp(join(tmpdir(), 'zyra-background-browser-'));
try {
    const main = join(directory, 'main.cjs');
    await build({ entryPoints: [join(desktop, 'scripts/fixtures/background-browser-native.ts')], outfile: main, bundle: true, platform: 'node', format: 'cjs', define: { 'import.meta.url': JSON.stringify(pathToFileURL(join(desktop, 'src/main/zyra/zyra-root.ts')).href) }, external: ['electron', 'better-sqlite3', 'node-pty'], plugins: [{ name: 'isolated-browser-profile', setup(context) { context.onResolve({ filter: /browser-preview-handlers$/ }, () => ({ path: join(desktop, 'scripts/fixtures/accessory-browser-native-services.ts') })); } }] });
    const env = { ...process.env, ZYRA_BACKGROUND_TEST_PROFILE: join(directory, 'profile'), ZYRA_BACKGROUND_TEST_SCREENSHOT: join(desktop, '..', 'docs.local', 'verification', 'background-browser-cursor.png') };
    delete env.ELECTRON_RUN_AS_NODE;
    process.exitCode = await new Promise((resolveExit, reject) => {
        const child = spawn(electronPath, [main], { cwd: desktop, env, stdio: 'inherit', windowsHide: true });
        const watchdog = setTimeout(() => { console.error('Background Browser fixture exceeded its deadline'); child.kill(); }, 35000);
        child.once('error', error => { clearTimeout(watchdog); reject(error); });
        child.once('exit', code => { clearTimeout(watchdog); resolveExit(code ?? 1); });
    });
} finally {
    if (dirname(resolve(directory)) !== resolve(tmpdir()) || !basename(directory).startsWith('zyra-background-browser-')) throw new Error('Unexpected fixture cleanup path');
    await rm(directory, { recursive: true, force: true, maxRetries: 8, retryDelay: 250 });
}
