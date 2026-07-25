const SKIPPED_TAGS = new Set(['BUTTON', 'INPUT', 'SCRIPT', 'STYLE', 'TEMPLATE'])
const SANITIZED_HTML_SELECTOR = [
    'button',
    'input',
    'script',
    'style',
    'svg',
    '[aria-hidden="true"]',
    '[data-markdown-chrome]'
].join(', ')

export type MarkdownClipboardPayload = {
    text: string
    html: string
}

function shouldSkipElement(element: Element): boolean {
    return SKIPPED_TAGS.has(element.tagName)
        || element.localName === 'svg'
        || element.getAttribute('aria-hidden') === 'true'
        || element.hasAttribute('data-markdown-chrome')
}

function wrapInline(content: string, marker: string): string {
    const match = /^(\s*)([\s\S]*?)(\s*)$/.exec(content)
    const core = match?.[2] || ''
    if (!core) return content
    return `${match?.[1] || ''}${marker}${core}${marker}${match?.[3] || ''}`
}

function wrapInlineCode(value: string): string {
    const longestRun = [...(value.match(/`+/g) || [])]
        .reduce((longest, run) => Math.max(longest, run.length), 0)
    const fence = '`'.repeat(Math.max(1, longestRun + (longestRun > 0 ? 1 : 0)))
    const padding = value.startsWith('`') || value.endsWith('`') ? ' ' : ''
    return `${fence}${padding}${value}${padding}${fence}`
}

function fenceForCode(value: string): string {
    const longestRun = [...(value.match(/`{3,}/g) || [])]
        .reduce((longest, run) => Math.max(longest, run.length), 0)
    return '`'.repeat(Math.max(3, longestRun + 1))
}

function serializeCodeBlock(pre: Element): string {
    const value = (pre.textContent || '').replace(/\n$/, '')
    const language = pre.closest('[data-language]')?.getAttribute('data-language') || ''
    const fence = fenceForCode(value)
    return `${fence}${language === 'code' || language === 'text' ? '' : language}\n${value}\n${fence}\n\n`
}

function serializeTableCell(cell: Element): string {
    return serializeChildren(cell).replace(/\n+/g, ' ').trim().replace(/\|/g, '\\|')
}

function serializeTable(table: Element): string {
    const rows = Array.from(table.querySelectorAll(':scope > thead > tr, :scope > tbody > tr, :scope > tr'))
    const lines: string[] = []
    let emittedSeparator = false
    for (const row of rows) {
        const cells = Array.from(row.children).filter((cell) => cell.tagName === 'TH' || cell.tagName === 'TD')
        if (cells.length === 0) continue
        lines.push(`| ${cells.map(serializeTableCell).join(' | ')} |`)
        if (!emittedSeparator) {
            lines.push(`| ${cells.map((cell) => {
                const align = (cell as HTMLElement).style.textAlign || cell.getAttribute('align') || ''
                if (align === 'center') return ':---:'
                if (align === 'right') return '---:'
                return '---'
            }).join(' | ')} |`)
            emittedSeparator = true
        }
    }
    return lines.length > 0 ? `${lines.join('\n')}\n\n` : ''
}

function serializeListItem(item: Element, ordered: boolean, index: number): string {
    const checkbox = item.querySelector<HTMLInputElement>('input[type="checkbox"]')
    const task = checkbox ? `[${checkbox.checked ? 'x' : ' '}] ` : ''
    const marker = ordered ? `${index}. ${task}` : `- ${task}`
    const content = serializeChildren(item).replace(/\n{3,}/g, '\n\n').trim()
    const [first = '', ...rest] = content.split('\n')
    const indent = ' '.repeat(marker.length)
    return [
        `${marker}${first}`,
        ...rest.map((line) => line ? `${indent}${line}` : line)
    ].join('\n')
}

function serializeList(list: Element, ordered: boolean): string {
    const start = Number.parseInt(list.getAttribute('start') || '1', 10) || 1
    const items = Array.from(list.children).filter((child) => child.tagName === 'LI')
    return items.length > 0
        ? `${items.map((item, index) => serializeListItem(item, ordered, start + index)).join('\n')}\n\n`
        : ''
}

function serializeBlockquote(quote: Element): string {
    const content = serializeChildren(quote).replace(/\n{3,}/g, '\n\n').trim()
    if (!content) return ''
    return `${content.split('\n').map((line) => line ? `> ${line}` : '>').join('\n')}\n\n`
}

function serializeDetails(details: Element): string {
    const summary = details.querySelector(':scope > summary')?.textContent?.trim() || 'Details'
    const content = Array.from(details.childNodes)
        .filter((child) => !(child instanceof Element && child.tagName === 'SUMMARY'))
        .map(serializeNode)
        .join('')
        .trim()
    const open = details.hasAttribute('open') ? ' open' : ''
    return `<details${open}>\n<summary>${summary}</summary>${content ? `\n\n${content}` : ''}\n</details>\n\n`
}

function serializeAnchor(anchor: Element): string {
    const explicitCopy = anchor.getAttribute('data-markdown-copy')
    if (explicitCopy !== null) return explicitCopy
    const content = serializeChildren(anchor)
    const href = anchor.getAttribute('href') || ''
    if (!href || href.startsWith('#')) return content
    const label = content.trim()
    if (!label) return ''
    return label === href ? href : `[${label}](${href})`
}

function serializeChildren(node: Node): string {
    return Array.from(node.childNodes).map(serializeNode).join('')
}

function serializeNode(node: Node): string {
    if (node.nodeType === Node.TEXT_NODE) {
        const value = node.textContent || ''
        return value.includes('\n') && !value.trim() ? '\n' : value
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return ''
    const element = node as Element
    const explicitCopy = element.getAttribute('data-markdown-copy')
    if (explicitCopy !== null) return explicitCopy
    if (shouldSkipElement(element)) return ''

    const headingLevel = /^H([1-6])$/.exec(element.tagName)?.[1]
    if (headingLevel) return `${'#'.repeat(Number(headingLevel))} ${serializeChildren(element).trim()}\n\n`

    switch (element.tagName) {
        case 'BR': return '\n'
        case 'HR': return '---\n\n'
        case 'P': return `${serializeChildren(element).trim()}\n\n`
        case 'PRE': return serializeCodeBlock(element)
        case 'CODE': return wrapInlineCode(element.textContent || '')
        case 'STRONG':
        case 'B': return wrapInline(serializeChildren(element), '**')
        case 'EM':
        case 'I': return wrapInline(serializeChildren(element), '*')
        case 'DEL':
        case 'S': return wrapInline(serializeChildren(element), '~~')
        case 'A': return serializeAnchor(element)
        case 'IMG': {
            const alt = element.getAttribute('alt') || ''
            const src = element.getAttribute('src') || ''
            return src ? `![${alt}](${src})` : ''
        }
        case 'UL': return serializeList(element, false)
        case 'OL': return serializeList(element, true)
        case 'BLOCKQUOTE': return serializeBlockquote(element)
        case 'TABLE': return serializeTable(element)
        case 'DETAILS': return serializeDetails(element)
        case 'DIV':
        case 'SECTION':
        case 'ARTICLE': {
            const content = serializeChildren(element)
            return content && !content.endsWith('\n') ? `${content}\n` : content
        }
        default: return serializeChildren(element)
    }
}

function tidyMarkdown(value: string): string {
    return value
        .split(/(```[\s\S]*?(?:```|$))/)
        .map((part, index) => index % 2 === 1
            ? part
            : part.replace(/[ \t]+(?=\n)/g, '').replace(/\n{3,}/g, '\n\n'))
        .join('')
        .trim()
}

export function serializeRenderedMarkdownFragment(container: Node): string {
    return tidyMarkdown(serializeChildren(container))
}

function sanitizedHtmlFrom(container: Element): string {
    for (const node of container.querySelectorAll(SANITIZED_HTML_SELECTOR)) node.remove()
    return `<meta charset="utf-8">${container.innerHTML}`
}

export function createMarkdownClipboardPayload(selection: Selection): MarkdownClipboardPayload | null {
    const texts: string[] = []
    const htmls: string[] = []
    for (let index = 0; index < selection.rangeCount; index += 1) {
        const range = selection.getRangeAt(index)
        if (range.collapsed) continue
        const container = document.createElement('div')
        container.appendChild(range.cloneContents())
        const text = serializeRenderedMarkdownFragment(container)
        if (!text) continue
        texts.push(text)
        htmls.push(sanitizedHtmlFrom(container))
    }
    return texts.length > 0 ? { text: texts.join('\n\n'), html: htmls.join('') } : null
}
