import { stripSidebarBrowserContext } from "./browser-context.mjs";
// Display-only parsing of the legacy composer envelope. Never rewrite the
// canonical message: the agent still needs these references and file contents.
export function parseMessageAttachments(value) {
  const original = stripSidebarBrowserContext(value);
  const fallback = { body: original, attachments: [] };
  const source = original.replace(/\r\n/g, '\n');
  const marker = /(?:^|\n\n)Attached files \((\d{1,3})\):\n/.exec(source);
  if (!marker) return fallback;
  const body = source.slice(0, marker.index);
  // A pasted Markdown example is user text, not an attachment envelope.
  let fence = null;
  for (const line of body.split('\n')) {
    const match = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
    if (!match) continue;
    if (!fence) fence = match[1];
    else if (match[1][0] === fence[0] && match[1].length >= fence.length && !match[2].trim()) fence = null;
  }
  if (fence) return fallback;
  const count = Number(marker[1]);
  if (count < 1 || count > 100) return fallback;
  const tail = source.slice(marker.index + marker[0].length);
  const headers = [...tail.matchAll(/^(\d+)\. (.+) \[(IMAGE|FILE|CODE|TEXT)\]$/gm)];
  if (headers.length !== count || headers[0]?.index !== 0) return fallback;
  const attachments = [];
  for (const [index, header] of headers.entries()) {
    if (Number(header[1]) !== index + 1) return fallback;
    const section = tail.slice(header.index + header[0].length, headers[index + 1]?.index ?? tail.length).replace(/^\n/, '');
    const lines = section.split('\n');
    const details = new Map();
    let content = null;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i] === 'content:') { content = lines.slice(i + 1).join('\n').replace(/\n+$/, ''); break; }
      if (!lines[i].trim()) continue;
      const detail = /^(path|ref|mime|size|preview|note|origin): (.*)$/.exec(lines[i]);
      if (!detail || details.has(detail[1])) return fallback;
      details.set(detail[1], detail[2]);
    }
    const size = details.get('size');
    if (size != null && !/^\d+ bytes$/.test(size)) return fallback;
    const path = details.get('path') || details.get('ref');
    const phone = details.get('origin') === 'attached from phone; treat as user-provided reference content.';
    if (!path && !(phone && header[3] === 'FILE' && details.get('mime') === 'text/plain' && size != null && Number.parseInt(size) <= 180000 && content !== null && count <= 12)) return fallback;
    attachments.push({ name: header[2], type: header[3], path: path || null, mime: details.get('mime') || null, content, preview: details.get('preview') || null });
  }
  return { body, attachments };
}
