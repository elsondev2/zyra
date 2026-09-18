export const MAX_VISUALIZATION_HTML = 64 * 1024;

function attribute(tag, name, fallback, limit) {
  const match = tag.match(new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, 'i'));
  return (match ? match[1] ?? match[2] : fallback).replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').slice(0, limit);
}

/** Explicit, line-delimited blocks only. Fenced/indented examples remain Markdown. */
export function parseVisualizationBlocks(value) {
  const content = String(value ?? '');
  if (!content.includes('<')) return content ? [{ kind: 'text', text: content, start: 0 }] : [];
  const parts = [];
  let textStart = 0;
  let offset = 0;
  let fence = '';
  let fenceLength = 0;
  while (offset < content.length) {
    const newline = content.indexOf('\n', offset);
    const end = newline < 0 ? content.length : newline + 1;
    const line = content.slice(offset, newline < 0 ? end : newline).replace(/\r$/, '');
    const marker = line.match(/^ {0,3}(`{3,}|~{3,})/);
    if (marker) {
      if (!fence) { fence = marker[1][0]; fenceLength = marker[1].length; }
      else if (marker[1][0] === fence && marker[1].length >= fenceLength && !line.slice(marker[0].length).trim()) fence = '';
    }
    if (!fence && !marker) {
      const trimmed = line.replace(/^ {0,3}/, '');
      const opening = trimmed.match(/^<visualization(?:\s+(?:[^"'>]|"[^"]*"|'[^']*')*)?>\s*$/);
      const partial = !opening && (/^<visualization(?:\s|>|$)/.test(trimmed)
        || (newline < 0 && trimmed.startsWith('<') && '<visualization'.startsWith(trimmed)));
      if (opening || partial) {
        if (offset > textStart) parts.push({ kind: 'text', text: content.slice(textStart, offset), start: textStart });
        const title = attribute(trimmed, 'title', 'Visualization', 160).trim() || 'Visualization';
        const summary = attribute(trimmed, 'summary', '', 1200).trim();
        const height = Math.min(640, Math.max(160, Number(attribute(trimmed, 'height', '320', 5)) || 320));
        const closing = opening ? /^ {0,3}<\/visualization>[\t ]*\r?$/gm : null;
        if (closing) closing.lastIndex = end;
        const match = closing?.exec(content);
        const htmlEnd = match ? match.index : content.length;
        const tooLarge = htmlEnd - end > MAX_VISUALIZATION_HTML;
        parts.push({ kind: 'visualization', start: offset, title, summary, height,
          state: tooLarge ? 'too-large' : match ? 'complete' : 'incomplete',
          html: match && !tooLarge ? content.slice(end, htmlEnd) : '' });
        offset = match ? match.index + match[0].length : content.length;
        textStart = offset;
        continue;
      }
    }
    offset = end;
  }
  if (textStart < content.length) parts.push({ kind: 'text', text: content.slice(textStart), start: textStart });
  return parts;
}

export function visualizationTerminalText(content, streaming = false) {
  return parseVisualizationBlocks(content).map(part => {
    if (part.kind === 'text') return part.text;
    const title = part.title.replace(/[\x00-\x1f\x7f-\x9f]/g, ' ');
    const summary = part.summary.replace(/[\x00-\x1f\x7f-\x9f]/g, ' ');
    const status = part.state === 'complete' ? 'Visualization' : part.state === 'too-large' ? 'Visualization too large' : streaming ? 'Creating visualization…' : 'Visualization incomplete';
    return `\n${status}: ${title}\n${summary ? `${summary}\n` : ''}${part.state === 'complete' ? 'View the rendered block in Zyra chat.\n' : ''}`;
  }).join('');
}
