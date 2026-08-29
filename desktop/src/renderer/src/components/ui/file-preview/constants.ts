export const MARKDOWN_EXTENSIONS = new Set(['md', 'markdown', 'mdown', 'mdx'])
export const HTML_EXTENSIONS = new Set(['html', 'htm'])
export const PDF_EXTENSIONS = new Set(['pdf'])
export const DOCX_EXTENSIONS = new Set(['docx'])
export const XLSX_EXTENSIONS = new Set(['xlsx'])
export const PPTX_EXTENSIONS = new Set(['pptx'])
export const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'ico', 'bmp', 'avif'])
export const VIDEO_EXTENSIONS = new Set(['mp4', 'webm', 'ogg', 'mov', 'avi', 'mkv', 'm4v'])
export const AUDIO_EXTENSIONS = new Set(['mp3', 'wav', 'm4a', 'aac', 'flac', 'oga', 'opus'])
export const JSON_EXTENSIONS = new Set(['json', 'jsonc', 'json5'])
export const CSV_EXTENSIONS = new Set(['csv', 'tsv'])
export const TEXT_EXTENSIONS = new Set([
    'txt', 'log', 'ini', 'conf', 'cfg', 'config', 'properties', 'prefs', 'env', 'lock',
    'diff', 'patch', 'nfo', 'out', 'err', 'pem', 'crt', 'cer', 'pub', 'key', 'tex', 'rtf',
    'ics', 'vcf', 'srt', 'vtt', 'http', 'rest'
])

export const CODE_LANGUAGE_BY_EXTENSION: Record<string, string> = {
    js: 'javascript',
    jsx: 'jsx',
    ts: 'typescript',
    tsx: 'tsx',
    mjs: 'javascript',
    cjs: 'javascript',
    jsonl: 'json',
    ndjson: 'json',
    py: 'python',
    rb: 'ruby',
    java: 'java',
    kt: 'kotlin',
    kts: 'kotlin',
    c: 'c',
    h: 'c',
    cpp: 'cpp',
    cxx: 'cpp',
    hpp: 'cpp',
    cs: 'csharp',
    go: 'go',
    rs: 'rust',
    php: 'php',
    swift: 'swift',
    dart: 'dart',
    scala: 'scala',
    groovy: 'groovy',
    lua: 'plaintext',
    r: 'plaintext',
    pl: 'plaintext',
    pm: 'plaintext',
    clj: 'plaintext',
    cljs: 'plaintext',
    ex: 'plaintext',
    exs: 'plaintext',
    erl: 'plaintext',
    fs: 'plaintext',
    fsx: 'plaintext',
    vb: 'plaintext',
    vbs: 'plaintext',
    asm: 'plaintext',
    s: 'plaintext',
    sol: 'plaintext',
    proto: 'plaintext',
    graphql: 'plaintext',
    gql: 'plaintext',
    tf: 'plaintext',
    tfvars: 'plaintext',
    hcl: 'plaintext',
    nix: 'plaintext',
    cmake: 'plaintext',
    hbs: 'html',
    pug: 'html',
    coffee: 'javascript',
    sql: 'sql',
    sh: 'bash',
    bash: 'bash',
    zsh: 'bash',
    ps1: 'powershell',
    bat: 'batch',
    cmd: 'batch',
    yml: 'yaml',
    yaml: 'yaml',
    toml: 'toml',
    xml: 'xml',
    css: 'css',
    scss: 'scss',
    less: 'less',
    html: 'html',
    vue: 'jsx',
    svelte: 'svelte',
    dockerfile: 'docker',
    gradle: 'groovy',
    makefile: 'makefile'
}

export const CODE_LANGUAGE_BY_FILENAME: Record<string, string> = {
    dockerfile: 'docker',
    makefile: 'makefile',
    '.gitignore': 'gitignore',
    '.gitattributes': 'git',
    '.editorconfig': 'ini',
    '.npmrc': 'ini',
    '.eslintrc': 'json',
    '.prettierrc': 'json',
    '.dockerignore': 'gitignore',
    '.npmignore': 'gitignore',
    '.eslintignore': 'gitignore',
    '.prettierignore': 'gitignore',
    gemfile: 'ruby',
    rakefile: 'ruby',
    vagrantfile: 'ruby',
    brewfile: 'ruby',
    jenkinsfile: 'groovy',
    procfile: 'plaintext',
    'cmakelists.txt': 'plaintext'
}

export const MAX_CSV_ROWS = 500
export const COLOR_SCAN_CHAR_LIMIT = 250_000
export const CODE_BLOCK_BG = '#0f172a'
export const HIGHLIGHT_MAX_CHARS = 180_000
export const HIGHLIGHT_MAX_LINES = 4_000
