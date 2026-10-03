import { listRemotes } from '../inspectors/git'
import { parseGitHubRemoteRef } from './github-remote'
import { runGh } from './github-pull-request-gh'
import type { DevScopeGitHubLocalMatch } from '../../shared/contracts/devscope-project-contracts'

export function matchGitHubRemote(
    path: string,
    remotes: Array<{ name: string; fetchUrl: string; pushUrl: string }>,
    available: ReadonlySet<string>
): DevScopeGitHubLocalMatch | null {
    const preferred = [...remotes].sort((left, right) => Number(right.name === 'origin') - Number(left.name === 'origin'))
    for (const remote of preferred) {
        const ref = parseGitHubRemoteRef(remote.fetchUrl || remote.pushUrl)
        if (ref && available.has(ref.fullName.toLowerCase())) return { path, fullName: ref.fullName }
    }
    return null
}

export async function discoverLocalGitHubProjects(paths: string[]): Promise<{ matches: DevScopeGitHubLocalMatch[]; repositoryCount: number }> {
    const uniquePaths = [...new Set(paths.map(path => String(path || '').trim()).filter(Boolean))].slice(0, 200)
    const response = await runGh(process.cwd(), [
        'api', '--paginate',
        'user/repos?affiliation=owner,collaborator,organization_member&per_page=100',
        '--jq', '.[].full_name'
    ])
    const available = new Set(response.stdout.split(/\r?\n/).map(name => name.trim().toLowerCase()).filter(Boolean))
    const matches: DevScopeGitHubLocalMatch[] = []
    for (let index = 0; index < uniquePaths.length; index += 4) {
        const batch = await Promise.all(uniquePaths.slice(index, index + 4).map(async path => {
            try { return matchGitHubRemote(path, await listRemotes(path), available) }
            catch { return null }
        }))
        matches.push(...batch.filter((match): match is DevScopeGitHubLocalMatch => match !== null))
    }
    return { matches, repositoryCount: available.size }
}
