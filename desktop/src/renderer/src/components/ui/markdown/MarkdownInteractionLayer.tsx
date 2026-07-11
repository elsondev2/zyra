import { useEffect, type RefObject } from 'react'
import { hasActiveTextSelection } from './fileReferences'
import { resolveMarkdownLinkTarget } from './linkNavigation'

type MarkdownInteractionLayerProps = {
    rootRef: RefObject<HTMLElement | null>
    filePath?: string
    onInternalLinkClick?: (href: string) => Promise<void> | void
}

function findInteractiveTarget(target: EventTarget | null, root: HTMLElement): HTMLElement | null {
    const element = target instanceof HTMLElement
        ? target
        : target instanceof Text
            ? target.parentElement
            : null
    if (!element || !root.contains(element)) return null
    return element.closest('a[href], code[data-devscope-file-reference]') as HTMLElement | null
}

function preventDragFromInteractiveTarget(target: EventTarget | null, root: HTMLElement, event: DragEvent): void {
    const interactiveTarget = findInteractiveTarget(target, root)
    if (interactiveTarget) {
        event.preventDefault()
    }
}

export function MarkdownInteractionLayer({
    rootRef,
    filePath,
    onInternalLinkClick
}: MarkdownInteractionLayerProps) {
    useEffect(() => {
        const root = rootRef.current
        if (!root || !onInternalLinkClick) return

        const handleClick = (event: MouseEvent) => {
            const target = findInteractiveTarget(event.target, root)
            if (!target) return

            if (target instanceof HTMLAnchorElement) {
                const rawHref = target.getAttribute('href') || ''
                if (!rawHref || rawHref.startsWith('#')) return
                const internalTarget = resolveMarkdownLinkTarget(rawHref, filePath)
                if (!internalTarget) return
                event.preventDefault()
                if (hasActiveTextSelection()) return
                void onInternalLinkClick(rawHref)
                return
            }

            const fileReference = target.dataset.devscopeFileReference || ''
            if (!fileReference) return
            event.preventDefault()
            if (hasActiveTextSelection()) return
            void onInternalLinkClick(fileReference)
        }

        const handleDragStart = (event: DragEvent) => {
            preventDragFromInteractiveTarget(event.target, root, event)
        }

        root.addEventListener('click', handleClick)
        root.addEventListener('dragstart', handleDragStart)
        return () => {
            root.removeEventListener('click', handleClick)
            root.removeEventListener('dragstart', handleDragStart)
        }
    }, [filePath, onInternalLinkClick, rootRef])

    return null
}
