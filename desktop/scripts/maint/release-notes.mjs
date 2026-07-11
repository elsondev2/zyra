import { spawn } from 'node:child_process'

function runGit(rootDir, args) {
    return new Promise((resolve, reject) => {
        const child = spawn('git', args, {
            cwd: rootDir,
            stdio: ['ignore', 'pipe', 'pipe'],
            shell: process.platform === 'win32'
        })

        let stdout = ''
        let stderr = ''

        child.stdout?.on('data', (chunk) => {
            stdout += String(chunk)
        })

        child.stderr?.on('data', (chunk) => {
            stderr += String(chunk)
        })

        child.on('error', reject)
        child.on('exit', (code) => {
            if (code === 0) {
                resolve(stdout)
                return
            }

            reject(new Error(`git ${args.join(' ')} exited with code ${code ?? 'unknown'}${stderr ? `: ${stderr}` : ''}`))
        })
    })
}

async function refExists(rootDir, refName) {
    try {
        await runGit(rootDir, ['rev-parse', '--verify', '--quiet', refName])
        return true
    } catch {
        return false
    }
}

async function listReleaseTags(rootDir) {
    const stdout = await runGit(rootDir, [
        'tag',
        '--merged',
        'HEAD',
        '--sort=-creatordate',
        '--list',
        'v[0-9]*'
    ])

    return stdout
        .split(/\r?\n/)
        .map((tag) => tag.trim())
        .filter(Boolean)
}

async function getCommitRows(rootDir, range) {
    const stdout = await runGit(rootDir, [
        'log',
        '--no-merges',
        '--format=%H%x1f%h%x1f%s%x1e',
        range
    ])

    return stdout
        .split('\x1e')
        .map((row) => row.trim())
        .filter(Boolean)
        .map((row) => {
            const [sha, shortSha, subject] = row.split('\x1f')
            return {
                sha: sha || '',
                shortSha: shortSha || '',
                subject: subject || 'Untitled change'
            }
        })
}

function formatDisplayVersion(version) {
    const match = String(version).trim().match(/^(\d+)\.(\d+)\.(\d+)(?:-([a-z]+)\.\d+)?$/i)
    if (!match) return version

    const [, major, minor, patch, channel] = match
    return channel
        ? `v${major}.${minor}.${patch} ${channel.toLowerCase()}`
        : `v${major}.${minor}.${patch}`
}

function cleanSubject(subject) {
    return String(subject)
        .replace(/^\w+(?:\([^)]+\))?!?:\s*/i, '')
        .replace(/\s+/g, ' ')
        .trim()
}

function categorizeCommit(subject) {
    const raw = String(subject).toLowerCase()
    const cleaned = cleanSubject(raw)

    if (/^(fix|repair|restore|resolve|correct|prevent|handle)\b/.test(raw) || /\b(crash|bug|broken|error|fail|regression)\b/.test(cleaned)) {
        return 'Fixes'
    }

    if (/\b(update|updater|release|installer|download|latest\.yml|blockmap|version|publish)\b/.test(cleaned)) {
        return 'Updates and release'
    }

    if (/\b(ui|toast|layout|header|button|modal|screen|renderer|style|tab|file browse|preview|git page|workflow)\b/.test(cleaned)) {
        return 'UI and workflow'
    }

    if (/^(doc|docs|readme)\b/.test(raw) || /\b(documentation|docs)\b/.test(cleaned)) {
        return 'Docs'
    }

    if (/^(chore|maint|build|test|typecheck|refactor|perf|cleanup)\b/.test(raw) || /\b(performance|cleanup|typecheck|build)\b/.test(cleaned)) {
        return 'Maintenance'
    }

    return 'Improvements'
}

function groupCommits(commits) {
    const categoryOrder = [
        'Fixes',
        'Updates and release',
        'UI and workflow',
        'Improvements',
        'Docs',
        'Maintenance'
    ]
    const groups = new Map(categoryOrder.map((category) => [category, []]))
    const seen = new Set()

    for (const commit of commits) {
        const subject = cleanSubject(commit.subject)
        const key = subject.toLowerCase()
        if (seen.has(key)) continue
        seen.add(key)

        const category = categorizeCommit(commit.subject)
        groups.get(category)?.push({
            ...commit,
            subject
        })
    }

    return categoryOrder
        .map((category) => [category, groups.get(category) || []])
        .filter(([, items]) => items.length > 0)
}

export async function buildReleaseNotes({
    rootDir,
    owner,
    repo,
    version,
    currentTag
}) {
    const currentRef = await refExists(rootDir, currentTag) ? currentTag : 'HEAD'
    const tags = await listReleaseTags(rootDir)
    const previousTag = tags.find((tag) => tag !== currentTag) || null
    const range = previousTag ? `${previousTag}..${currentRef}` : currentRef
    const commits = await getCommitRows(rootDir, range)
    const compareRight = currentRef === 'HEAD' ? 'HEAD' : currentTag
    const compareUrl = previousTag && owner && repo
        ? `https://github.com/${owner}/${repo}/compare/${previousTag}...${compareRight}`
        : null

    const lines = [
        `## Zyra ${formatDisplayVersion(version)}`,
        ''
    ]

    if (previousTag) {
        lines.push(`Compared with \`${previousTag}\`.`)
    } else {
        lines.push('Initial release notes for this release line.')
    }

    if (compareUrl) {
        lines.push('', `Full compare: ${compareUrl}`)
    }

    if (commits.length === 0) {
        lines.push('', '- No commit changes were found in this release range.')
        return {
            body: `${lines.join('\n')}\n`,
            previousTag,
            commitCount: 0
        }
    }

    for (const [category, items] of groupCommits(commits)) {
        lines.push('', `### ${category}`)
        for (const item of items) {
            lines.push(`- ${item.subject} (\`${item.shortSha}\`)`)
        }
    }

    return {
        body: `${lines.join('\n')}\n`,
        previousTag,
        commitCount: commits.length
    }
}
