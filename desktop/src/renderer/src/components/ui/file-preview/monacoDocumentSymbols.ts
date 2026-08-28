import type { editor, languages } from 'monaco-editor'

type MonacoCommandService = {
    executeCommand: <T>(commandId: string, ...args: unknown[]) => Promise<T>
}

type MonacoEditorWithCommandService = editor.IStandaloneCodeEditor & {
    _commandService?: MonacoCommandService
}

type DocumentSymbolRetryOptions = {
    retryDelaysMs?: readonly number[]
    isCurrent?: () => boolean
    wait?: (delayMs: number) => Promise<void>
}

const DEFAULT_RETRY_DELAYS_MS = [90, 240] as const

function waitFor(delayMs: number): Promise<void> {
    return new Promise((resolve) => window.setTimeout(resolve, delayMs))
}

/**
 * Monaco exposes document-symbol registration publicly but not provider lookup.
 * Its own Outline action uses this command, so keep the private bridge isolated
 * here and fall back cleanly when a Monaco release changes the internal shape.
 */
export async function readMonacoDocumentSymbols(
    editorInstance: editor.IStandaloneCodeEditor
): Promise<languages.DocumentSymbol[]> {
    const model = editorInstance.getModel()
    const commandService = (editorInstance as MonacoEditorWithCommandService)._commandService
    if (!model || !commandService) return []

    try {
        const symbols = await commandService.executeCommand<languages.DocumentSymbol[]>(
            '_executeDocumentSymbolProvider',
            model.uri
        )
        return Array.isArray(symbols) ? symbols : []
    } catch {
        return []
    }
}

export async function readMonacoDocumentSymbolsWithRetry(
    editorInstance: editor.IStandaloneCodeEditor,
    options: DocumentSymbolRetryOptions = {}
): Promise<languages.DocumentSymbol[]> {
    const initialModel = editorInstance.getModel()
    if (!initialModel) return []

    const languageId = initialModel.getLanguageId()
    const retryDelaysMs = options.retryDelaysMs
        ?? (languageId === 'plaintext' ? [] : DEFAULT_RETRY_DELAYS_MS)
    const isCurrent = options.isCurrent ?? (() => true)
    const wait = options.wait ?? waitFor
    let symbols = await readMonacoDocumentSymbols(editorInstance)

    for (const retryDelayMs of retryDelaysMs) {
        if (symbols.length > 0 || !isCurrent()) break
        await wait(retryDelayMs)
        if (!isCurrent() || editorInstance.getModel() !== initialModel) return []
        symbols = await readMonacoDocumentSymbols(editorInstance)
    }

    return symbols
}
