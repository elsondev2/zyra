import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { AssistantPendingUserInputPanel } from '../../src/renderer/src/pages/assistant/AssistantPendingUserInputPanel'
const root = createRoot(document.getElementById('root')!)
const sleep = () => new Promise((resolve) => setTimeout(resolve, 25))
const check = (value: unknown, label: string) => {
    if (!value) throw new Error(label)
}
const results: string[] = []
const wait = async (fn: () => boolean, label: string) => {
    const deadline = Date.now() + 3500
    while (!fn() && Date.now() < deadline) await sleep()
    check(fn(), label)
}
let questionId = 'choices',
    required = true,
    choice = true
const responses: any[] = [],
    saved: any[] = []
let clipText = 'My own pasted explanation',
    clipImage = false
Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: {
        read: async () => [
            {
                types: [clipImage ? 'image/png' : 'text/plain'],
                getType: async (type: string) =>
                    new Blob(
                        [
                            type === 'text/plain'
                                ? clipText
                                : Uint8Array.from(
                                      atob(
                                          'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+X2ioAAAAASUVORK5CYII=',
                                      ),
                                      (c) => c.charCodeAt(0),
                                  ),
                        ],
                        { type },
                    ),
            },
        ],
    },
})
;(window as any).devscope = {
    assistant: {
        getVoiceTranscriptionState: async () => ({
            success: true,
            provider: 'codex',
            available: true,
            signedIn: true,
            status: 'ready',
        }),
        persistClipboardImage: async (input: any) => {
            saved.push(input)
            return { success: true, path: `/fixture/${input.fileName}` }
        },
        resolveClipboardAttachment: async (input: any) => {
            saved.push(input)
            return { success: true, path: '/fixture/upload.txt' }
        },
    },
}
const props = {
    responding: false,
    sessionId: 'fixture-session',
    assistantAvailable: true,
    assistantConnected: true,
    selectedProjectPath: null,
    availableModels: [{ id: 'fixture/model', label: 'Model', inputModes: ['text', 'image'] }],
    activeModel: 'fixture/model',
    modelsLoading: false,
    runtimeMode: 'full-access' as const,
    interactionMode: 'default' as const,
    activeProfile: 'yolo-fast' as const,
    activeStatusLabel: 'Ready',
    onRespond: async (requestId: string, answers: any, files: any) => {
        responses.push({ requestId, answers, files })
    },
}
const render = (empty = false) =>
    flushSync(() =>
        root.render(
            <AssistantPendingUserInputPanel
                key={questionId}
                {...props}
                pendingUserInputs={
                    empty
                        ? []
                        : ([
                              {
                                  requestId: questionId,
                                  status: 'pending',
                                  createdAt: new Date().toISOString(),
                                  questions: [
                                      {
                                          id: 'answer',
                                          header: 'Test',
                                          question: 'Choose or explain',
                                          type: choice ? 'single_select' : 'text',
                                          options: choice
                                              ? [
                                                    { label: 'Passed', description: '' },
                                                    { label: 'Fix it', description: '' },
                                                ]
                                              : [],
                                          required,
                                          allowOther: false,
                                          placeholder: 'Type another answer',
                                      },
                                  ],
                              },
                          ] as any)
                }
            />,
        ),
    )
const button = (label: string) =>
    Array.from(document.querySelectorAll<HTMLButtonElement>('button')).find(
        (b) => b.textContent?.trim() === label || b.getAttribute('aria-label') === label,
    )!
const input = () =>
    document.querySelector<HTMLTextAreaElement>('textarea[aria-label="Your answer"]')!
;(window as any).sidebarContinuityCheck = (async () => {
    render()
    await sleep()
    await sleep()
    check(
        button('Type another answer'),
        'Choice questions retain a third editable option even with allowOther false',
    )
    check(
        button('Attach files') && !button('Attach files').disabled,
        'Attachments are available alongside suggested choices',
    )
    check(button('Continue').disabled, 'Required choice is not silently skipped')
    button('Type another answer').click()
    await wait(() => Boolean(input()), 'Custom choice opens an editable answer')
    button('Paste').click()
    await wait(
        () => input().value === clipText,
        'Paste inserts clipboard text into a custom answer',
    )
    check(!button('Continue').disabled, 'Typed custom answer is complete')
    button('Continue').click()
    await wait(() => Boolean(button('Submit')), 'Custom answer reaches review')
    button('Submit').click()
    button('Submit').click()
    await wait(() => responses.length === 1, 'Response submits once')
    check(
        responses[0].answers.answer === clipText,
        'Custom text reaches the response callback without selecting a fixed option',
    )
    results.push('Choice escape, custom clipboard paste and required-answer guard')
    questionId = 'optional'
    required = false
    choice = false
    render()
    await sleep()
    await sleep()
    check(
        Array.from(document.querySelectorAll('button')).filter(
            (b) => b.textContent?.trim() === 'Skip',
        ).length === 1,
        'Exactly one primary Skip button exists for an empty optional answer',
    )
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!
    setter.call(input(), 'A comment')
    input().dispatchEvent(new Event('input', { bubbles: true }))
    await sleep()
    check(
        button('Continue') && !button('Skip'),
        'The same primary action becomes Continue when text is entered',
    )
    setter.call(input(), '')
    input().dispatchEvent(new Event('input', { bubbles: true }))
    await sleep()
    button('Skip').click()
    await wait(
        () => Boolean(button('Submit')),
        'Empty optional response advances via the primary action',
    )
    button('Submit').click()
    await wait(() => responses.length === 2, 'Skipped answer submits')
    check(
        responses[1].answers.answer === '',
        'Skipping is explicit and preserves empty-answer semantics',
    )
    results.push('One Continue/Skip action, empty optional answers and review')
    questionId = 'files'
    required = true
    choice = false
    render()
    await sleep()
    await sleep()
    const fileInput = document.querySelector<HTMLInputElement>('input[type="file"]')!
    const files = new DataTransfer()
    files.items.add(
        new File(['Complete supporting notes'], 'notes.txt', {
            type: 'text/plain',
        }),
    )
    Object.defineProperty(fileInput, 'files', {
        configurable: true,
        value: files.files,
    })
    fileInput.dispatchEvent(new Event('change', { bubbles: true }))
    await wait(
        () => document.body.textContent!.includes('notes.txt'),
        'A selected file appears on the attachment shelf',
    )
    clipImage = true
    button('Paste').click()
    await wait(
        () => Boolean(document.querySelector('[aria-label="Open preview for pasted-image.png"]')),
        'Clipboard image becomes an attachment',
    )
    check(
        saved.some((x) => x.dataUrl?.startsWith('data:image/png;base64,')),
        'Pasted image persists through the existing image API',
    )
    button('Continue').click()
    await wait(() => Boolean(button('Submit')), 'File-only answer reaches review')
    const removalButtons = () =>
        Array.from(document.querySelectorAll<HTMLButtonElement>('button')).filter((item) =>
            item.getAttribute('aria-label')?.startsWith('Remove '),
        )
    await wait(
        () => removalButtons().length === 2 && removalButtons().every((item) => !item.disabled),
        'Attachment entry animation finishes before removal',
    )
    for (const remove of removalButtons()) remove.click()
    await wait(
        () => button('Submit')?.disabled === true,
        'Removing all evidence invalidates the required file-only answer',
    )
    button('Submit').click()
    await sleep()
    check(responses.length === 2, 'An answer claiming missing attachments cannot submit')
    button('Back').click()
    await wait(() => Boolean(input()), 'Missing required answer can be edited')
    check(input().value === '', 'The orphaned file-only caption is not presented as typed text')
    Object.defineProperty(fileInput, 'files', {
        configurable: true,
        value: files.files,
    })
    fileInput.dispatchEvent(new Event('change', { bubbles: true }))
    await wait(() => document.body.textContent!.includes('notes.txt'), 'Evidence can be restored')
    button('Paste').click()
    await wait(
        () => Boolean(document.querySelector('[aria-label="Open preview for pasted-image.png"]')),
        'Image evidence can be restored',
    )
    button('Continue').click()
    await wait(
        () => button('Submit')?.disabled === false,
        'Restoring evidence validates the attachment-only answer',
    )
    button('Submit').click()
    await wait(() => responses.length === 3, 'Attachments submit')
    check(
        responses[2].files.length === 2 &&
            responses[2].files.some((f: any) => f.content === 'Complete supporting notes'),
        'Complete file content and image path accompany the answer',
    )
    results.push('File picker, clipboard image, attachment shelf and file-only response')
    questionId = 'long-paste'
    render()
    await sleep()
    await sleep()
    clipImage = false
    clipText = 'Evidence line\n'.repeat(150)
    button('Paste').click()
    await wait(
        () => Boolean(document.querySelector('[data-composer-attachment-item]')),
        'Long clipboard text becomes a readable attachment',
    )
    check(input().value === '', 'Long paste does not flood the answer field')
    render(true)
    await sleep()
    render()
    await sleep()
    check(input(), 'Empty pending state restores without a hooks-order error')
    results.push('Long text paste and empty-prompt lifecycle')
    return results
})()
