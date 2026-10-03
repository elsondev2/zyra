import { existsSync, mkdirSync, readFileSync, realpathSync, symlinkSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { developmentEnvironment } from '../src/development-launcher.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = name => { const i = args.indexOf(name); return i < 0 ? undefined : args[i + 1]; };
const home = path.resolve(opt('--home') || os.homedir());
const env = developmentEnvironment({ root, home });
const config = { root, stateDirectory: opt('--state-directory') || env.ZYRA_STATE_DIR,
  channel: opt('--channel') || env.ZYRA_AGENT_SERVER_CHANNEL };
const installed = [];
for (const name of ['full-send', 'zyra-tools']) {
  const source = path.join(root, 'skills', name);
  for (const base of [['.agents', 'skills'], ['.codex', 'skills'], ['.pi', 'agent', 'skills'], ['.zyra', 'skills']]) {
    const target = path.join(home, ...base, name);
    mkdirSync(path.dirname(target), { recursive: true });
    if (existsSync(target)) {
      if (realpathSync(target).toLowerCase() !== realpathSync(source).toLowerCase()) throw new Error(`Existing skill is preserved: ${target}. Resolve its location before installing.`);
    } else symlinkSync(source, target, process.platform === 'win32' ? 'junction' : 'dir');
    installed.push(target);
  }
}
const directory = path.join(home, '.pi', 'agent', 'extensions', 'zyra-tools');
mkdirSync(directory, { recursive: true });
const extension = `// Managed by Zyra scripts/install-agent-tooling.mjs. No Pi dependency is imported by Zyra.\nimport { readFileSync } from 'node:fs';\nimport { fileURLToPath, pathToFileURL } from 'node:url';\nimport { join, dirname } from 'node:path';\nexport default async function (pi) {\n  const config = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'connection.json'), 'utf8'));\n  const tools = await import(pathToFileURL(join(config.root, 'src/integrations/pi/zyra-tools.mjs')).href);\n  const attention = await import(pathToFileURL(join(config.root, 'src/integrations/pi/attention.mjs')).href);\n  tools.registerPiZyraTools(pi, config);\n  attention.registerPiAttention(pi);\n}\n`;
const index = path.join(directory, 'index.ts');
if (existsSync(index) && !readFileSync(index, 'utf8').includes('Managed by Zyra scripts/install-agent-tooling.mjs')) throw new Error('An unmanaged Pi extension already exists; it was preserved.');
writeFileSync(index, extension);
writeFileSync(path.join(directory, 'connection.json'), `${JSON.stringify(config, null, 2)}\n`);
// No credentials, no persistent services, and no changes to provider defaults.
process.stdout.write(`${JSON.stringify({ installed, extension: index, connection: config, activation: 'Pi /reload; newly built Zyra server/desktop for gateway methods; fresh Codex session for skill discovery' }, null, 2)}\n`);
