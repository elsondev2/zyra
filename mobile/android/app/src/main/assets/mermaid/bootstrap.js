/* Zyra's trusted offline renderer. Mermaid 11.17.2 is bundled from Desktop. */
window.__zyraMermaidResult = null;
window.zyraRenderMermaid = async function (source, theme) {
  window.__zyraMermaidResult = null;
  try {
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: 'strict',
      suppressErrorRendering: true,
      maxTextSize: 8000,
      maxEdges: 128,
      htmlLabels: false,
      deterministicIds: true,
      deterministicIDSeed: 'zyra-mobile',
      theme: 'base',
      themeVariables: theme,
      flowchart: { htmlLabels: false, useMaxWidth: false },
      sequence: { useMaxWidth: false },
      secure: ['securityLevel', 'startOnLoad', 'maxTextSize', 'maxEdges', 'htmlLabels', 'theme', 'themeVariables', 'flowchart', 'sequence', 'secure']
    });
    const result = await mermaid.render('zyra-mobile-diagram', source);
    if (result.svg.length > 640000) throw new Error('Diagram too large');
    const parsed = new DOMParser().parseFromString(result.svg, 'image/svg+xml');
    const root = parsed.documentElement;
    if (root.localName !== 'svg' || root.querySelector('parsererror,script,foreignObject,image,iframe,object,embed')) throw new Error('Unsupported diagram content');
    const elements = [root, ...root.querySelectorAll('*')];
    if (elements.length > 6000) throw new Error('Diagram too complex');
    for (const element of elements) for (const attribute of [...element.attributes]) {
      if (/^on/i.test(attribute.name) || /^(?:xlink:)?href$/i.test(attribute.name)) throw new Error('Interactive SVG is disabled');
    }
    const holder = document.createElement('div');
    holder.style.cssText = 'position:absolute;left:-10000px;top:0;width:1000px';
    const svg = document.importNode(root, true);
    holder.appendChild(svg); document.body.appendChild(holder);
    try {
      // Resolve Mermaid CSS once, then ship static native SVG attributes. Android never evaluates a stylesheet.
      const properties = ['fill','fill-opacity','fill-rule','stroke','stroke-opacity','stroke-width','stroke-dasharray','stroke-dashoffset','stroke-linecap','stroke-linejoin','opacity','font-size','font-family','font-weight','font-style','text-anchor','dominant-baseline','marker-start','marker-mid','marker-end','visibility','display'];
      const resolved = [];
      for (const element of [svg, ...svg.querySelectorAll('*')]) {
        if (element.localName === 'style') continue;
        const computed = getComputedStyle(element);
        const attributes = [];
        for (const name of properties) {
          let value = computed.getPropertyValue(name).trim();
          if (!value) continue;
          if (value.startsWith('url(')) {
            const raw = value.slice(4, -1).trim().replace(/^['"]|['"]$/g, '');
            const target = new URL(raw, location.href);
            value = target.hash && target.href.split('#')[0] === location.href.split('#')[0] ? 'url(' + target.hash + ')' : 'none';
          }
          if (name.startsWith('marker-') && element.closest('marker')) value = 'none';
          attributes.push([name, value]);
        }
        resolved.push([element, attributes]);
      }
      // Snapshot every computed value before removing ancestor classes used by descendant selectors.
      for (const [element, attributes] of resolved) {
        for (const [name, value] of attributes) element.setAttribute(name, value);
        element.removeAttribute('style'); element.removeAttribute('class'); element.removeAttribute('filter');
      }
      svg.querySelectorAll('style').forEach(element => element.remove());
      // Mermaid includes optional shadow definitions. Native diagrams use static geometry, not SVG filters.
      svg.querySelectorAll('filter').forEach(element => element.remove());
      const output = new XMLSerializer().serializeToString(svg);
      if (output.length > 640000) throw new Error('Diagram too large');
      window.__zyraMermaidResult = { svg: output };
    } finally { holder.remove(); }
  } catch (error) {
    window.__zyraMermaidResult = { error: 'This diagram could not be rendered.' };
  }
};

