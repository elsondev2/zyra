import { synchronizeNativeOverlayFonts } from './native-overlay-fonts'

export interface NativeOverlayDocument {
    container: HTMLElement
    ready: Promise<void>
    dispose: () => void
}

/** Keep the portal's presentation identical to its owner without mounting a second app. */
export function initializeNativeOverlayDocument(owner: Document, target: Document): NativeOverlayDocument {
    target.open()
    target.write('<!doctype html><html><head><meta charset="UTF-8"><title>Zyra overlays</title></head><body></body></html>')
    target.close()
    const base = target.createElement('base')
    base.href = owner.baseURI
    target.head.append(base)
    const shell = target.createElement('style')
    shell.textContent = 'html,body{background:transparent!important;margin:0!important;min-height:100%;overflow:hidden}body{-webkit-app-region:no-drag!important}#zyra-native-overlay-root{position:fixed;inset:0;pointer-events:none}#zyra-native-overlay-root>*{pointer-events:auto}'
    const container = target.createElement('div')
    container.id = 'zyra-native-overlay-root'
    target.body.append(container)
    const disposeFonts = synchronizeNativeOverlayFonts(owner, target)
    const copies = new Map<Element, Element>()
    let disposed = false
    let queued = false
    const loading: Promise<void>[] = []
    const syncAttributes = (source: Element, destination: Element) => {
        for (const attribute of [...destination.attributes]) if (!source.hasAttribute(attribute.name)) destination.removeAttribute(attribute.name)
        for (const attribute of [...source.attributes]) if (destination.getAttribute(attribute.name) !== attribute.value) destination.setAttribute(attribute.name, attribute.value)
    }
    const sync = () => {
        queued = false
        if (disposed) return
        syncAttributes(owner.documentElement, target.documentElement)
        syncAttributes(owner.body, target.body)
        const sources = [...owner.head.querySelectorAll('style,link[rel="stylesheet"]')]
        for (const [source, copy] of copies) if (!sources.includes(source)) { copy.remove(); copies.delete(source) }
        let previous: Element = base
        for (const source of sources) {
            let copy = copies.get(source)
            if (!copy) {
                copy = target.importNode(source, true) as Element
                copies.set(source, copy)
                if (copy.tagName === 'LINK') {
                    const link = copy as HTMLLinkElement
                    loading.push(new Promise(resolve => {
                        let timer: ReturnType<typeof setTimeout>
                        const settled = () => {
                            clearTimeout(timer)
                            link.removeEventListener('load', settled)
                            link.removeEventListener('error', settled)
                            resolve()
                        }
                        link.addEventListener('load', settled, { once: true })
                        link.addEventListener('error', settled, { once: true })
                        timer = setTimeout(settled, 5000)
                    }))
                }
            } else {
                syncAttributes(source, copy)
                if (source.tagName === 'STYLE' && source.textContent !== copy.textContent) copy.textContent = source.textContent
            }
            if (previous.nextElementSibling !== copy) previous.after(copy)
            previous = copy
        }
        if (previous.nextElementSibling !== shell) previous.after(shell)
    }
    const queue = () => { if (!queued) { queued = true; queueMicrotask(sync) } }
    sync()
    const observer = new MutationObserver(queue)
    observer.observe(owner.head, { subtree: true, childList: true, characterData: true, attributes: true })
    observer.observe(owner.documentElement, { attributes: true })
    observer.observe(owner.body, { attributes: true })
    return {
        container,
        ready: Promise.all(loading).then(() => undefined),
        dispose: () => { disposed = true; observer.disconnect(); disposeFonts(); copies.clear() }
    }
}
