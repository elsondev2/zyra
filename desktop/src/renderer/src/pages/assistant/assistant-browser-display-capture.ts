// Chromium's display request is paired with the next one-use main-frame grant.
// Serialize the grant and request together so a menu preview cannot consume a
// recorder's audio grant (or capture a different tab during rapid switching).
let captureQueue: Promise<void> = Promise.resolve()

export function requestAssistantBrowserDisplayCapture(
    prepare: () => Promise<void>,
    constraints: DisplayMediaStreamOptions
): Promise<MediaStream> {
    const request = captureQueue.then(async () => {
        await prepare()
        return navigator.mediaDevices.getDisplayMedia(constraints)
    })
    // Retain serialization even if the caller's UI deadline/cancellation fires.
    // A late native result must settle before another grant can be installed.
    captureQueue = request.then(() => undefined, () => undefined)
    return request
}
