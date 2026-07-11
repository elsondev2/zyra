import { Children, cloneElement, isValidElement, type ReactElement, type ReactNode } from 'react'

const COLOR_TOKEN_REGEX =
    /#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b|(?:rgb|rgba|hsl|hsla|hwb|lab|lch|oklab|oklch|color)\(\s*[^)\n]+\)/g

function isCssColorToken(token: string): boolean {
    const normalized = token.trim()
    if (!normalized) return false

    if (typeof window !== 'undefined' && window.CSS && typeof window.CSS.supports === 'function') {
        return window.CSS.supports('color', normalized)
    }

    return /^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(normalized)
}

function renderColorToken(token: string, key: string): ReactNode {
    return (
        <span
            key={key}
            className="font-mono"
            style={{
                color: token,
                textShadow: '0 0 0.25px currentColor'
            }}
        >
            {token}
        </span>
    )
}

export function hasColorToken(text: string): boolean {
    COLOR_TOKEN_REGEX.lastIndex = 0
    return COLOR_TOKEN_REGEX.test(text)
}

export function renderColorAwareText(text: string, keyPrefix: string, _compact = false): ReactNode {
    if (!text) return text

    const matches = Array.from(text.matchAll(COLOR_TOKEN_REGEX))
    if (matches.length === 0) return text

    const parts: ReactNode[] = []
    let cursor = 0

    for (const [index, match] of matches.entries()) {
        const token = match[0]
        const start = match.index ?? 0
        const end = start + token.length

        if (start > cursor) {
            parts.push(<span key={`${keyPrefix}-txt-${index}`}>{text.slice(cursor, start)}</span>)
        }

        if (isCssColorToken(token)) {
            parts.push(renderColorToken(token, `${keyPrefix}-color-${index}`))
        } else {
            parts.push(<span key={`${keyPrefix}-raw-${index}`}>{token}</span>)
        }

        cursor = end
    }

    if (cursor < text.length) {
        parts.push(<span key={`${keyPrefix}-tail`}>{text.slice(cursor)}</span>)
    }

    return <>{parts}</>
}

export function renderColorAwareChildren(children: ReactNode, keyPrefix: string, compact = false): ReactNode {
    return Children.map(children, (child, index) => {
        const key = `${keyPrefix}-${index}`
        if (typeof child === 'string') {
            return renderColorAwareText(child, key, compact)
        }

        if (!isValidElement(child)) return child
        if (!('props' in child)) return child

        const element = child as ReactElement<{ children?: ReactNode }>
        if (element.props?.children === undefined || element.props?.children === null) return child

        return cloneElement(element, {
            ...element.props,
            children: renderColorAwareChildren(element.props.children, key, compact)
        })
    })
}
