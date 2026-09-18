import { readFileSync, writeFileSync, readdirSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';

const root = fileURLToPath(new URL('../../', import.meta.url));
const source = path.join(root, 'desktop/src/renderer/src/assets/plugin-logos');
const destination = path.join(root, 'mobile/android/app/src/main');
const catalog = JSON.parse(readFileSync(path.join(root, 'desktop/src/shared/plugins/openai-directory.json'), 'utf8'));
const known = new Set(catalog.entries.map(entry => entry.name));
const rows = [];
function output(relative, value) {
  const target = path.join(destination, relative), bytes = Buffer.from(value);
  if (process.argv.includes('--check')) assert.deepEqual(readFileSync(target), bytes, `${relative} differs from Desktop`);
  else { mkdirSync(path.dirname(target), {recursive:true}); writeFileSync(target, bytes); }
}
for (const file of readdirSync(source).sort()) {
  const parsed = path.parse(file);
  if (!known.has(parsed.name) || !['.png','.jpg'].includes(parsed.ext)) continue;
  assert.match(parsed.name,/^[a-z0-9-]+$/);
  const resource = `plugin_logo_${parsed.name.replaceAll('-','_')}`;
  output(`res/drawable-nodpi/${resource}${parsed.ext}`,readFileSync(path.join(source,file)));
  rows.push(`        ${JSON.stringify(parsed.name)} to R.drawable.${resource}`);
}
for (const file of readdirSync(source).filter(name=>/\.(md|json)$/.test(name))) output(`assets/plugin-logo-attribution/${file}`,readFileSync(path.join(source,file)));
output('assets/licenses/plugin-artwork.txt', 'Plugin artwork\n\nBrand marks belong to their respective owners. Zyra’s code license does not grant rights to those marks.\n\nArtwork is reproduced from official publisher assets and the commit-pinned OpenAI Plugin catalog:\nhttps://github.com/openai/plugins/tree/' + catalog.commit + '\n\nIncluded publishers and Plugins:\n' + catalog.entries.filter(entry => rows.some(row => row.includes(JSON.stringify(entry.name) + ' to'))).map(entry => entry.displayName + (entry.publisher ? ' — ' + entry.publisher : '') + '\n' + entry.sourceUrl).join('\n\n') + '\n');
output('java/dev/zyra/mobile/data/PluginLogos.kt',`// Generated from Desktop's bundled Plugin artwork. See assets/plugin-logo-attribution.\npackage dev.zyra.mobile.data\nimport dev.zyra.mobile.R\nobject PluginLogos {\n    val resources: Map<String, Int> = mapOf(\n${rows.join(',\n')}\n    )\n}\n`);
console.log(`${rows.length} bundled Desktop Plugin logos ${process.argv.includes('--check') ? 'verified' : 'copied'}; unsupported image formats use the Plugin icon.`);
