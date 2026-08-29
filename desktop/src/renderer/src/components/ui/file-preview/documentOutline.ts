import type { languages } from 'monaco-editor'
import { scanMarkdownHeadingTargets } from '../markdown/markdownHeadingIds'
import type { PreviewFileType } from './types'

export type OutlineSymbolKind =
    | 'array'
    | 'boolean'
    | 'class'
    | 'constant'
    | 'constructor'
    | 'enum'
    | 'enum-member'
    | 'field'
    | 'file'
    | 'function'
    | 'heading'
    | 'interface'
    | 'key'
    | 'method'
    | 'module'
    | 'namespace'
    | 'number'
    | 'object'
    | 'operator'
    | 'package'
    | 'property'
    | 'string'
    | 'struct'
    | 'type-parameter'
    | 'variable'

export type DocumentOutlineItem = {
    id: string
    name: string
    detail?: string
    kind: OutlineSymbolKind
    startLine: number
    startColumn: number
    endLine: number
    endColumn: number
    selectionLine: number
    selectionColumn: number
    headingId?: string
    children: DocumentOutlineItem[]
}

export type VisibleOutlineItem = {
    item: DocumentOutlineItem
    depth: number
    parentNames: string[]
}

type LeveledOutlineItem = {
    item: DocumentOutlineItem
    level: number
}

const OUTLINE_SOURCE_LIMIT = 2 * 1024 * 1024
const CONTROL_FLOW_NAMES = new Set(['if', 'for', 'while', 'switch', 'catch', 'return', 'sizeof'])
const OUTLINE_LANGUAGE_LABELS: Record<string, string> = {
    bash: 'Shell',
    bat: 'Batch',
    c: 'C',
    cpp: 'C++',
    csharp: 'C#',
    css: 'CSS',
    dart: 'Dart',
    dockerfile: 'Dockerfile',
    go: 'Go',
    groovy: 'Groovy',
    html: 'HTML',
    ini: 'INI',
    java: 'Java',
    javascript: 'JavaScript',
    json: 'JSON',
    json5: 'JSON',
    jsonc: 'JSON',
    jsx: 'JavaScript',
    kotlin: 'Kotlin',
    less: 'Less',
    markdown: 'Markdown',
    md: 'Markdown',
    php: 'PHP',
    plaintext: 'Text',
    powershell: 'PowerShell',
    python: 'Python',
    ruby: 'Ruby',
    rust: 'Rust',
    scala: 'Scala',
    scss: 'SCSS',
    shell: 'Shell',
    sql: 'SQL',
    text: 'Text',
    tsx: 'TypeScript',
    typescript: 'TypeScript',
    xml: 'XML',
    yaml: 'YAML',
    yml: 'YAML'
}

export function documentOutlineLanguageLabel(fileType: PreviewFileType, language?: string): string {
    if (fileType === 'md') return 'Markdown'
    const normalizedLanguage = (language || (fileType === 'json' ? 'json' : fileType === 'html' ? 'html' : 'text')).toLowerCase()
    return OUTLINE_LANGUAGE_LABELS[normalizedLanguage]
        || normalizedLanguage.split(/[-_]/).filter(Boolean).map((part) => `${part[0]?.toUpperCase() || ''}${part.slice(1)}`).join(' ')
        || 'Text'
}

export function shouldRefreshOutlineImmediately(
    fileType: PreviewFileType,
    currentDocumentKey: string,
    nextDocumentKey: string
): boolean {
    return fileType === 'md' || currentDocumentKey !== nextDocumentKey
}

function createItem(
    name: string,
    kind: OutlineSymbolKind,
    startLine: number,
    startColumn: number,
    detail?: string
): DocumentOutlineItem {
    const normalizedName = name.trim()
    return {
        id: `${kind}:${startLine}:${startColumn}:${normalizedName}`,
        name: normalizedName,
        detail: detail?.trim() || undefined,
        kind,
        startLine,
        startColumn,
        endLine: startLine,
        endColumn: startColumn + Math.max(1, normalizedName.length),
        selectionLine: startLine,
        selectionColumn: startColumn,
        children: []
    }
}

function buildHierarchy(entries: LeveledOutlineItem[], lineCount: number): DocumentOutlineItem[] {
    const roots: DocumentOutlineItem[] = []
    const stack: LeveledOutlineItem[] = []

    for (const entry of entries) {
        while (stack.length > 0 && stack[stack.length - 1].level >= entry.level) {
            const completed = stack.pop()!
            completed.item.endLine = Math.max(completed.item.startLine, entry.item.startLine - 1)
        }

        const parent = stack.at(-1)?.item
        if (parent) parent.children.push(entry.item)
        else roots.push(entry.item)
        stack.push(entry)
    }

    while (stack.length > 0) {
        const completed = stack.pop()!
        completed.item.endLine = Math.max(completed.item.startLine, lineCount)
    }

    return roots
}

function markdownOffsetLines(content: string, offsets: number[]): number[] {
    const lines: number[] = []
    let line = 1
    let cursor = 0
    for (const offset of offsets) {
        while (cursor < offset && cursor < content.length) {
            if (content.charCodeAt(cursor) === 10) line += 1
            cursor += 1
        }
        lines.push(line)
    }
    return lines
}

export function buildMarkdownOutline(content: string): DocumentOutlineItem[] {
    if (!content || content.length > OUTLINE_SOURCE_LIMIT) return []
    const headings = scanMarkdownHeadingTargets(content).filter((heading) => heading.text?.trim())
    const headingLines = markdownOffsetLines(content, headings.map((heading) => heading.offset))
    const entries = headings.map((heading, index): LeveledOutlineItem => {
        const text = heading.text!.trim()
        const line = headingLines[index]
        const item = createItem(text, 'heading', line, 1)
        item.headingId = heading.id
        item.id = `heading:${heading.id}:${line}`
        return { item, level: Math.max(1, heading.depth || 1) }
    })
    return buildHierarchy(entries, Math.max(1, content.split('\n').length))
}

function indentationWidth(line: string): number {
    let width = 0
    for (const character of line) {
        if (character === ' ') width += 1
        else if (character === '\t') width += 4
        else break
    }
    return width
}

function stripLineForBraceCounting(line: string): string {
    let result = ''
    let quote = ''
    let escaped = false
    for (let index = 0; index < line.length; index += 1) {
        const character = line[index]
        const next = line[index + 1]
        if (escaped) {
            escaped = false
            continue
        }
        if (quote) {
            if (character === '\\') escaped = true
            else if (character === quote) quote = ''
            continue
        }
        if (character === '"' || character === "'" || character === '`') {
            quote = character
            continue
        }
        if (character === '/' && next === '/') break
        result += character
    }
    return result
}

function braceDelta(line: string): number {
    const source = stripLineForBraceCounting(line)
    let delta = 0
    for (const character of source) {
        if (character === '{') delta += 1
        else if (character === '}') delta -= 1
    }
    return delta
}

type DefinitionMatch = {
    name: string
    kind: OutlineSymbolKind
    detail?: string
}

function matchPythonDefinition(line: string): DefinitionMatch | null {
    const classMatch = /^\s*class\s+([A-Za-z_]\w*)/.exec(line)
    if (classMatch) return { name: classMatch[1], kind: 'class' }
    const functionMatch = /^\s*(?:async\s+)?def\s+([A-Za-z_]\w*)\s*(\([^:]*\))?/.exec(line)
    if (functionMatch) return { name: functionMatch[1], kind: 'function', detail: functionMatch[2] }
    return null
}

function matchJavaScriptDefinition(line: string): DefinitionMatch | null {
    const containerMatch = /^\s*(?:export\s+)?(?:default\s+)?(?:abstract\s+)?(class|interface|enum|namespace|module|type)\s+([A-Za-z_$][\w$]*)/.exec(line)
    if (containerMatch) {
        const kindByKeyword: Record<string, OutlineSymbolKind> = {
            class: 'class', interface: 'interface', enum: 'enum', namespace: 'namespace', module: 'module', type: 'type-parameter'
        }
        return { name: containerMatch[2], kind: kindByKeyword[containerMatch[1]] }
    }
    const functionMatch = /^\s*(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)\s*(\([^)]*\))?/.exec(line)
    if (functionMatch) return { name: functionMatch[1], kind: 'function', detail: functionMatch[2] }
    const arrowMatch = /^\s*(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*(?::[^=]+)?=\s*(?:async\s*)?(\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>/.exec(line)
    if (arrowMatch) return { name: arrowMatch[1], kind: 'function', detail: arrowMatch[2] }
    const methodMatch = /^\s*(?:public\s+|private\s+|protected\s+|static\s+|async\s+|readonly\s+|override\s+)*([A-Za-z_$][\w$]*)\s*(\([^)]*\))\s*(?::\s*([^={;]+))?\s*(\{|;)?\s*$/.exec(line)
    if (
        methodMatch
        && !CONTROL_FLOW_NAMES.has(methodMatch[1])
        && (methodMatch[3] || methodMatch[4] === '{')
    ) {
        return { name: methodMatch[1], kind: 'method', detail: methodMatch[2] }
    }
    return null
}

function matchRustDefinition(line: string): DefinitionMatch | null {
    const containerMatch = /^\s*(?:pub(?:\([^)]*\))?\s+)?(mod|struct|enum|trait|impl|type|const|static)\s+([^\s<{(;:=]+)/.exec(line)
    if (containerMatch) {
        const kindByKeyword: Record<string, OutlineSymbolKind> = {
            mod: 'module', struct: 'struct', enum: 'enum', trait: 'interface', impl: 'class', type: 'type-parameter', const: 'constant', static: 'constant'
        }
        return { name: containerMatch[2], kind: kindByKeyword[containerMatch[1]] }
    }
    const functionMatch = /^\s*(?:pub(?:\([^)]*\))?\s+)?(?:async\s+)?(?:unsafe\s+)?fn\s+([A-Za-z_]\w*)\s*(\([^)]*\))?/.exec(line)
    if (functionMatch) return { name: functionMatch[1], kind: 'function', detail: functionMatch[2] }
    const macroMatch = /^\s*macro_rules!\s*([A-Za-z_]\w*)/.exec(line)
    return macroMatch ? { name: macroMatch[1], kind: 'function', detail: 'macro' } : null
}

function matchGoDefinition(line: string): DefinitionMatch | null {
    const typeMatch = /^\s*type\s+([A-Za-z_]\w*)\s+(struct|interface|\w+)/.exec(line)
    if (typeMatch) return { name: typeMatch[1], kind: typeMatch[2] === 'struct' ? 'struct' : typeMatch[2] === 'interface' ? 'interface' : 'type-parameter' }
    const methodMatch = /^\s*func\s+\([^)]*\)\s*([A-Za-z_]\w*)\s*(\([^)]*\))?/.exec(line)
    if (methodMatch) return { name: methodMatch[1], kind: 'method', detail: methodMatch[2] }
    const functionMatch = /^\s*func\s+([A-Za-z_]\w*)\s*(\([^)]*\))?/.exec(line)
    return functionMatch ? { name: functionMatch[1], kind: 'function', detail: functionMatch[2] } : null
}

function matchCLikeDefinition(line: string): DefinitionMatch | null {
    const containerMatch = /^\s*(?:(?:public|private|protected|internal|abstract|sealed|static|final|open|data|partial)\s+)*(namespace|class|struct|interface|enum|record|object)\s+([A-Za-z_]\w*)/.exec(line)
    if (containerMatch) {
        const kindByKeyword: Record<string, OutlineSymbolKind> = {
            namespace: 'namespace', class: 'class', struct: 'struct', interface: 'interface', enum: 'enum', record: 'struct', object: 'object'
        }
        return { name: containerMatch[2], kind: kindByKeyword[containerMatch[1]] }
    }
    const functionMatch = /^\s*(?:(?:public|private|protected|internal|static|virtual|override|abstract|final|inline|constexpr|synchronized|native|async|extern)\s+)*(?:[\w:<>,.?\[\]*&]+\s+)+([A-Za-z_]\w*)\s*(\([^;{}]*\))\s*(?:const\s*)?(?:\{|=>|throws\b)?/.exec(line)
    if (!functionMatch || CONTROL_FLOW_NAMES.has(functionMatch[1])) return null
    return { name: functionMatch[1], kind: 'function', detail: functionMatch[2] }
}

function matchRubyDefinition(line: string): DefinitionMatch | null {
    const containerMatch = /^\s*(class|module)\s+([A-Za-z_]\w*(?:::[A-Za-z_]\w*)*)/.exec(line)
    if (containerMatch) return { name: containerMatch[2], kind: containerMatch[1] === 'class' ? 'class' : 'module' }
    const methodMatch = /^\s*def\s+(?:self\.)?([A-Za-z_]\w*[!?=]?)\s*(\([^)]*\))?/.exec(line)
    return methodMatch ? { name: methodMatch[1], kind: 'method', detail: methodMatch[2] } : null
}

function matchPhpDefinition(line: string): DefinitionMatch | null {
    const containerMatch = /^\s*(?:(?:abstract|final|readonly)\s+)*(class|interface|trait|enum|namespace)\s+([A-Za-z_][\w\\]*)/.exec(line)
    if (containerMatch) {
        const kindByKeyword: Record<string, OutlineSymbolKind> = {
            class: 'class', interface: 'interface', trait: 'interface', enum: 'enum', namespace: 'namespace'
        }
        return { name: containerMatch[2], kind: kindByKeyword[containerMatch[1]] }
    }
    const functionMatch = /^\s*(?:(?:public|private|protected|static|final|abstract)\s+)*function\s+&?\s*([A-Za-z_]\w*)\s*(\([^)]*\))?/.exec(line)
    return functionMatch ? { name: functionMatch[1], kind: 'function', detail: functionMatch[2] } : null
}

function matchShellDefinition(line: string, language: string): DefinitionMatch | null {
    if (language === 'powershell') {
        const match = /^\s*(function|filter|class|enum)\s+([\w-]+)/i.exec(line)
        if (!match) return null
        return { name: match[2], kind: match[1].toLowerCase() === 'class' ? 'class' : match[1].toLowerCase() === 'enum' ? 'enum' : 'function' }
    }
    const match = /^\s*(?:function\s+)?([A-Za-z_][\w-]*)\s*\(\s*\)\s*\{?/.exec(line)
    return match ? { name: match[1], kind: 'function' } : null
}

function matchSqlDefinition(line: string): DefinitionMatch | null {
    const match = /^\s*create\s+(?:or\s+replace\s+)?(?:temporary\s+)?(table|view|function|procedure|trigger|schema)\s+(?:if\s+not\s+exists\s+)?([\w."`\[\]-]+)/i.exec(line)
    if (!match) return null
    const keyword = match[1].toLowerCase()
    return {
        name: match[2].replace(/^["`\[]|["`\]]$/g, ''),
        kind: keyword === 'function' || keyword === 'procedure' || keyword === 'trigger' ? 'function' : keyword === 'schema' ? 'namespace' : 'object',
        detail: keyword
    }
}

function matchYamlDefinition(line: string): DefinitionMatch | null {
    const match = /^\s*(?:-\s+)?([A-Za-z0-9_.-]+)\s*:\s*(.*)$/.exec(line)
    if (!match) return null
    return { name: match[1], kind: match[2].trim() ? 'property' : 'object' }
}

function matchDefinition(line: string, language: string): DefinitionMatch | null {
    if (language === 'python') return matchPythonDefinition(line)
    if (language === 'javascript' || language === 'typescript' || language === 'jsx' || language === 'tsx') return matchJavaScriptDefinition(line)
    if (language === 'rust') return matchRustDefinition(line)
    if (language === 'go') return matchGoDefinition(line)
    if (language === 'ruby') return matchRubyDefinition(line)
    if (language === 'php') return matchPhpDefinition(line)
    if (language === 'shell' || language === 'bash' || language === 'powershell') return matchShellDefinition(line, language)
    if (language === 'sql') return matchSqlDefinition(line)
    if (language === 'yaml' || language === 'yml') return matchYamlDefinition(line)
    if (['c', 'cpp', 'csharp', 'java', 'kotlin', 'scala', 'dart', 'groovy'].includes(language)) return matchCLikeDefinition(line)
    return null
}

function usesIndentationHierarchy(language: string): boolean {
    return language === 'python' || language === 'yaml' || language === 'yml'
}

export function buildStructuralOutline(content: string, language: string): DocumentOutlineItem[] {
    if (!content || content.length > OUTLINE_SOURCE_LIMIT) return []
    const normalizedLanguage = language.toLowerCase()
    const lines = content.split(/\r?\n/)
    const entries: LeveledOutlineItem[] = []
    let depth = 0
    let insideJavaScriptImport = false
    const javascriptLike = ['javascript', 'typescript', 'jsx', 'tsx'].includes(normalizedLanguage)

    for (let index = 0; index < lines.length; index += 1) {
        const line = lines[index]
        const trimmed = line.trim()
        const startsJavaScriptImport = javascriptLike && /^import(?:\s|\{)/.test(trimmed)
        const isJavaScriptImportLine = insideJavaScriptImport || startsJavaScriptImport
        if (startsJavaScriptImport) insideJavaScriptImport = true
        const hashCommentLanguage = ['python', 'ruby', 'shell', 'bash', 'powershell', 'yaml', 'yml'].includes(normalizedLanguage)
        const isComment = trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('*') || trimmed.startsWith('--') || (hashCommentLanguage && trimmed.startsWith('#'))
        const leadingClosers = stripLineForBraceCounting(line).match(/^\s*}+/)?.[0].replace(/\s/g, '').length || 0
        const definitionDepth = usesIndentationHierarchy(normalizedLanguage)
            ? indentationWidth(line)
            : Math.max(0, depth - leadingClosers)
        const definition = !isComment && !isJavaScriptImportLine ? matchDefinition(line, normalizedLanguage) : null
        if (definition) {
            const nameColumn = Math.max(1, line.indexOf(definition.name) + 1)
            entries.push({
                item: createItem(definition.name, definition.kind, index + 1, nameColumn, definition.detail),
                level: definitionDepth
            })
        }
        if (!usesIndentationHierarchy(normalizedLanguage)) depth = Math.max(0, depth + braceDelta(line))
        if (
            isJavaScriptImportLine
            && (
                /;\s*$/.test(trimmed)
                || /\bfrom\s+['"][^'"]+['"]\s*$/.test(trimmed)
                || /^import\s+['"][^'"]+['"]\s*$/.test(trimmed)
            )
        ) {
            insideJavaScriptImport = false
        }
    }

    return buildHierarchy(entries, Math.max(1, lines.length))
}

const MONACO_KIND_MAP: Record<number, OutlineSymbolKind> = {
    0: 'file', 1: 'module', 2: 'namespace', 3: 'package', 4: 'class', 5: 'method',
    6: 'property', 7: 'field', 8: 'constructor', 9: 'enum', 10: 'interface', 11: 'function',
    12: 'variable', 13: 'constant', 14: 'string', 15: 'number', 16: 'boolean', 17: 'array',
    18: 'object', 19: 'key', 20: 'field', 21: 'object', 22: 'enum-member', 23: 'struct',
    24: 'operator', 25: 'type-parameter'
}

export function fromMonacoDocumentSymbols(symbols: languages.DocumentSymbol[]): DocumentOutlineItem[] {
    return symbols.map((symbol) => ({
        id: `monaco:${symbol.kind}:${symbol.range.startLineNumber}:${symbol.range.startColumn}:${symbol.name}`,
        name: symbol.name,
        detail: symbol.detail || undefined,
        kind: MONACO_KIND_MAP[symbol.kind] || 'variable',
        startLine: symbol.range.startLineNumber,
        startColumn: symbol.range.startColumn,
        endLine: symbol.range.endLineNumber,
        endColumn: symbol.range.endColumn,
        selectionLine: symbol.selectionRange.startLineNumber,
        selectionColumn: symbol.selectionRange.startColumn,
        children: fromMonacoDocumentSymbols(symbol.children || [])
    }))
}

export function supportsDocumentOutline(fileType: PreviewFileType): boolean {
    return fileType === 'md' || fileType === 'code' || fileType === 'json' || fileType === 'html' || fileType === 'text'
}

export function countOutlineItems(items: DocumentOutlineItem[]): number {
    let count = 0
    const visit = (nodes: DocumentOutlineItem[]) => {
        for (const node of nodes) {
            count += 1
            visit(node.children)
        }
    }
    visit(items)
    return count
}

function fuzzyIncludes(value: string, query: string): boolean {
    const haystack = value.toLocaleLowerCase()
    const needle = query.toLocaleLowerCase().trim()
    if (!needle) return true
    if (haystack.includes(needle)) return true
    let queryIndex = 0
    for (const character of haystack) {
        if (character === needle[queryIndex]) queryIndex += 1
        if (queryIndex === needle.length) return true
    }
    return false
}

export function filterDocumentOutline(items: DocumentOutlineItem[], query: string, ancestors: string[] = []): DocumentOutlineItem[] {
    const normalizedQuery = query.trim()
    if (!normalizedQuery) return items
    const filtered: DocumentOutlineItem[] = []
    for (const item of items) {
        const path = [...ancestors, item.name]
        const children = filterDocumentOutline(item.children, normalizedQuery, path)
        const searchable = `${path.join(' ')} ${item.detail || ''}`
        if (children.length > 0 || fuzzyIncludes(searchable, normalizedQuery)) filtered.push({ ...item, children })
    }
    return filtered
}

export function flattenVisibleOutline(
    items: DocumentOutlineItem[],
    collapsedIds: ReadonlySet<string>,
    searchActive: boolean,
    depth = 0,
    parentNames: string[] = []
): VisibleOutlineItem[] {
    const visible: VisibleOutlineItem[] = []
    for (const item of items) {
        visible.push({ item, depth, parentNames })
        if (item.children.length > 0 && (searchActive || !collapsedIds.has(item.id))) {
            visible.push(...flattenVisibleOutline(item.children, collapsedIds, searchActive, depth + 1, [...parentNames, item.name]))
        }
    }
    return visible
}

export function findDeepestOutlineItemAtLine(items: DocumentOutlineItem[], line: number): DocumentOutlineItem | null {
    let match: DocumentOutlineItem | null = null
    const visit = (nodes: DocumentOutlineItem[]) => {
        for (const item of nodes) {
            if (line < item.startLine || line > item.endLine) continue
            match = item
            visit(item.children)
        }
    }
    visit(items)
    return match
}
