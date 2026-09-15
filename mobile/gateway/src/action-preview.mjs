// Keep action identity useful when the captured body is loaded on demand.
// Only presentation arguments cross this small preview; file bodies and prompts do not.
const strings = ['command', 'cmd', 'script', 'path', 'filePath', 'file_path', 'targetPath', 'filename',
  'query', 'q', 'pattern', 'search', 'url', 'href', 'action', 'operation', 'name', 'label', 'agent', 'application', 'targetId'];
const record = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
const short = (value, limit = 256) => typeof value === 'string' ? value.slice(0, limit) : undefined;
export function actionArgsPreview(value) {
  const args = record(value), result = {};
  for (const key of strings) if (typeof args[key] === 'string') result[key] = short(args[key], key === 'command' || key === 'cmd' || key === 'script' ? 1000 : 256);
  if (Array.isArray(args.paths)) result.paths = args.paths.filter(path => typeof path === 'string').slice(0, 8).map(path => short(path));
  for (const key of ['offset', 'limit']) if (Number.isSafeInteger(args[key]) && args[key] > 0) result[key] = args[key];
  return result;
}
export function actionSurfacePreview(value) {
  const surface = record(value);
  if (surface.version !== 1) return undefined;
  return { version: 1, kind: short(surface.kind, 32), lifecycle: short(surface.lifecycle, 24), phase: short(surface.phase, 16),
    toolName: short(surface.toolName, 96), toolKey: short(surface.toolKey, 96), primaryText: short(surface.primaryText),
    command: short(surface.command, 1000), query: short(surface.query), url: short(surface.url), action: short(surface.action, 96),
    paths: Array.isArray(surface.paths) ? surface.paths.filter(path => typeof path === 'string').slice(0, 8).map(path => short(path)) : [], summary: short(surface.summary) };
}
