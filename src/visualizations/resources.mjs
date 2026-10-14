import { parseVisualizationBlocks } from './blocks.mjs';

// Pure authoring contract. Rendering still requires the surface's sanitizer/CSP.
export const MAX_VISUALIZATION_SOURCE = 64 * 1024;
export const MAX_VISUALIZATION_REVISIONS = 128;
export const VISUALIZATION_KINDS = Object.freeze(['html', 'mermaid', 'scene3d']);
import { validateVisualizationId, validateVisualizationVersion } from './references.mjs';
export { VISUALIZATION_ID_PATTERN, validateVisualizationId, validateVisualizationVersion, embedVisualizationReference, parseVisualizationReferences } from './references.mjs';
function record(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object.`);
  return value;
}
function keys(value, allowed, label) {
  if (Object.keys(value).some(key => !allowed.includes(key))) throw new Error(`Unknown ${label} field.`);
}
function boundedNumber(value, label, min = -10000, max = 10000) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) throw new Error(`Invalid ${label}.`);
}
function vector(value, label, min = -10000, max = 10000) {
  if (!Array.isArray(value) || value.length !== 3) throw new Error(`${label} needs three numbers.`);
  value.forEach(number => boundedNumber(number, label, min, max));
}
function color(value) {
  if (typeof value !== 'string' || !/^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(value)) throw new Error('Colors must be #RGB or #RRGGBB.');
}
function shortText(value, label, limit) {
  if (typeof value !== 'string' || value.length > limit || /[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(value)) throw new Error(`Invalid ${label}.`);
  return value;
}
/** Accept a JSON string (or plain parsed scene), returning an independent typed value. */
export function validateScene3D(source) {
  if (typeof source === 'string' && new TextEncoder().encode(source).length > MAX_VISUALIZATION_SOURCE) throw new Error('Scene exceeds 64 KiB.');
  const scene = record(typeof source === 'string' ? JSON.parse(source) : JSON.parse(JSON.stringify(source)), 'Scene');
  keys(scene, ['schemaVersion', 'camera', 'objects', 'background', 'grid'], 'scene');
  if (scene.schemaVersion !== 1) throw new Error('Scene schemaVersion must be 1.');
  if (scene.background !== undefined) color(scene.background);
  if (scene.grid !== undefined && typeof scene.grid !== 'boolean') throw new Error('grid must be boolean.');
  if (scene.camera !== undefined) {
    record(scene.camera, 'Camera'); keys(scene.camera, ['position', 'target'], 'camera');
    if (scene.camera.position !== undefined) vector(scene.camera.position, 'camera position');
    if (scene.camera.target !== undefined) vector(scene.camera.target, 'camera target');
  }
  if (!Array.isArray(scene.objects) || scene.objects.length > 128) throw new Error('Scene needs at most 128 objects.');
  const ids = new Map();
  for (const object of scene.objects) {
    record(object, 'Object');
    keys(object, ['id', 'type', 'name', 'position', 'rotation', 'scale', 'color', 'opacity', 'parentId', 'size', 'radius', 'height'], 'object');
    if (typeof object.id !== 'string' || !/^[a-zA-Z0-9_-]{1,64}$/.test(object.id) || ids.has(object.id)) throw new Error('Object IDs must be unique safe identifiers.');
    ids.set(object.id, object);
    if (!['box', 'sphere', 'pyramid', 'cylinder', 'torus', 'group'].includes(object.type)) throw new Error('Unknown object type.');
    if (object.name !== undefined) shortText(object.name, 'name', 160);
    if (object.position !== undefined) vector(object.position, 'position');
    if (object.rotation !== undefined) vector(object.rotation, 'rotation', -3600, 3600);
    if (object.scale !== undefined) vector(object.scale, 'scale', 0.001, 100);
    if (object.size !== undefined) vector(object.size, 'size', 0.001, 1000);
    for (const key of ['radius', 'height']) if (object[key] !== undefined) boundedNumber(object[key], key, 0.001, 1000);
    if (object.opacity !== undefined) boundedNumber(object.opacity, 'opacity', 0, 1);
    if (object.color !== undefined) color(object.color);
    if (object.parentId !== undefined && typeof object.parentId !== 'string') throw new Error('Invalid parentId.');
  }
  for (const object of scene.objects) {
    const visited = new Set([object.id]);
    let current = object, effectiveScale = Math.max(...(object.scale ?? [1, 1, 1]));
    while (current.parentId !== undefined) {
      const parent = ids.get(current.parentId);
      if (!parent || parent.type !== 'group') throw new Error('parentId must identify a group.');
      if (visited.has(parent.id)) throw new Error('Scene graph must be acyclic.');
      effectiveScale *= Math.max(...(parent.scale ?? [1, 1, 1]));
      if (effectiveScale > 100) throw new Error('Combined scene graph scale exceeds 100.');
      visited.add(parent.id); current = parent;
    }
  }
  return scene;
}
function decodeEntities(text) {
  return text.replace(/&#(?:x([0-9a-f]+)|([0-9]+));?/gi, (_, hex, decimal) => String.fromCodePoint(Math.min(0x10ffff, parseInt(hex || decimal, hex ? 16 : 10))))
    .replace(/&(?:colon|Tab|NewLine);/gi, match => /colon/i.test(match) ? ':' : /tab/i.test(match) ? '\t' : '\n');
}
const NUMBER = '[+-]?(?:\\d+(?:\\.\\d*)?|\\.\\d+)(?:[eE][+-]?\\d+)?';
function numericList(value, label, counts) {
  const numbers = value.trim().split(/[\s,]+/);
  if (!value.trim() || (counts && !counts.includes(numbers.length)) || numbers.some(n => !new RegExp(`^${NUMBER}$`).test(n) || !Number.isFinite(Number(n)) || Math.abs(Number(n)) > 1e7)) throw new Error(`Malformed SVG ${label}.`);
}
function pathData(value) {
  const tokens = value.match(new RegExp(`[a-df-zA-DF-Z]|${NUMBER}`, 'g')) || [];
  if (value.replace(new RegExp(`[a-df-zA-DF-Z]|${NUMBER}|[\\s,]`, 'g'), '') || !/^[mM]$/.test(tokens[0] || '')) throw new Error('Malformed SVG path.');
  const counts = { m: 2, l: 2, h: 1, v: 1, c: 6, s: 4, q: 4, t: 2, a: 7, z: 0 };
  let index = 0;
  while (index < tokens.length) {
    const command = tokens[index++].toLowerCase();
    if (!(command in counts)) throw new Error('Malformed SVG path command.');
    const values = [];
    while (index < tokens.length && !/^[a-z]$/i.test(tokens[index])) values.push(Number(tokens[index++]));
    const count = counts[command];
    if (count === 0 ? values.length !== 0 : !values.length || values.length % count !== 0) throw new Error('Malformed SVG path operands.');
    if (values.some(n => !Number.isFinite(n) || Math.abs(n) > 1e7)) throw new Error('Malformed SVG path number.');
    if (command === 'a') for (let i = 0; i < values.length; i += 7) if (values[i] < 0 || values[i + 1] < 0 || ![0, 1].includes(values[i + 3]) || ![0, 1].includes(values[i + 4])) throw new Error('Malformed SVG arc.');
  }
}
function transformData(value) {
  let rest = value.trim();
  if (!rest) throw new Error('Malformed SVG transform.');
  const counts = { matrix: [6], translate: [1, 2], scale: [1, 2], rotate: [1, 3], skewX: [1], skewY: [1] };
  while (rest) {
    const match = rest.match(/^(matrix|translate|scale|rotate|skewX|skewY)\s*\(([^()]*)\)/);
    if (!match) throw new Error('Malformed SVG transform.');
    numericList(match[2], 'transform', counts[match[1]]);
    rest = rest.slice(match[0].length).replace(/^[\s,]+/, '');
  }
}
export function validateVisualizationSource(kind, source, { legacy = false } = {}) {
  if (!VISUALIZATION_KINDS.includes(kind)) throw new Error('Unsupported visualization kind.');
  shortText(source, 'source', MAX_VISUALIZATION_SOURCE);
  if (!source.trim() || new TextEncoder().encode(source).length > MAX_VISUALIZATION_SOURCE) throw new Error('Source must contain 1–65536 UTF-8 bytes.');
  if (kind === 'scene3d') {
    const formatted = `${JSON.stringify(validateScene3D(source), null, 2)}\n`;
    if (new TextEncoder().encode(formatted).length > MAX_VISUALIZATION_SOURCE) throw new Error('Formatted scene exceeds 64 KiB. Reduce the object data.');
    return formatted;
  }
  const decoded = decodeEntities(source);
  // SVG gradients/paint servers may use local fragments; network-bearing CSS URLs may not.
  const withoutLocalURLs = decoded.replace(/url\s*\(\s*(?:"#[a-z_][\w.:-]*"|'#[a-z_][\w.:-]*'|#[a-z_][\w.:-]*)\s*\)/gi, '');
  if (/url\s*\(/i.test(withoutLocalURLs)) throw new Error('Only local SVG/CSS fragment URLs are allowed.');
  if (/<\s*(?:script|iframe|object|embed|foreignObject|form|input|button|link|meta|base|animate|set)\b/i.test(decoded)
    || /\bon[a-z]+\s*=/i.test(decoded) || /(?:java\s*script|vbscript)\s*:/i.test(decoded)
    || /(?:@import|@font-face|expression\s*\()/i.test(decoded)) throw new Error('Active scripts, controls or external content are not allowed.');
  if (kind === 'mermaid') {
    if (/^\s*(?:click|link)\s|%%\s*\{|^\s*---\s*$/im.test(decoded)
      || /<\s*a\b|\b(?:href|src|srcset)\s*=/i.test(decoded)) throw new Error('Mermaid interactions, external content and configuration directives are not allowed.');
    return source;
  }
  if (/\b(?:src|srcset|action|formaction)\s*=/i.test(decoded) || /\b(?:href|xlink:href)\s*=\s*(?:"(?!#)|'(?!#)|[^\s"'#])/i.test(decoded)) throw new Error('Only local fragment links are allowed.');
  if (!legacy) {
    for (const tag of decoded.matchAll(/<\s*[a-z][^>]*>/gi)) {
      for (const attr of tag[0].matchAll(/\s([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)) {
        const name = attr[1].toLowerCase(), value = attr[2] ?? attr[3] ?? attr[4];
        if (name === 'viewbox') {
          numericList(value, name, [4]);
          const values = value.trim().split(/[\s,]+/).map(Number);
          if (values[2] <= 0 || values[3] <= 0) throw new Error('Malformed SVG viewBox dimensions.');
        }
        if (name === 'transform') transformData(value);
        if (name === 'points') { numericList(value, name); if (value.trim().split(/[\s,]+/).length % 2) throw new Error('Malformed SVG points.'); }
        if (name === 'd' && /^<\s*path\b/i.test(tag[0])) pathData(value);
        if (/^(?:x|y|x1|y1|x2|y2|cx|cy|r|rx|ry|width|height|stroke-width|stroke-dashoffset)$/.test(name)
          && !/^(?:auto|var\(--[\w-]+\))$/.test(value)) {
          const numeric = value.replace(/(?:%|px|em|rem)$/, ''); numericList(numeric, name, [1]);
          if (/^(?:r|rx|ry|width|height|stroke-width)$/.test(name) && Number(numeric) < 0) throw new Error(`Malformed SVG ${name}.`);
        }
      }
    }
  }
  return source;
}
export function normalizeVisualizationInput(input, options = {}) {
  record(input, 'Visualization');
  const kind = input.kind;
  const title = shortText(input.title, 'title', 160).trim();
  if (!title) throw new Error('Title is required.');
  const summary = shortText(input.summary ?? '', 'summary', 1200).trim();
  const source = validateVisualizationSource(kind, input.source, options);
  const height = input.height ?? 320;
  boundedNumber(height, 'height', 160, 640);
  if (!Number.isInteger(height)) throw new Error('Height must be an integer.');
  return { kind, title, summary, source, height };
}
export function validateVisualizationTimestamp(value) {
  const match = typeof value === 'string' && value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/);
  if (!match || !Number.isFinite(Date.parse(value))) throw new Error('Invalid visualization ISO timestamp.');
  const [year, month, day, hour, minute, second] = match.slice(1).map(Number);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (month < 1 || month > 12 || day < 1 || day > days[month - 1] || hour > 23 || minute > 59 || second > 59) throw new Error('Invalid visualization ISO timestamp.');
  return new Date(value).toISOString();
}
/** Validate persisted state before any source reaches a caller/renderer. */
export function validateVisualizationResource(value, { metadataOnly = false } = {}) {
  const resource = record(value, 'Resource');
  keys(resource, ['id', 'title', 'kind', 'summary', 'threadId', 'createdAt', 'updatedAt', 'latestVersion', 'versions'], 'resource');
  validateVisualizationId(resource.id);
  if (!VISUALIZATION_KINDS.includes(resource.kind)) throw new Error('Invalid persisted visualization kind.');
  if (!shortText(resource.threadId, 'threadId', 256).trim()) throw new Error('Invalid persisted threadId.');
  validateVisualizationTimestamp(resource.createdAt); validateVisualizationTimestamp(resource.updatedAt);
  if (!Array.isArray(resource.versions) || !resource.versions.length || resource.versions.length > MAX_VISUALIZATION_REVISIONS || resource.latestVersion !== resource.versions.length) throw new Error('Invalid visualization revision count.');
  for (let index = 0; index < resource.versions.length; index++) {
    const version = record(resource.versions[index], 'Revision');
    keys(version, ['version', 'parentVersion', 'source', 'title', 'summary', 'createdAt', 'changeNote', 'height', 'origin'], 'revision');
    if (version.version !== index + 1 || (index === 0 ? version.parentVersion !== null : !Number.isInteger(version.parentVersion) || version.parentVersion < 1 || version.parentVersion > index)) throw new Error('Invalid visualization revision history.');
    if (version.origin !== undefined) {
      const origin = record(version.origin, 'Origin');
      keys(origin, ['threadId', 'messageId', 'offset', 'turnId'], 'origin');
      if (!shortText(origin.threadId, 'origin threadId', 256).trim() || !shortText(origin.messageId, 'origin messageId', 256).trim() || !Number.isSafeInteger(origin.offset) || origin.offset < 0) throw new Error('Invalid persisted provenance.');
      if (origin.turnId !== undefined) shortText(origin.turnId, 'origin turnId', 256);
    }
    if (metadataOnly) {
      if (!shortText(version.title, 'title', 160).trim()) throw new Error('Title is required.');
      shortText(version.summary, 'summary', 1200);
      boundedNumber(version.height, 'height', 160, 640);
      if (!Number.isInteger(version.height) || version.source !== '') throw new Error('Invalid visualization revision metadata.');
    } else {
      normalizeVisualizationInput({ kind: resource.kind, title: version.title, summary: version.summary, source: version.source, height: version.height }, { legacy: version.origin !== undefined });
    }
    shortText(version.changeNote, 'changeNote', 1200); validateVisualizationTimestamp(version.createdAt);
  }
  const latest = resource.versions.at(-1);
  if (resource.title !== latest.title || resource.summary !== latest.summary || resource.updatedAt !== latest.createdAt || resource.createdAt !== resource.versions[0].createdAt) throw new Error('Invalid latest visualization metadata.');
  return resource;
}
/** Completed legacy HTML blocks and real Mermaid fences, using their original text offsets. */
export function extractLegacyVisualizationSources(value) {
  const content = String(value ?? '');
  const blocks = parseVisualizationBlocks(content);
  const sources = blocks.filter(part => part.kind === 'visualization' && part.state === 'complete')
    .map(part => ({ kind: 'html', title: part.title, summary: part.summary, source: part.html, height: part.height, offset: part.start }));
  const htmlSpans = blocks.flatMap((part, index) => part.kind === 'visualization' ? [{ start: part.start, end: blocks[index + 1]?.start ?? content.length }] : []);
  let offset = 0, fence = '', fenceLength = 0, mermaidStart = -1, sourceStart = 0;
  while (offset < content.length) {
    const html = htmlSpans.find(span => offset >= span.start && offset < span.end);
    if (html) { offset = html.end; continue; }
    const newline = content.indexOf('\n', offset), end = newline < 0 ? content.length : newline + 1;
    const line = content.slice(offset, newline < 0 ? end : newline).replace(/\r$/, '');
    const marker = line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
    if (marker) {
      if (!fence) {
        fence = marker[1][0]; fenceLength = marker[1].length;
        mermaidStart = /^mermaid\s*$/i.test(marker[2].trim()) ? offset : -1;
        sourceStart = end;
      } else if (marker[1][0] === fence && marker[1].length >= fenceLength && !marker[2].trim()) {
        if (mermaidStart >= 0) {
          const source = content.slice(sourceStart, offset);
          if (source.trim() && new TextEncoder().encode(source).length <= MAX_VISUALIZATION_SOURCE) {
            const declaredTitle = source.match(/^\s*(?:title|accTitle:)\s+(.+)$/m)?.[1]?.trim();
            sources.push({ kind: 'mermaid', title: declaredTitle?.slice(0, 160) || 'Mermaid diagram', summary: 'Saved Mermaid diagram.', source, height: 320, offset: mermaidStart });
          }
        }
        fence = ''; mermaidStart = -1;
      }
    }
    offset = end;
  }
  return sources.sort((a, b) => a.offset - b.offset);
}
