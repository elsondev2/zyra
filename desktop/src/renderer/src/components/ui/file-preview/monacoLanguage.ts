const MONACO_LANGUAGE_ALIASES: Record<string, string> = {
    bash: 'shell',
    batch: 'bat',
    csharp: 'csharp',
    csv: 'plaintext',
    docker: 'dockerfile',
    git: 'plaintext',
    gitignore: 'plaintext',
    html: 'html',
    javascript: 'javascript',
    json5: 'json',
    jsonc: 'json',
    jsx: 'javascript',
    makefile: 'plaintext',
    markdown: 'markdown',
    md: 'markdown',
    powershell: 'powershell',
    tsv: 'plaintext',
    tsx: 'typescript',
    xml: 'xml',
    yaml: 'yaml'
}

const MONACO_SUPPORTED_LANGUAGES = new Set([
    'bat',
    'c',
    'cpp',
    'css',
    'csharp',
    'dart',
    'dockerfile',
    'go',
    'groovy',
    'html',
    'ini',
    'java',
    'javascript',
    'json',
    'kotlin',
    'less',
    'markdown',
    'php',
    'plaintext',
    'powershell',
    'python',
    'ruby',
    'rust',
    'scala',
    'scss',
    'shell',
    'sql',
    'typescript',
    'xml',
    'yaml'
])

export function resolveMonacoLanguage(language: string): string {
    const normalized = language.toLowerCase()
    const aliased = MONACO_LANGUAGE_ALIASES[normalized] ?? normalized
    return MONACO_SUPPORTED_LANGUAGES.has(aliased) ? aliased : 'plaintext'
}
