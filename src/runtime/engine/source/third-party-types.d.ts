// highlight.js 10 publishes its API types at the root, but omits them for
// the implementation subpaths used to avoid loading every language eagerly.
declare module 'highlight.js/lib/core.js' {
  import hljs from 'highlight.js';
  export default hljs;
}
declare module 'highlight.js/lib/index.js' {
  import hljs from 'highlight.js';
  export default hljs;
}
declare module 'highlight.js/lib/languages/*.js' {
  import type { LanguageFn } from 'highlight.js';
  const language: LanguageFn;
  export default language;
}
