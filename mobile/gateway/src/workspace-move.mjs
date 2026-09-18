import { lstat, link, unlink } from 'node:fs/promises';
import path from 'node:path';
import { assert, fault } from './errors.mjs';
import { within, workspaceScope } from './workspace-scope.mjs';

const etag = info => info.size + ':' + info.mtimeMs;
const sameFile = (a, b) => a.dev === b.dev && a.ino === b.ino;
function relativeName(value) {
  assert(typeof value === 'string' && value.length > 0 && value.length <= 4096 && !value.includes('\0') &&
    !path.win32.isAbsolute(value) && !path.posix.isAbsolute(value), 'Use a file path inside this shared folder.');
  const parts = value.split(/[\\/]/);
  assert(parts.every(part => part && part !== '.' && part !== '..' && !/[<>:"|?*\x00-\x1f]/.test(part) &&
    !/[. ]$/.test(part) && !/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part)), 'Use a valid file path inside this shared folder.');
  return parts.join(path.sep);
}
async function directPath(root, target, missingLeaf = false) {
  assert(within(root, target) && target !== root, 'Use a file path inside this shared folder.');
  const parts = path.relative(root, target).split(path.sep);
  let current = root;
  for (let index = 0; index < parts.length; index++) {
    current = path.join(current, parts[index]);
    const leaf = index === parts.length - 1;
    const info = await lstat(current).catch(error => {
      if (missingLeaf && leaf && error.code === 'ENOENT') return null;
      throw error;
    });
    if (!info) return null;
    assert(!info.isSymbolicLink(), 'Move files using their original folder, not a linked folder.');
    assert(leaf || info.isDirectory(), 'Choose an existing destination folder.');
    if (leaf) return info;
  }
}
async function locations(files, params, chat) {
  const sourceName = relativeName(params.path), destinationName = relativeName(params.destination);
  const { root, target } = await files.target(chat, { ...params, path: sourceName }, true);
  const source = path.join(root.path, sourceName), destination = path.join(root.path, destinationName);
  const info = await directPath(root.path, source);
  assert(info.isFile() && path.relative(source, target) === '', 'Choose an ordinary file to move.');
  const existing = await directPath(root.path, destination, true);
  if (existing) throw fault('FILE_EXISTS', 'A file or folder already has that name. Choose another destination.');
  const policy = await workspaceScope(files.hiddenProjects);
  assert(await policy.allows(source) && await policy.allows(destination, true), 'This path is not shared with this device.');
  // Match the canonical key used by text saves, including case aliases on
  // Windows, so move and save operations share the same source lock.
  return { root, source: target, destination, info };
}

/** A hard-link publish refuses an occupied name atomically on every supported
 * platform. Plain rename is unsuitable because it overwrites on POSIX. Keep
 * the original until the destination and current device scope are verified. */
export async function moveWorkspaceFile(files, params, chat) {
  assert(typeof params.etag === 'string' && params.etag.length <= 128, 'Refresh this file before moving it.');
  const initial = await locations(files, params, chat);
  const keys = [initial.source, initial.destination].sort();
  const previous = Promise.all(keys.map(key => (files.writes.get(key) || Promise.resolve()).catch(() => {})));
  const pending = previous.then(async () => {
    const current = await locations(files, params, chat);
    assert(current.source === initial.source && current.destination === initial.destination, 'The shared folder changed. Refresh it before moving this file.');
    if (etag(current.info) !== params.etag) throw fault('FILE_CONFLICT', 'The file changed on the PC. Reload it before moving it.');
    let published = false;
    try {
      try { await link(current.source, current.destination); published = true; }
      catch (error) {
        if (error.code === 'EEXIST') throw fault('FILE_EXISTS', 'A file or folder already has that name. Choose another destination.');
        if (['EXDEV', 'ENOTSUP', 'EOPNOTSUPP'].includes(error.code)) throw fault('MOVE_UNAVAILABLE', 'This filesystem cannot safely move this file. Choose a folder on the same drive.');
        throw error;
      }
      const resolved = await files.target(chat, { ...params, path: relativeName(params.path) }, true);
      assert(resolved.target === current.source && resolved.root.id === current.root.id, 'The shared folder changed. Refresh it before moving this file.');
      const policy = await workspaceScope(files.hiddenProjects);
      assert(await policy.allows(current.source) && await policy.allows(current.destination), 'This path is not shared with this device.');
      const source = await directPath(current.root.path, current.source);
      const destination = await directPath(current.root.path, current.destination);
      if (!sameFile(source, current.info) || !sameFile(destination, current.info) || etag(source) !== params.etag) {
        throw fault('FILE_CONFLICT', 'The file changed while moving. Refresh it and try again.');
      }
      await unlink(current.source);
      published = false;
      return { moved: true, rootId: current.root.id, path: path.relative(current.root.path, current.destination).replaceAll('\\', '/'),
        name: path.basename(current.destination), size: destination.size, etag: etag(destination) };
    } finally {
      // A failed move retains its original. Never remove an independently
      // replaced destination while rolling back our exclusive publication.
      if (published) {
        const destination = await directPath(current.root.path, current.destination).catch(() => null);
        if (destination && sameFile(destination, current.info)) await unlink(current.destination);
      }
    }
  });
  for (const key of keys) files.writes.set(key, pending);
  try { return await pending; }
  finally { for (const key of keys) if (files.writes.get(key) === pending) files.writes.delete(key); }
}
