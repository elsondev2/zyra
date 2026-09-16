import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';
const root = fileURLToPath(new URL('../../', import.meta.url));
const source = path.join(root, 'desktop/node_modules/material-icon-theme');
const dest = path.join(root, 'mobile/android/app/src/main/assets');
const manifest = JSON.parse(readFileSync(path.join(source, 'dist/material-icons.json')));
const write = (name, bytes) => {
  const target = path.join(dest, name);
  if (process.argv.includes('--check')) assert.deepEqual(readFileSync(target), Buffer.from(bytes), name);
  else { mkdirSync(path.dirname(target), { recursive: true }); writeFileSync(target, bytes); }
};
const definitions = {};
for (const [key, value] of Object.entries(manifest.iconDefinitions)) {
  const name = path.basename(value.iconPath);
  assert.match(name, /^[a-zA-Z0-9_.-]+\.svg$/);
  definitions[key] = name;
  write('file-icons/' + name, readFileSync(path.join(source, 'icons', name)));
}
const fields = ['fileNames', 'fileExtensions', 'folderNames', 'folderNamesExpanded', 'rootFolderNames', 'rootFolderNamesExpanded', 'file', 'folder', 'folderExpanded', 'rootFolder', 'rootFolderExpanded', 'light'];
write('desktop-file-icons.json', JSON.stringify({ definitions, ...Object.fromEntries(fields.map(key => [key, manifest[key]])) }));
write('licenses/material-icons.txt', readFileSync(path.join(source, 'LICENSE')));
console.log(`${Object.keys(definitions).length} Desktop file icons ${process.argv.includes('--check') ? 'verified' : 'synced'}.`);
