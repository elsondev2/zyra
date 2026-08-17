import { useEffect, type RefObject } from 'react'
import { hasActiveTextSelection } from './fileReferences'
import { inspectMarkdownLinkAvailability } from './linkAvailability'
import { navigateMarkdownLink, resolveMarkdownLinkTarget } from './linkNavigation'

export type MarkdownInternalLinkHandler = (
    href: string
) => boolean | void | Promise<boolean | void>

export type MarkdownLinkNoticeHandler = (
    message: string,
    tone: 'info' | 'error'
) => void

type MarkdownInteractionLayerProps = {
    rootRef: RefObject<HTMLElement | null>
    filePath?: string
    searchRootPath?: string
    contentKey: string
    onInternalLinkClick?: MarkdownInternalLinkHandler
    onLinkNotice?: MarkdownLinkNoticeHandler
}

type MarkdownLinkElement = HTMLAnchorElement | HTMLElement

const MARKDOWN_INTERACTIVE_TARGET_SELECTOR = [
    'a[href]',
    'code[data-devscope-file-reference]',
    'button[data-markdown-heading-target]',
    '[data-markdown-image-target]'
].join(', ')

function findInteractiveTarget(target: EventTarget | null, root: HTMLElement): MarkdownLinkElement | null {
    const element = target instanceof HTMLElement
        ? target
        : target instanceof Text
            ? target.parentElement
            : null
    if (!element || !root.contains(element)) return null
    const containingAnchor = element.closest<HTMLAnchorElement>('a[href]')
    if (containingAnchor) return containingAnchor
    return element.closest(MARKDOWN_INTERACTIVE_TARGET_SELECTOR) as MarkdownLinkElement | null
}

function getTargetHref(target: MarkdownLinkElement): string {
    if (target instanceof HTMLAnchorElement) return target.getAttribute('href') || ''
    if (target.dataset.markdownHeadingTarget) return `#${target.dataset.markdownHeadingTarget}`
    return target.dataset.markdownImageTarget || target.dataset.devscopeFileReference || ''
}

function clearLinkState(target: MarkdownLinkElement): void {
    delete target.dataset.markdownLinkState
    delete target.dataset.markdownLinkPath
    delete target.dataset.markdownTargetKind
    target.removeAttribute('aria-disabled')
    target.removeAttribute('title')
}

function applyLinkState(
    target: MarkdownLinkElement,
    state: 'checking' | 'available' | 'missing' | 'unknown' | 'failed',
    targetPath: string,
    targetKind: 'file' | 'directory' | null = null
): void {
    target.dataset.markdownLinkState = state
    target.dataset.markdownLinkPath = targetPath
    if (targetKind) target.dataset.markdownTargetKind = targetKind
    else delete target.dataset.markdownTargetKind

    if (state === 'missing' || state === 'failed') {
        target.setAttribute('aria-disabled', 'true')
        target.title = state === 'missing'
            ? `Missing file: ${targetPath}`
            : `Could not open: ${targetPath}`
        return
    }

    target.removeAttribute('aria-disabled')
    if (state === 'checking') target.title = `Checking link: ${targetPath}`
    if (state === 'available') target.title = `Open: ${targetPath}`
    if (state === 'unknown') target.title = `Could not verify this link. Click to try: ${targetPath}`
}

const SANITIZED_FRAGMENT_PREFIX = 'user-content-'

function normalizeSanitizedFragmentId(value: string): string {
    let normalized = value
    while (normalized.startsWith(SANITIZED_FRAGMENT_PREFIX)) {
        normalized = normalized.slice(SANITIZED_FRAGMENT_PREFIX.length)
    }
    return normalized
}

function resolveMarkdownAnchorTarget(root: HTMLElement, href: string): HTMLElement | null {
    const rawId = href.slice(1)
    let targetId = rawId
    try {
        targetId = decodeURIComponent(rawId)
    } catch {
        targetId = rawId
    }
    const normalizedTargetId = normalizeSanitizedFragmentId(targetId)
    return Array.from(root.querySelectorAll<HTMLElement>('[id]'))
        .find((element) => (
            element.id === targetId
            || normalizeSanitizedFragmentId(element.id) === normalizedTargetId
        )) || null
}

function preventDragFromInteractiveTarget(target: EventTarget | null, root: HTMLElement, event: DragEvent): void {
    const interactiveTarget = findInteractiveTarget(target, root)
    if (interactiveTarget) event.preventDefault()
}

export function MarkdownInteractionLayer({
    rootRef,
    filePath,
    searchRootPath,
    contentKey,
    onInternalLinkClick,
    onLinkNotice
}: MarkdownInteractionLayerProps) {
    useEffect(() => {
        const root = rootRef.current
        if (!root) return
        let disposed = false
        let availabilityIdleId: number | null = null
        let availabilityTimerId: number | null = null
        const inspectVisibleLinks = () => {
            availabilityIdleId = null
            availabilityTimerId = null
            if (disposed) return
            const interactiveTargets = Array.from(
                root.querySelectorAll(MARKDOWN_INTERACTIVE_TARGET_SELECTOR)
            ) as MarkdownLinkElement[]

            for (const target of interactiveTargets) {
                const href = getTargetHref(target)
                if (href.startsWith('#')) continue
                const resolvedTarget = resolveMarkdownLinkTarget(href, filePath)
                if (!resolvedTarget) continue
                clearLinkState(target)
                applyLinkState(target, 'checking', resolvedTarget.path)
                void inspectMarkdownLinkAvailability(href, filePath, searchRootPath).then((result) => {
                    if (disposed || !result || !root.contains(target)) return
                    applyLinkState(target, result.availability, result.path, result.targetKind)
                })
            }
        }
        if (typeof window.requestIdleCallback === 'function') {
            availabilityIdleId = window.requestIdleCallback(inspectVisibleLinks, { timeout: 800 })
        } else {
            availabilityTimerId = window.setTimeout(inspectVisibleLinks, 0)
        }

        const handleClick = async (event: MouseEvent) => {
            const target = findInteractiveTarget(event.target, root)
            if (!target) return

            const rawHref = getTargetHref(target)
            if (!rawHref) return
            if (rawHref.startsWith('#')) {
                event.preventDefault()
                if (hasActiveTextSelection()) return
                const anchorTarget = resolveMarkdownAnchorTarget(root, rawHref)
                const currentHeading = target.closest('h1,h2,h3,h4,h5,h6')
                if (anchorTarget && currentHeading === anchorTarget) {
                    onLinkNotice?.('This section is already in view.', 'info')
                    return
                }
                anchorTarget?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                return
            }
            const imageTarget = target.dataset.markdownImageTarget
            if (imageTarget && /^https?:\/\//i.test(rawHref)) {
                event.preventDefault()
                if (hasActiveTextSelection()) return
                window.open(rawHref, '_blank', 'noopener,noreferrer')
                return
            }

            const internalTarget = resolveMarkdownLinkTarget(rawHref, filePath)
            if (!internalTarget) return

            // Local Markdown targets must never fall through to browser/app routing.
            event.preventDefault()
            if (hasActiveTextSelection()) return

            const availability = await inspectMarkdownLinkAvailability(rawHref, filePath, searchRootPath)
            if (availability?.availability === 'missing') {
                applyLinkState(target, 'missing', availability.path)
                onLinkNotice?.(`Broken link — file not found: ${availability.path}`, 'error')
                return
            }
            if (availability) {
                applyLinkState(target, availability.availability, availability.path, availability.targetKind)
            }
            const openTarget = availability?.resolvedBy === 'project-search' ? availability.path : rawHref

            try {
                const opened = onInternalLinkClick
                    ? await onInternalLinkClick(openTarget)
                    : await navigateMarkdownLink({ href: openTarget, filePath })
                if (opened === false) {
                    const targetPath = availability?.path || internalTarget.path
                    applyLinkState(target, 'failed', targetPath)
                    onLinkNotice?.(`Could not open link: ${targetPath}`, 'error')
                }
            } catch {
                const targetPath = availability?.path || internalTarget.path
                applyLinkState(target, 'failed', targetPath)
                onLinkNotice?.(`Could not open link: ${targetPath}`, 'error')
            }
        }

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key !== 'Enter' && event.key !== ' ') return
            const target = findInteractiveTarget(event.target, root)
            if (!target?.dataset.markdownImageTarget) return
            event.preventDefault()
            target.click()
        }
        const handleDragStart = (event: DragEvent) => {
            preventDragFromInteractiveTarget(event.target, root, event)
        }

        root.addEventListener('click', handleClick)
        root.addEventListener('keydown', handleKeyDown)
        root.addEventListener('dragstart', handleDragStart)
        return () => {
            disposed = true
            if (availabilityIdleId !== null) window.cancelIdleCallback(availabilityIdleId)
            if (availabilityTimerId !== null) window.clearTimeout(availabilityTimerId)
            root.removeEventListener('click', handleClick)
            root.removeEventListener('keydown', handleKeyDown)
            root.removeEventListener('dragstart', handleDragStart)
        }
    }, [contentKey, filePath, onInternalLinkClick, onLinkNotice, rootRef, searchRootPath])

    return null
}
