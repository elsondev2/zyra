/// <reference lib="webworker" />

import { buildMarkdownPreviewSections } from './markdownPreviewVirtualModel'

type MarkdownIndexWorkerRequest =
    | { type: 'warm' }
    | { type: 'index'; id: number; content: string }

type MarkdownIndexWorkerResponse =
    | { type: 'ready' }
    | { type: 'indexed'; id: number; sections: ReturnType<typeof buildMarkdownPreviewSections> }
    | { type: 'error'; id: number; error: string }

self.onmessage = (event: MessageEvent<MarkdownIndexWorkerRequest>) => {
    const request = event.data
    if (request.type === 'warm') {
        buildMarkdownPreviewSections('# Preview\n\nWarm semantic index.\n')
        self.postMessage({ type: 'ready' } satisfies MarkdownIndexWorkerResponse)
        return
    }
    try {
        const sections = buildMarkdownPreviewSections(request.content)
        self.postMessage({ type: 'indexed', id: request.id, sections } satisfies MarkdownIndexWorkerResponse)
    } catch (error) {
        self.postMessage({
            type: 'error',
            id: request.id,
            error: error instanceof Error ? error.message : String(error)
        } satisfies MarkdownIndexWorkerResponse)
    }
}
