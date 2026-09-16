import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { stat } from 'node:fs/promises';
import { assert } from './errors.mjs';

const within = (root, target) => { const relative = path.relative(root, target); return relative === '' || (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative)); };

export async function resolveWorkspaceDestination(files, chat, value, context = {}) {
  assert(typeof value === 'string' && value.length > 0 && value.length <= 4096 && !value.includes('\0'), 'Choose a file in this project.');
  let destination = value;
  if (/^file:/i.test(destination)) {
    const url = new URL(destination);
    assert(!url.hostname || url.hostname === 'localhost', 'Choose a file on this computer.');
    destination = fileURLToPath(url);
  } else {
    assert(!/^[a-z][a-z\d+.-]*:/i.test(destination) || /^[a-z]:[\\/]/i.test(destination), 'Only project files can open through this computer.');
    try { destination = decodeURIComponent(destination); } catch { /* A filename can contain a literal malformed escape. */ }
  }
  assert(!destination.includes('\0') && !/^[\\/]{2}/.test(destination), 'Choose a file on this computer.');
  const roots = await files.roots(chat);
  assert(context.rootId === undefined || typeof context.rootId === 'string' && context.rootId.length > 0 && context.rootId.length <= 128, 'Choose an available shared folder.');
  const baseRoot = context.rootId === undefined ? roots[0] : roots.find(root => root.id === context.rootId);
  assert(baseRoot, 'This folder is outside the folders shared with this phone.');
  const basePath = context.basePath === undefined ? '' : context.basePath;
  assert(typeof basePath === 'string' && basePath.length <= 4096 && !basePath.includes('\0') && !path.isAbsolute(basePath) && !/^[a-z]:|^[\\/]{2}/i.test(basePath), 'Use a folder inside this project.');
  const base = path.resolve(baseRoot.path, basePath);
  assert(within(baseRoot.path, base), 'This folder is outside the folders shared with this phone.');
  if (basePath) {
    const checked = await files.target(chat, { rootId: baseRoot.id, path: path.relative(baseRoot.path, base).replaceAll('\\', '/') });
    assert((await stat(checked.target)).isDirectory(), 'Choose a folder for this file.');
  }
  const root = path.isAbsolute(destination) ? roots.find(root => within(root.path, destination)) : baseRoot;
  assert(root, 'This file is outside the folders shared with this phone.');
  const relative = path.relative(root.path, path.resolve(path.isAbsolute(destination) ? root.path : base, destination)).replaceAll('\\', '/');
  const { target } = await files.target(chat, { rootId: root.id, path: relative });
  return { target, source: { kind: 'workspace', rootId: root.id, path: path.relative(root.path, target).replaceAll('\\', '/') } };
}

export async function resolveWorkspaceLink(files, chat, value, context = {}) {
  assert(typeof value === 'string' && value.length <= 4096, 'Choose a file in this project.');
  let destination = value, line = 0;
  const hash = destination.indexOf('#');
  if (hash >= 0) {
    const anchor = destination.slice(hash + 1).match(/^L?(\d+)(?:C\d+)?(?:-L?\d+)?$/i);
    if (anchor) line = Number(anchor[1]);
    destination = destination.slice(0, hash);
  }
  const suffix = destination.match(/^(.*?):(\d+)(?::\d+)?$/);
  if (suffix) { destination = suffix[1]; if (!line) line = Number(suffix[2]); }
  const { target, source } = await resolveWorkspaceDestination(files, chat, destination, context);
  const metadata = await stat(target);
  assert(metadata.isFile() || metadata.isDirectory(), 'This link cannot be opened.');
  return { rootId: source.rootId, path: source.path, directory: metadata.isDirectory(), line: Number.isSafeInteger(line) ? Math.min(1000000, Math.max(0, line)) : 0 };
}
