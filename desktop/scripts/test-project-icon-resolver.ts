import assert from 'node:assert/strict'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { resolveProjectIconPath } from '../src/main/services/project-icon-resolver'

const fixtureRoot = await mkdtemp(join(tmpdir(), 'zyra-project-icons-'))
const projectRoot = join(fixtureRoot, 'project')
const outsideIcon = join(fixtureRoot, 'outside.png')

try {
    await mkdir(join(projectRoot, 'public'), { recursive: true })
    await writeFile(join(projectRoot, 'public', 'favicon.svg'), '<svg xmlns="http://www.w3.org/2000/svg"/>')
    await writeFile(outsideIcon, 'outside')

    const detected = await resolveProjectIconPath(projectRoot, ['public'], {})
    assert.equal(detected, join(projectRoot, 'public', 'favicon.svg'), 'bounded common favicon detection should resolve inside the project')

    await rm(join(projectRoot, 'public', 'favicon.svg'))
    const escaped = await resolveProjectIconPath(projectRoot, ['package.json'], { build: { icon: outsideIcon } })
    assert.equal(escaped, null, 'package metadata must not make automatic icon discovery escape the project root')

    console.log('Project icon resolver: ok')
} finally {
    await rm(fixtureRoot, { recursive: true, force: true })
}
