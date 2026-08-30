/// <reference lib="webworker" />

import { parseMarkdownToHast, stripMarkdownTreePositions } from '../markdown/markdownPipeline'

type MarkdownWorkerRequest =
    | { type: 'warm' }
    | { type: 'parse'; id: number; content: string; allowRawHtml: boolean; headingIds?: string[] }

type MarkdownWorkerResponse =
    | { type: 'ready' }
    | { type: 'parsed'; id: number; tree: ReturnType<typeof parseMarkdownToHast> }
    | { type: 'error'; id: number; error: string }

function applyDocumentHeadingIds(tree: ReturnType<typeof parseMarkdownToHast>, headingIds: readonly string[] | undefined): void {
    if (!headingIds?.length) return
    const headings: Array<Extract<ReturnType<typeof parseMarkdownToHast>['children'][number], { type: 'element' }>> = []
    const visitNode = (node: ReturnType<typeof parseMarkdownToHast>['children'][number]) => {
        if (node.type !== 'element') return
        if (/^h[1-6]$/.test(node.tagName) && !node.properties.id) headings.push(node)
        for (const child of node.children) visitNode(child as ReturnType<typeof parseMarkdownToHast>['children'][number])
    }
    for (const child of tree.children) visitNode(child)
    // Scanner and parser must agree before assigning ordinal IDs. A mismatch is
    // safer as local IDs than shifting every later fragment target.
    if (headings.length !== headingIds.length) return
    for (let index = 0; index < headings.length; index += 1) headings[index].properties.id = headingIds[index]
}

self.onmessage = (event: MessageEvent<MarkdownWorkerRequest>) => {
    const request = event.data
    if (request.type === 'warm') {
        // Compile the unified/GFM/sanitize path while Explorer is idle instead
        // of charging the first visible Markdown section for parser startup.
        stripMarkdownTreePositions(parseMarkdownToHast('# Preview\n\n- warm parser\n\n```ts\nconst ready = true\n```\n', true))
        self.postMessage({ type: 'ready' } satisfies MarkdownWorkerResponse)
        return
    }
    try {
        const tree = parseMarkdownToHast(request.content, request.allowRawHtml)
        applyDocumentHeadingIds(tree, request.headingIds)
        stripMarkdownTreePositions(tree)
        self.postMessage({ type: 'parsed', id: request.id, tree } satisfies MarkdownWorkerResponse)
    } catch (error) {
        self.postMessage({
            type: 'error',
            id: request.id,
            error: error instanceof Error ? error.message : String(error)
        } satisfies MarkdownWorkerResponse)
    }
}
