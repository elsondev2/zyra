export type CursorFavicon = { update: (color: string) => void; dispose: () => void };

/** Self-contained: serialized with the cursor into the exact tab's isolated world. */
export function createCursorFavicon(initialColor: string): CursorFavicon {
  const head = document.head;
  if (!head) return { update() {}, dispose() {} };
  const attributes = ['href', 'type', 'sizes'] as const;
  type Saved = Record<typeof attributes[number], string | null>;
  const originals = new Map<HTMLLinkElement, Saved>();
  const badge = document.createElement('link');
  badge.rel = 'icon';
  badge.dataset.zyraControlFavicon = '';
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 32;
  const context = canvas.getContext('2d');
  if (!context) return { update() {}, dispose() {} };
  let color = initialColor, overlay = '', source = '', disposed = false, generation = 0;
  let image: HTMLImageElement | undefined;
  const watch = () => observer.observe(head, { subtree: true, childList: true, attributes: true, attributeFilter: ['rel', ...attributes] });
  const isIcon = (link: HTMLLinkElement) => link.rel.toLowerCase().split(/\s+/).includes('icon');
  const restore = (link: HTMLLinkElement, saved: Saved) => {
    // Do not overwrite a newer site update that arrived just before cleanup.
    for (const key of attributes) {
      const applied = key === 'href' ? overlay : key === 'type' ? 'image/png' : '32x32';
      if (link.getAttribute(key) !== applied) continue;
      if (saved[key] === null) link.removeAttribute(key); else link.setAttribute(key, saved[key]!);
    }
  };
  const paint = () => {
    if (disposed) return;
    // Resizing also clears a canvas tainted by an uncooperative favicon server.
    canvas.width = 32;
    context.clearRect(0, 0, 32, 32);
    if (image) { try { context.drawImage(image, 0, 0, 28, 28); } catch {} }
    const pointer = () => {
      context.beginPath();
      context.moveTo(14, 12); context.lineTo(30, 19); context.lineTo(23, 21);
      context.lineTo(21, 29); context.closePath();
      context.fillStyle = color; context.fill();
      context.strokeStyle = '#ffffff'; context.lineWidth = 2.5; context.lineJoin = 'round'; context.stroke();
      context.strokeStyle = '#071326'; context.lineWidth = 1; context.stroke();
    };
    pointer();
    try { overlay = canvas.toDataURL('image/png'); }
    catch { canvas.width = 32; pointer(); overlay = canvas.toDataURL('image/png'); }
    observer.disconnect();
    for (const link of [...originals.keys(), badge]) {
      link.setAttribute('href', overlay); link.setAttribute('type', 'image/png'); link.setAttribute('sizes', '32x32');
    }
    if (badge.parentNode !== head) head.append(badge);
    watch();
  };
  const sync = () => {
    if (disposed) return;
    let nextSource = source;
    observer.disconnect();
    for (const [link, saved] of originals) {
      if (!link.isConnected || !isIcon(link)) { restore(link, saved); originals.delete(link); }
    }
    for (const link of Array.from(head.querySelectorAll<HTMLLinkElement>('link[rel]')).filter(isIcon).slice(0, 32)) {
      if (link === badge) continue;
      const saved = originals.get(link);
      if (!saved) {
        const original = Object.fromEntries(attributes.map(key => [key, link.getAttribute(key)])) as Saved;
        originals.set(link, original);
        nextSource = original.href || '';
      } else {
        for (const key of attributes) {
          const applied = key === 'href' ? overlay : key === 'type' ? 'image/png' : '32x32';
          if (link.getAttribute(key) !== applied) {
            saved[key] = link.getAttribute(key);
            if (key === 'href') nextSource = saved.href || '';
          }
        }
      }
    }
    if (!originals.size) nextSource = '';
    if (nextSource !== source) {
      source = nextSource; image = undefined;
      const current = ++generation;
      // Use only an existing page icon. No external icon service or host permission.
      try {
        const url = new URL(source, document.baseURI);
        if (source && ['https:', 'http:', 'data:'].includes(url.protocol) && !url.username && !url.password) {
          const candidate = new Image();
          candidate.crossOrigin = 'anonymous';
          candidate.onload = () => { if (!disposed && current === generation) { image = candidate; sync(); } };
          candidate.src = url.href;
        }
      } catch { /* Keep a cursor-only badge when the site's favicon cannot be read. */ }
    }
    paint();
  };
  const observer = new MutationObserver(records => {
    if (records.some(record => record.type === 'attributes' ? record.target instanceof HTMLLinkElement :
      [...record.addedNodes, ...record.removedNodes].some(node => node instanceof HTMLLinkElement))) sync();
  });
  sync();
  return {
    update(nextColor) { if (color !== nextColor) { color = nextColor; sync(); } },
    dispose() {
      if (disposed) return;
      disposed = true; generation++; observer.disconnect();
      for (const [link, saved] of originals) restore(link, saved);
      originals.clear(); badge.remove(); image = undefined;
    }
  };
}
