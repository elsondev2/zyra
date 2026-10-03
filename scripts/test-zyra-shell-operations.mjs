import assert from "node:assert/strict";
import path from "node:path";
import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import { createZyraLocalBashOperations } from "../src/zyra-shell-operations.mjs";

const chunks = [];
const environment = { ...Object.fromEntries(Object.entries(process.env).map(([key, value]) => [process.platform === "win32" ? key.toUpperCase() : key, value])), PI_SESSION_ID: "legacy-session", PI_MODEL: "legacy-model" };
const operations = createZyraLocalBashOperations({ env: environment });
const result = await operations.exec("printf shell-owned", process.cwd(), {
  onData: (chunk) => chunks.push(chunk.toString("utf8")),
});
assert.equal(result.exitCode, 0);
assert.equal(chunks.join(""), "shell-owned");

const cleanEnvironmentChunks = [];
await operations.exec("printf %s \"$PI_SESSION_ID\"", process.cwd(), {
  onData: (chunk) => cleanEnvironmentChunks.push(chunk.toString("utf8")),
});
assert.equal(cleanEnvironmentChunks.join(""), "");

const stdinChunks = [];
await operations.exec(`node -e "let text='';process.stdin.on('data',chunk=>text+=chunk);process.stdin.on('end',()=>console.log('stdin:'+text.length))"\nprintf 'tail-✓'`, process.cwd(), {
  onData: chunk => stdinChunks.push(chunk.toString("utf8"))
});
assert.equal(stdinChunks.join(""), "stdin:0\ntail-✓", "native child stdin stays empty; quoted multiline and Unicode scripts execute intact");

await assert.rejects(
  operations.exec("printf ignored", process.cwd(), { onData() {}, timeout: 0 }),
  /Invalid timeout: must be a finite number of seconds/,
);

await assert.rejects(
  operations.exec('node -e "setTimeout(()=>{},2000)"', process.cwd(), { onData() {}, timeout: 0.1 }),
  /timeout:0.1/,
);

assert.throws(
  () => createZyraLocalBashOperations({ shellPath: path.join(process.cwd(), "missing-bash.exe") }),
  /Custom shell path not found/,
);

if (process.platform === "win32") {
  const fixture = await mkdtemp(path.join(os.tmpdir(), "zyra-shell-orphan-"));
  const sibling = spawn(process.execPath, ["-e", "setInterval(()=>{},1000)"], { stdio: "ignore", windowsHide: true });
  let descendant;
  const alive = pid => { try { process.kill(pid, 0); return true; } catch { return false; } };
  try {
    const parent = path.join(fixture, "parent.cjs");
    await writeFile(parent, `const {spawn}=require('node:child_process');const child=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{detached:true,stdio:'ignore',windowsHide:true});child.unref();console.log('CHILD='+child.pid);setTimeout(()=>process.exit(0),50);`);
    const controller = new AbortController();
    let ready;
    const started = new Promise(resolve => { ready = resolve; });
    const execution = operations.exec(`node '${parent.replaceAll("\\", "/")}'`, process.cwd(), {
      signal: controller.signal,
      onData(chunk) {
        const match = /CHILD=(\d+)/.exec(chunk.toString());
        if (match) { descendant = Number(match[1]); ready(); }
      }
    });
    let completed = false;
    execution.then(() => { completed = true; }, () => { completed = true; });
    await Promise.race([started, new Promise((_resolve, reject) => setTimeout(() => reject(new Error("Background descendant did not start")), 5000))]);
    await new Promise(resolve => setTimeout(resolve, 300));
    assert(alive(descendant), "detached native descendant survives its intermediate parent");
    assert(!completed, "the managed command tracks live descendants even after the shell and all output pipes finish");
    const stopped = assert.rejects(execution, /aborted/);
    controller.abort();
    await stopped;
    assert(!alive(descendant), "stop must terminate an orphaned detached descendant before acknowledgement");
    assert(alive(sibling.pid), "stop must preserve an unrelated process");
  } finally {
    sibling.kill();
    if (descendant && alive(descendant)) process.kill(descendant);
    assert.equal(path.dirname(fixture), os.tmpdir());
    await rm(fixture, { recursive: true, force: true });
  }
}

console.log("Bash execution, timeout, environment and Windows orphaned/detached process ownership and cleanup: ok");
