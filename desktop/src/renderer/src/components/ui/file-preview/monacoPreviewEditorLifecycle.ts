import type { editor as MonacoEditor } from 'monaco-editor'

export type PreviewEditorChangeHandler = (
    editor: MonacoEditor.IStandaloneCodeEditor | null
) => void

export function attachPreviewEditorLifecycle(
    editor: MonacoEditor.IStandaloneCodeEditor,
    onEditorChange: PreviewEditorChangeHandler
): () => void {
    let attached = true
    onEditorChange(editor)
    const modelListener = editor.onDidChangeModel(() => {
        if (attached) onEditorChange(editor)
    })

    return () => {
        if (!attached) return
        attached = false
        modelListener.dispose()
        onEditorChange(null)
    }
}
