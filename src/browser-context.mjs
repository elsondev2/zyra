// Display-only envelope removal. Never rewrite the agent's canonical prompt.
export function stripSidebarBrowserContext(value) {
  const text = String(value ?? '');
  return text.replace(/(?:^|\r?\n\r?\n)<browser-context>([\s\S]*?)<\/browser-context>(?=\s*(?:$|Attached files \())/g, (block, json, offset) => {
    // Preserve fenced examples and malformed/unrelated user content.
    let fence = null;
    for (const line of text.slice(0, offset).split(/\r?\n/)) {
      const m = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
      if (m && !fence) fence = m[1];
      else if (m && m[1][0] === fence?.[0] && m[1].length >= fence.length && !m[2].trim()) fence = null;
    }
    if (fence) return block;
    try {
      const c = JSON.parse(json);
      const valid = id => typeof id === 'string' && /^control-target:chrome-tab:[a-zA-Z0-9-]+$/.test(id);
      return c.source === 'Zyra Chrome sidebar' && (valid(c.targetId) || (Array.isArray(c.targets) && c.targets.length && c.targets.every(t => valid(t?.targetId)))) ? '' : block;
    } catch { return block; }
  });
}
