// Dependency-free message references, shared by chat and terminal presentation.
export const VISUALIZATION_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function validateVisualizationId(id) {
  if (typeof id !== 'string' || !VISUALIZATION_ID_PATTERN.test(id)) throw new Error('Invalid visualization UUID.');
  return id.toLowerCase();
}
export function validateVisualizationVersion(version) {
  if (!Number.isSafeInteger(version) || version < 1) throw new Error('Version must be a positive integer.');
  return version;
}
export function embedVisualizationReference(id, version) {
  return `<visualization-ref id="${validateVisualizationId(id)}" version="${validateVisualizationVersion(version)}" />`;
}
/** Explicit line-only pinned references; fenced and indented examples remain text. */
export function parseVisualizationReferences(value) {
  const content = String(value ?? ''), parts = [];
  let offset = 0, textStart = 0, fence = '', fenceLength = 0;
  while (offset < content.length) {
    const newline = content.indexOf('\n', offset), end = newline < 0 ? content.length : newline + 1;
    const line = content.slice(offset, newline < 0 ? end : newline).replace(/\r$/, '');
    const marker = line.match(/^ {0,3}(`{3,}|~{3,})/);
    if (marker) {
      if (!fence) { fence = marker[1][0]; fenceLength = marker[1].length; }
      else if (marker[1][0] === fence && marker[1].length >= fenceLength && !line.slice(marker[0].length).trim()) fence = '';
    }
    if (!fence && !marker) {
      const trimmed = line.replace(/^ {0,3}/, '');
      const full = trimmed.match(/^<visualization-ref\s+id="([^"]+)"\s+version="([1-9][0-9]*)"\s*\/>\s*$/);
      const valid = full && VISUALIZATION_ID_PATTERN.test(full[1]) && Number.isSafeInteger(Number(full[2]));
      const partial = newline < 0 && !trimmed.includes('>') && (trimmed.startsWith('<visualization-ref') || (trimmed.startsWith('<') && '<visualization-ref'.startsWith(trimmed)));
      if (valid || partial) {
        if (offset > textStart) parts.push({ kind: 'text', text: content.slice(textStart, offset), start: textStart });
        parts.push({ kind: 'reference', id: valid ? full[1].toLowerCase() : trimmed.match(/\bid="([^"]+)"/)?.[1] ?? '', version: valid ? Number(full[2]) : undefined, start: offset, state: valid ? 'complete' : 'incomplete' });
        textStart = end;
      }
    }
    offset = end;
  }
  if (textStart < content.length) parts.push({ kind: 'text', text: content.slice(textStart), start: textStart });
  return parts;
}
