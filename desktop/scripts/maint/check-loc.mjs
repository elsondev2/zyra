import { readdirSync, readFileSync, statSync } from 'fs'
import { extname, join, relative } from 'path'

// ANSI color codes
const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    dim: '\x1b[2m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m',
    gray: '\x1b[90m'
}

const ROOT = process.cwd()
const SRC_DIR = join(ROOT, 'src')
const WARN_LIMIT = 300
const HARD_LIMIT = 500
const INCLUDED_EXTENSIONS = new Set(['.ts', '.tsx'])
const EXCLUDED_DIRS = new Set(['node_modules', 'out', 'dist', '.git'])
const strictMode = process.argv.includes('--strict')
const LOC_EXEMPTIONS = [
    {
        id: 'assistant-in-progress',
        reason: 'Assistant implementation is still being actively built out.',
        prefixes: [
            'src/main/assistant/',
            'src/shared/assistant/',
            'src/renderer/src/pages/assistant/',
            'src/renderer/src/lib/assistant/'
        ],
        exactPaths: [
            'src/main/ipc/handlers/assistant-handlers.ts',
            'src/preload/adapters/assistant-adapter.ts',
            'src/renderer/src/pages/Assistant.tsx'
        ]
    }
]

function walk(dir, bucket) {
    const entries = readdirSync(dir, { withFileTypes: true })
    for (const entry of entries) {
        if (entry.isDirectory()) {
            if (EXCLUDED_DIRS.has(entry.name)) continue
            walk(join(dir, entry.name), bucket)
            continue
        }

        const fullPath = join(dir, entry.name)
        const extension = extname(fullPath).toLowerCase()
        if (!INCLUDED_EXTENSIONS.has(extension)) continue

        const lineCount = readFileSync(fullPath, 'utf8').split(/\r?\n/).length
        bucket.push({
            path: relative(ROOT, fullPath).replace(/\\/g, '/'),
            lineCount
        })
    }
}

function printTable(rows) {
    for (const row of rows) {
        const lineText = String(row.lineCount).padStart(4, ' ')
        const color = row.lineCount > 800 ? colors.red : row.lineCount > 650 ? colors.yellow : colors.cyan
        console.log(`${color}${lineText}${colors.reset}  ${colors.dim}${row.path}${colors.reset}`)
    }
}

function getLocExemption(filePath) {
    for (const exemption of LOC_EXEMPTIONS) {
        if (exemption.exactPaths?.includes(filePath)) return exemption
        if (exemption.prefixes?.some((prefix) => filePath.startsWith(prefix))) return exemption
    }

    return null
}

const allFiles = []
walk(SRC_DIR, allFiles)

allFiles.sort((a, b) => b.lineCount - a.lineCount)
const classifiedFiles = allFiles.map((item) => ({
    ...item,
    exemption: getLocExemption(item.path)
}))
const trackedFiles = classifiedFiles.filter((item) => !item.exemption)
const exemptFiles = classifiedFiles.filter((item) => item.exemption)
const hardLimitFiles = trackedFiles.filter((item) => item.lineCount > HARD_LIMIT)
const exemptHardLimitFiles = exemptFiles.filter((item) => item.lineCount > HARD_LIMIT)

console.log(`${colors.bright}${colors.blue}LOC Policy:${colors.reset} showing files above ${colors.cyan}${HARD_LIMIT}${colors.reset} lines`)
console.log(`${colors.gray}Scanned ${allFiles.length} files under src/${colors.reset}`)
if (exemptFiles.length > 0) {
    console.log(`${colors.gray}Exempt files: ${exemptFiles.length}${colors.reset}`)
}
console.log('')

if (hardLimitFiles.length === 0) {
    console.log(`${colors.green}✓ No files above 500 lines.${colors.reset}`)
} else {
    console.log(`${colors.bright}${colors.yellow}Files above ${HARD_LIMIT} lines:${colors.reset}`)
    printTable(hardLimitFiles)
}

if (exemptFiles.length > 0) {
    console.log('')
    console.log(`${colors.bright}Exempt paths${colors.reset} ${colors.gray}(reported, not enforced):${colors.reset}`)
    for (const exemption of LOC_EXEMPTIONS) {
        const matches = exemptFiles.filter((item) => item.exemption?.id === exemption.id)
        if (matches.length === 0) continue
        const hardCount = matches.filter((item) => item.lineCount > HARD_LIMIT).length
        console.log(`${colors.blue}- ${exemption.id}:${colors.reset} ${colors.gray}${exemption.reason}${colors.reset}`)
        console.log(`  ${colors.gray}matched ${matches.length} files, ${hardCount} above ${HARD_LIMIT}${colors.reset}`)
    }
}

if (exemptHardLimitFiles.length > 0) {
    console.log('')
    console.log(`${colors.bright}${colors.yellow}Exempt files above ${HARD_LIMIT} lines:${colors.reset}`)
    printTable(exemptHardLimitFiles)
}

if (strictMode && hardLimitFiles.length > 0) {
    console.error('')
    console.error(`${colors.red}${colors.bright}✗ Strict mode failed:${colors.reset} ${colors.red}${hardLimitFiles.length} files exceed hard limit.${colors.reset}`)
    process.exit(1)
}
