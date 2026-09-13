/** Native views do not inherit DOM ancestor layout or transforms. */
export function observeAssistantBrowserSlotGeometry(slot: HTMLElement, report: () => void): () => void {
    const ancestors: HTMLElement[] = []
    for (let element: HTMLElement | null = slot; element; element = element.parentElement) ancestors.push(element)
    let disposed = false
    let frame = 0
    const animating = () => ancestors.some(element => element.getAnimations().some(animation => {
        if (animation.playState !== 'running' && !animation.pending) return false
        // Ambient infinite effects must not keep geometry polling alive.
        return animation.effect?.getComputedTiming().iterations !== Infinity
    }))
    const tick = () => {
        frame = 0
        if (disposed) return
        report()
        if (animating()) frame = window.requestAnimationFrame(tick)
    }
    const schedule = () => {
        if (!disposed && !frame) frame = window.requestAnimationFrame(tick)
    }
    const resize = new ResizeObserver(schedule)
    const mutation = new MutationObserver(schedule)
    for (const element of ancestors) {
        resize.observe(element)
        mutation.observe(element, { attributes: true, attributeFilter: ['class', 'style', 'hidden'] })
        element.addEventListener('transitionrun', schedule)
        element.addEventListener('transitionend', schedule)
        element.addEventListener('transitioncancel', schedule)
        element.addEventListener('animationstart', schedule)
        element.addEventListener('animationend', schedule)
        element.addEventListener('animationcancel', schedule)
    }
    window.addEventListener('resize', schedule)
    window.addEventListener('scroll', schedule, true)
    report()
    schedule()
    return () => {
        disposed = true
        window.cancelAnimationFrame(frame)
        resize.disconnect()
        mutation.disconnect()
        window.removeEventListener('resize', schedule)
        window.removeEventListener('scroll', schedule, true)
        for (const element of ancestors) {
            element.removeEventListener('transitionrun', schedule)
            element.removeEventListener('transitionend', schedule)
            element.removeEventListener('transitioncancel', schedule)
            element.removeEventListener('animationstart', schedule)
            element.removeEventListener('animationend', schedule)
            element.removeEventListener('animationcancel', schedule)
        }
    }
}
