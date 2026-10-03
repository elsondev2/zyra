import * as module from 'node:module';
import { readFileSync } from 'node:fs';

// Collapse the installed schema dependency graph for owned Node workers. Only
// redirect the exact root dependency; extensions with another version retain it.
if (typeof module.registerHooks === 'function') {
  const manifest = JSON.parse(readFileSync(new URL('./bundled/manifest.json', import.meta.url), 'utf8'));
  const installed = JSON.parse(readFileSync(new URL('../package.json', import.meta.resolve('typebox')), 'utf8'));
  const originals = new Map(installed.version === manifest.version
    ? Object.keys(manifest.entries).map(specifier => [specifier, import.meta.resolve(specifier)]) : []);
  module.registerHooks({ resolve(specifier, context, nextResolve) {
    const resolved = nextResolve(specifier, context);
    if (originals.get(specifier) !== resolved.url) return resolved;
    return { ...resolved, url: new URL('./bundled/' + manifest.entries[specifier], import.meta.url).href };
  } });
}
