import { useEffect, useRef, RefObject } from 'react'
import { rendererVisibility, shouldSnapRendererPresentation } from './renderer-visibility'

interface SmoothScrollOptions {
  ease?: number
  enabled?: boolean
}

/**
 * Smooth scrolling with linear interpolation (lerp)
 */
export function useSmoothScroll(
  containerRef: RefObject<HTMLElement>,
  options: SmoothScrollOptions = {}
) {
  const { ease = 0.1, enabled = true } = options

  const targetY = useRef(0)
  const currentY = useRef(0)
  const animationFrame = useRef<number | null>(null)
  const isAnimating = useRef(false)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    // Initialize
    currentY.current = container.scrollTop
    targetY.current = container.scrollTop

    if (!enabled) {
      isAnimating.current = false
      return
    }

    const snapToTarget = () => {
      if (animationFrame.current !== null) {
        cancelAnimationFrame(animationFrame.current)
        animationFrame.current = null
      }
      const maxScroll = Math.max(0, container.scrollHeight - container.clientHeight)
      const settledTarget = Math.max(0, Math.min(targetY.current, maxScroll))
      targetY.current = settledTarget
      currentY.current = settledTarget
      container.scrollTop = settledTarget
      isAnimating.current = false
    }

    const animate = () => {
      animationFrame.current = null
      const visibility = rendererVisibility.getSnapshot()
      if (shouldSnapRendererPresentation(visibility, visibility.resumeRevision)) {
        snapToTarget()
        return
      }

      const diff = targetY.current - currentY.current

      if (Math.abs(diff) < 0.5) {
        currentY.current = targetY.current
        container.scrollTop = targetY.current
        isAnimating.current = false
        return
      }

      currentY.current += diff * ease
      container.scrollTop = currentY.current
      animationFrame.current = requestAnimationFrame(animate)
    }

    const startAnimation = () => {
      const visibility = rendererVisibility.getSnapshot()
      if (shouldSnapRendererPresentation(visibility, visibility.resumeRevision)) {
        snapToTarget()
        return
      }
      if (!isAnimating.current) {
        isAnimating.current = true
        animationFrame.current = requestAnimationFrame(animate)
      }
    }

    const handleWheel = (e: WheelEvent) => {
      // Check if the wheel event is inside a nested scrollable element
      // If so, let that element handle scrolling naturally
      let target = e.target as HTMLElement | null
      while (target && target !== container) {
        // Check if this element is scrollable
        const style = window.getComputedStyle(target)
        const isScrollable = (
          (style.overflowY === 'auto' || style.overflowY === 'scroll') &&
          target.scrollHeight > target.clientHeight
        )
        if (isScrollable) {
          // This is a nested scrollable element, let it handle the scroll
          return
        }
        target = target.parentElement
      }

      e.preventDefault()
      targetY.current += e.deltaY
      const maxScroll = container.scrollHeight - container.clientHeight
      targetY.current = Math.max(0, Math.min(targetY.current, maxScroll))
      startAnimation()
    }

    const handleScroll = () => {
      if (!isAnimating.current) {
        currentY.current = container.scrollTop
        targetY.current = container.scrollTop
      }
    }

    const unsubscribeVisibility = rendererVisibility.subscribe(snapToTarget)
    container.addEventListener('wheel', handleWheel, { passive: false })
    container.addEventListener('scroll', handleScroll, { passive: true })

    return () => {
      unsubscribeVisibility()
      container.removeEventListener('wheel', handleWheel)
      container.removeEventListener('scroll', handleScroll)
      if (animationFrame.current !== null) {
        cancelAnimationFrame(animationFrame.current)
        animationFrame.current = null
      }
    }
  }, [ease, enabled, containerRef])

  // Return refs so caller can reset them
  return { targetY, currentY, animationFrame, isAnimating }
}

export default useSmoothScroll
