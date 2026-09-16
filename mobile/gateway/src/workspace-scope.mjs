import path from 'node:path';
import { lstat, realpath } from 'node:fs/promises';

export const within = (root, target) => { const relative = path.relative(root, target); return relative === '' || (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative)); };

/** Per-device exclusions apply to both names and resolved destinations. */
export async function workspaceScope(hiddenProjects = []) {
  const excluded = [];
  for (const folder of hiddenProjects) {
    excluded.push(path.resolve(folder));
    const resolved = await realpath(folder).catch(() => null);
    if (resolved) excluded.push(resolved);
  }
  const hidden = target => excluded.some(folder => within(folder, target));
  const restricted = root => excluded.some(folder => within(root, folder) || within(folder, root));
  const gitMetadata = target => {
    const parts = path.resolve(target).split(path.sep);
    return parts.some((segment, index) => segment.toLowerCase() === '.git' && restricted(parts.slice(0, index).join(path.sep) || path.parse(target).root));
  };
  async function allows(target, allowMissing = false) {
    if (!excluded.length) return true;
    if (hidden(target) || gitMetadata(target)) return false;
    let ancestor = target;
    while (true) {
      try {
        const metadata = await lstat(ancestor);
        const resolved = await realpath(ancestor);
        return !hidden(resolved) && !gitMetadata(resolved) && (ancestor === target || metadata.isDirectory());
      } catch (error) {
        if (!allowMissing || !['ENOENT', 'ENOTDIR'].includes(error.code)) return false;
        // Broken links are not ordinary historical/deleted paths.
        if ((await lstat(ancestor).catch(() => null))?.isSymbolicLink()) return false;
        const parent = path.dirname(ancestor);
        if (parent === ancestor) return false;
        ancestor = parent;
      }
    }
  }
  return { allows, restricted };
}
