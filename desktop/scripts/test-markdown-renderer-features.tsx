import assert from 'node:assert/strict'
import { createElement, Fragment } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { readFileSync } from 'node:fs'
import { prepareMarkdownRender } from '../src/renderer/src/components/ui/MarkdownRenderer'
import { compactMarkdownPathLabel } from '../src/renderer/src/components/ui/markdown/InlineTargets'

assert.equal(
    compactMarkdownPathLabel('C:\\Users\\developer\\projects\\zyra\\desktop\\src\\renderer\\src\\components\\ui\\MarkdownRenderer.tsx', 58),
    'C:\\...\\src\\renderer\\src\\components\\ui\\MarkdownRenderer.tsx',
    'long absolute paths preserve the drive and useful ending on one line'
)

const content = `# Guide

## Setup

First section.

## Setup

Second section.

- [x] Parsed Markdown
- [ ] Visual review

| Surface | State |
| --- | --- |
| Chat | Shared |
| Preview | Shared |

A note with a footnote.[^1]

![Architecture](./missing-architecture.png)

[Timeline source](./src/AssistantVirtualTimeline.tsx:42)

The implementation also lives in desktop/src/renderer/src/pages/assistant/AssistantVirtualTimeline.tsx:42.

[External docs](https://example.com/docs)

\`AssistantVirtualTimeline.tsx\`

\`@pierre/trees\` and \`@pierre/trees/react\`

Use [\`@pierre/trees/react\`](https://trees.software/docs) for the file tree.

\`\`\`tsx title="AssistantVirtualTimeline.tsx"
export const ready = true
\`\`\`

<details open>
<summary>More context</summary>
Safe details content.
</details>

<div data-cache-raw="yes" onclick="alert('unsafe')">Safe raw content</div>
<script>window.markdownUnsafe = true</script>
<iframe src="https://example.com"></iframe>

[^1]: Footnote details.
`

const tree = prepareMarkdownRender({
    content,
    cacheKey: 'markdown-renderer-features:v1',
    filePath: 'C:/workspace/README.md'
})
const markup = renderToStaticMarkup(createElement(Fragment, null, tree))

assert.match(markup, /<h1 id="guide"/)
assert.match(markup, /<h2 id="setup"/)
assert.match(markup, /<h2 id="setup-2"/, 'duplicate headings receive deterministic unique anchors')
assert.match(markup, /<button[^>]*data-markdown-heading-target="guide"/, 'heading controls cannot navigate through HashRouter')
assert.match(markup, /aria-label="This section is already in view"/, 'heading controls explain their local behavior')
assert.doesNotMatch(markup, /href="#guide"/, 'self-heading controls have no browser-navigation fallback')
assert.match(markup, /contains-task-list/)
assert.match(markup, /task-list-item/)
assert.match(markup, /type="checkbox"[^>]*disabled/, 'task checkboxes remain visibly read-only')
assert.match(markup, /role="region" aria-label="Markdown table"/, 'tables expose a keyboard-focusable scroll region')
assert.match(markup, /aria-label="Expand table cells"/, 'tables can expand truncated cells')
assert.match(markup, /aria-label="Copy table"/, 'tables can copy as Markdown or CSV')
assert.match(markup, /data-footnotes(?:="")?/, 'footnote semantics survive rendering')
assert.match(markup, /id="(?:user-content-)+fn-1"/, 'footnote IDs retain the sanitizer clobber prefix')
assert.match(markup, /href="#user-content-fn-1"/, 'footnote references retain their generated target')
assert.match(markup, /loading="lazy"/)
assert.match(markup, /decoding="async"/, 'document images avoid blocking initial layout')
assert.match(markup, /data-markdown-image-target="\.\/missing-architecture\.png"/, 'images open through the shared target interaction layer')
assert.match(markup, /data-markdown-file-link=""/, 'local Markdown links render as inline file tags')
assert.doesNotMatch(markup, /markdown-path-peek/, 'local file tags do not mount hover preview cards')
assert.match(markup, /data-markdown-copy="desktop\/src\/renderer\/src\/pages\/assistant\/AssistantVirtualTimeline\.tsx:42"/, 'verified-looking plain paths are enhanced without changing copied prose')
assert.match(markup, /data-markdown-package-link="@pierre\/trees"/, 'scoped packages render as internet package links')
assert.match(markup, /href="https:\/\/www\.npmjs\.com\/package\/@pierre\/trees"/, 'standalone package export paths link to their npm package')
const linkedPackageMarkup = markup.match(/<a href="https:\/\/trees\.software\/docs"[\s\S]*?<\/a>/)?.[0] || ''
assert.match(linkedPackageMarkup, /data-markdown-package-link="@pierre\/trees"/, 'a linked package keeps the outer website as its semantic target')
assert.doesNotMatch(linkedPackageMarkup.replace(/^<a\b[^>]*>/, ''), /<a\b/, 'linked inline code never creates nested anchors')
assert.equal((linkedPackageMarkup.match(/markdown-inline-site-icon/g) || []).length, 1, 'a linked package renders one source favicon')
assert.match(markup, /file_type_(?:reactts|typescript)[^" ]*\.svg/, 'TypeScript file tags use the existing VS Code icon resolver')
assert.match(markup, /google\.com\/s2\/favicons\?domain=example\.com/, 'external links lazily request the source favicon')
assert.match(markup, /data-language="tsx"/, 'code blocks retain their language semantics')
assert.match(markup, /AssistantVirtualTimeline\.tsx/, 'fence titles remain visible in code-block chrome')
assert.match(markup, /data-markdown-details=""/, 'safe details sections get shared disclosure styling')
assert.match(markup, /data-cache-raw="yes"/, 'safe raw HTML attributes can survive sanitization')
assert.doesNotMatch(markup, /onclick=/i, 'raw HTML event handlers are stripped')
assert.doesNotMatch(markup, /<script/i, 'raw scripts are stripped')
assert.doesNotMatch(markup, /<iframe/i, 'raw embeds are stripped')

const rendererSource = readFileSync(new URL('../src/renderer/src/components/ui/MarkdownRenderer.tsx', import.meta.url), 'utf8')
const codeSource = readFileSync(new URL('../src/renderer/src/components/ui/markdown/CodeElements.tsx', import.meta.url), 'utf8')
const mermaidSource = readFileSync(new URL('../src/renderer/src/components/ui/markdown/MermaidDiagram.tsx', import.meta.url), 'utf8')
const componentSource = readFileSync(new URL('../src/renderer/src/components/ui/markdown/components.tsx', import.meta.url), 'utf8')
const inlineTargetsSource = readFileSync(new URL('../src/renderer/src/components/ui/markdown/InlineTargets.tsx', import.meta.url), 'utf8')
const interactionSource = readFileSync(new URL('../src/renderer/src/components/ui/markdown/MarkdownInteractionLayer.tsx', import.meta.url), 'utf8')
const linkAvailabilitySource = readFileSync(new URL('../src/renderer/src/components/ui/markdown/linkAvailability.ts', import.meta.url), 'utf8')
assert.equal(rendererSource.includes('DEFERRED_MARKDOWN_LENGTH'), true, 'very large documents yield an initial render frame')
assert.equal(rendererSource.includes('enhancePlainPathReferences(tree)'), true, 'plain AI path references enter the shared file-link pipeline')
assert.equal(rendererSource.includes('rehypeSanitize, MARKDOWN_SANITIZE_SCHEMA'), true, 'raw HTML is sanitized after parsing')
assert.equal(rendererSource.includes('createMarkdownClipboardPayload'), true, 'formatted selections copy back as Markdown and safe rich HTML')
assert.equal(interactionSource.includes('normalizeSanitizedFragmentId'), true, 'sanitized footnote and heading fragments still resolve inside their document')
assert.equal(componentSource.includes('MarkdownPathPeek'), false, 'file tags remain direct click targets without private hover UI')
assert.equal(inlineTargetsSource.includes('FolderClosed'), true, 'resolved folder links have a recognizable folder-specific icon')
assert.equal(linkAvailabilitySource.includes('getFileTree(projectRoot'), false, 'bare filename checks use the indexed path service instead of rescanning the project tree')
assert.equal(rendererSource.includes('window.requestIdleCallback(prepare'), true)
assert.equal(codeSource.includes("await import('./MermaidDiagram')"), true, 'ordinary Markdown does not load Mermaid')
assert.equal(codeSource.includes("import { MermaidDiagram } from './MermaidDiagram'"), false)
assert.equal(mermaidSource.includes("securityLevel: 'strict'"), true, 'diagram rendering retains strict link/script security')
assert.equal(mermaidSource.includes('MAX_MERMAID_CACHE_ENTRIES'), true, 'diagram output caching is bounded')
assert.equal(componentSource.includes("alt || 'Image unavailable'"), true, 'failed images have an intentional fallback')
assert.equal(codeSource.includes('aria-pressed={wrapped}'), true, 'code blocks expose an accessible line-wrap toggle')
assert.equal(componentSource.includes('dataCodeMeta'), true, 'fenced-code filename metadata reaches code-block chrome')

console.log('Markdown renderer feature contract: ok')
process.exit(0)
