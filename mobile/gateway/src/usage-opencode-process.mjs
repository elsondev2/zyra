import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const workerFile = fileURLToPath(new URL('./usage-opencode-worker.mjs', import.meta.url));
const OUTPUT_LIMIT = 2 * 1024 * 1024;
/** One owned child; SIGKILL interrupts native SQLite too. Callers serialize usage slices. */
export function queryOpenCodeUsage(input, { timeoutMs = 3000, launch = spawn } = {}) {
  return new Promise(resolve => {
    let child, timer, failed = false, closed = false, bytes = 0;
    const chunks = [];
    const finish = result => {
      if (closed) return;
      closed = true; clearTimeout(timer); process.removeListener('exit', killOnExit); resolve(result);
    };
    const killOnExit = () => { if (child && child.exitCode == null) child.kill('SIGKILL'); };
    const abort = () => { failed = true; killOnExit(); };
    try {
      child = launch(process.execPath, ['--max-old-space-size=64', '--no-warnings', workerFile], {
        shell: false, windowsHide: true, stdio: ['pipe', 'pipe', 'ignore'],
        env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', NODE_OPTIONS: '' }
      });
      process.once('exit', killOnExit);
      timer = setTimeout(abort, timeoutMs);
      child.once('error', () => { failed = true; finish({ unavailable: true }); });
      child.stdout.on('data', chunk => {
        bytes += chunk.length;
        if (bytes > OUTPUT_LIMIT) { abort(); return; }
        chunks.push(chunk);
      });
      child.once('close', code => {
        if (failed || code !== 0 || bytes === 0) return finish({ unavailable: true });
        try {
          const result = JSON.parse(Buffer.concat(chunks).toString('utf8'));
          finish(Array.isArray(result.rows) && result.rows.length <= 1000 ? result : { unavailable: true });
        } catch { finish({ unavailable: true }); }
      });
      child.stdin.on('error', abort);
      const request = JSON.stringify(input);
      if (Buffer.byteLength(request) > 8192) abort(); else child.stdin.end(request);
    } catch { killOnExit(); finish({ unavailable: true }); }
  });
}
