// @ts-nocheck
export function observePage(revision, limits = {}) {
  const maxElements = Math.min(1500, Math.max(1, Number(limits.maxElements) || 1500))
  const elements = []
  const redactions = ['password-values', 'url-query-secrets']
  const roleFor = (element) => element.getAttribute('role') || ({
    A: 'link', BUTTON: 'button', INPUT: element.type === 'password' ? 'password' : element.type === 'checkbox' ? 'checkbox' : element.type === 'radio' ? 'radio' : 'textbox',
    SELECT: 'combobox', TEXTAREA: 'textbox', IMG: 'image', H1: 'heading', H2: 'heading', H3: 'heading', IFRAME: 'iframe'
  }[element.tagName] || 'generic')
  const pathFor = (element) => {
    const parts = []
    let current = element
    while (current && current !== document.documentElement) {
      const parent = current.parentElement
      if (!parent) break
      parts.push(Array.prototype.indexOf.call(parent.children, current))
      current = parent
    }
    return parts.reverse().join('.')
  }
  const nameFor = (element) => {
    const labelled = element.getAttribute('aria-label') || element.getAttribute('title') || element.getAttribute('alt')
    if (labelled) return labelled
    const labelledBy = element.getAttribute('aria-labelledby')
    if (labelledBy) return labelledBy.split(/\s+/).map((id) => document.getElementById(id)?.textContent || '').join(' ')
    if (element.labels?.length) return Array.from(element.labels).map((label) => label.textContent || '').join(' ')
    return (element.innerText || element.textContent || '').trim().slice(0, 512)
  }
  const candidates = document.querySelectorAll('a,button,input,select,textarea,[role],[tabindex],iframe,h1,h2,h3,h4,h5,h6')
  for (const element of candidates) {
    if (elements.length >= maxElements) break
    const rect = element.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) continue
    const role = roleFor(element)
    const sensitive = role === 'password' || /pass(word|code)|secret|token|credential|credit.card|cvv|otp/i.test(`${nameFor(element)} ${element.autocomplete || ''}`)
    const states = []
    if (element.disabled) states.push('disabled')
    if (document.activeElement === element) states.push('focused')
    if (element.checked) states.push('checked')
    if (element.getAttribute('aria-expanded')) states.push(`expanded:${element.getAttribute('aria-expanded')}`)
    const actions = []
    if (/button|link|checkbox|radio|option|tab|menuitem/.test(role)) actions.push('click')
    if (/textbox|password|combobox/.test(role)) actions.push('type')
    if (/combobox|listbox/.test(role)) actions.push('select')
    elements.push({
      elementRef: `chrome-element:${revision}:${pathFor(element)}`,
      role,
      name: nameFor(element).slice(0, 512) || undefined,
      value: sensitive ? undefined : typeof element.value === 'string' ? element.value.slice(0, 2048) : undefined,
      bounds: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
      states,
      actions,
      sensitive
    })
  }
  return {
    url: location.href,
    title: document.title,
    targetState: document.readyState === 'complete' ? 'ready' : 'navigating',
    viewport: { width: innerWidth, height: innerHeight, scale: devicePixelRatio || 1 },
    elements,
    focusedElementRef: document.activeElement instanceof Element ? `chrome-element:${revision}:${pathFor(document.activeElement)}` : undefined,
    truncation: candidates.length > elements.length ? { totalElements: candidates.length, returnedElements: elements.length } : undefined,
    redactions
  }
}
