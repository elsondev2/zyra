// @ts-nocheck
export function runPageAction(revision, action) {
  const prefix = `chrome-element:${revision}:`
  const resolve = (reference) => {
    if (typeof reference !== 'string' || !reference.startsWith(prefix)) throw new Error('The element reference belongs to a stale observation.')
    let current = document.documentElement
    const path = reference.slice(prefix.length)
    if (!path) return current
    for (const part of path.split('.')) {
      const index = Number(part)
      if (!Number.isInteger(index) || !current.children[index]) throw new Error('The observed element no longer exists.')
      current = current.children[index]
    }
    return current
  }
  const dangerous = /buy|purchase|pay|send|publish|post|delete|remove account|install|accept terms|agree/i
  const ensureSideEffect = (element) => {
    const label = `${element.getAttribute('aria-label') || ''} ${element.textContent || ''}`.slice(0, 512)
    if (dangerous.test(label) && (!action.sideEffect || action.sideEffect === 'none')) throw new Error('This action may have an external side effect and requires explicit approval.')
  }
  if (action.type === 'click') {
    const element = resolve(action.elementRef)
    ensureSideEffect(element)
    element.focus()
    element.click()
    return { changed: true }
  }
  if (action.type === 'type') {
    const element = resolve(action.elementRef)
    if (element.type === 'password') throw new Error('Model control cannot type into password fields.')
    element.focus()
    if (action.replace) element.value = ''
    element.value = `${element.value || ''}${action.text}`
    element.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: action.text }))
    element.dispatchEvent(new Event('change', { bubbles: true }))
    return { changed: true }
  }
  if (action.type === 'key') {
    const target = document.activeElement || document.body
    target.dispatchEvent(new KeyboardEvent('keydown', { key: action.key, ctrlKey: action.modifiers?.includes('control'), altKey: action.modifiers?.includes('alt'), shiftKey: action.modifiers?.includes('shift'), metaKey: action.modifiers?.includes('meta'), bubbles: true }))
    target.dispatchEvent(new KeyboardEvent('keyup', { key: action.key, bubbles: true }))
    return { changed: true }
  }
  if (action.type === 'scroll') {
    const target = action.elementRef ? resolve(action.elementRef) : window
    target.scrollBy({ left: action.deltaX, top: action.deltaY, behavior: 'instant' })
    return { changed: true }
  }
  if (action.type === 'select') {
    const element = resolve(action.elementRef)
    ensureSideEffect(element)
    if (!(element instanceof HTMLSelectElement)) throw new Error('The observed element is not a select control.')
    for (const option of element.options) option.selected = action.values.includes(option.value)
    element.dispatchEvent(new Event('input', { bubbles: true }))
    element.dispatchEvent(new Event('change', { bubbles: true }))
    return { changed: true }
  }
  if (action.type === 'focus') {
    window.focus()
    return { changed: true }
  }
  throw new Error(`Unsupported page action: ${action.type}`)
}
