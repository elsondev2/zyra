import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const assets = path.join(root, 'mobile/android/app/src/main/assets');
const source = await readFile(path.join(root, 'desktop/src/renderer/src/components/ui/ProjectIcon.tsx'), 'utf8');
const brands = Object.fromEntries([...source.matchAll(/'([^']+)': \{ displayName: '[^']+', icon: '([^']+)', themeColor: '(#[A-Fa-f0-9]+)' \}/g)].map(([, id, slug, color]) => [id, { slug, color }]));
if (Object.keys(brands).length < 30) throw new Error('Desktop project icon definitions changed; inspect the source.');
const metadata = JSON.stringify(brands, null, 2) + '\n';
const targets = [path.join(assets, 'project-brands.json'), path.join(root, 'desktop/src/shared/project-brand-icons.json')];
const iconDir = path.join(assets, 'project-icons');
const manifestPath = path.join(assets, 'project-icons-sources.json');
if (process.argv.includes('--download')) {
  await mkdir(iconDir, { recursive: true });
  const entries = [];
  for (const slug of [...new Set(Object.values(brands).map(item => item.slug))].sort()) {
    // The older pinned set retains brand slugs still used by Desktop.
    const url = `https://raw.githubusercontent.com/simple-icons/simple-icons/11.15.0/icons/${slug}.svg`;
    const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error(`${slug}: ${response.status}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length > 32768 || !bytes.toString().includes('<svg')) throw new Error(`Invalid ${slug} artwork`);
    await writeFile(path.join(iconDir, `${slug}.svg`), bytes);
    entries.push({ slug, url, sha256: createHash('sha256').update(bytes).digest('hex') });
  }
  const license = await fetch('https://raw.githubusercontent.com/simple-icons/simple-icons/11.15.0/LICENSE.md', { signal: AbortSignal.timeout(15000) });
  if (!license.ok) throw new Error('Missing Simple Icons license');
  await writeFile(path.join(assets, 'licenses/simple-icons.txt'), await license.text());
  await writeFile(manifestPath, JSON.stringify({ version: '11.15.0', entries }, null, 2) + '\n');
  for (const target of targets) await writeFile(target, metadata);
} else {
  for (const target of targets) if (await readFile(target, 'utf8') !== metadata) throw new Error(`Stale project brand map: ${target}`);
  const { entries } = JSON.parse(await readFile(manifestPath, 'utf8'));
  for (const entry of entries) if (createHash('sha256').update(await readFile(path.join(iconDir, `${entry.slug}.svg`))).digest('hex') !== entry.sha256) throw new Error(`Changed ${entry.slug} icon`);
  if (entries.length !== new Set(Object.values(brands).map(item => item.slug)).size) throw new Error('Incomplete project icons');
  console.log(`${entries.length} bundled project icons match Desktop; no runtime internet required.`);
}
