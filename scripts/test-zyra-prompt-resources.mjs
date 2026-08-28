import assert from 'node:assert/strict'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  expandZyraPromptResource,
  listZyraPromptResources,
} from '../src/zyra-sdk.mjs'
import {
  listZyraPromptResourceManifest,
  resolveZyraSkillSources,
  ZYRA_PROMPT_RESOURCE_LIMITS,
} from '../src/zyra-prompt-resources.mjs'

const fixture = await mkdtemp(path.join(os.tmpdir(), 'zyra-prompt-resources-'))
const root = path.join(fixture, 'install')
const home = path.join(fixture, 'home')
const project = path.join(fixture, 'workspace')

async function writeSkill(directory, name, description, body = 'Run the narrowest relevant checks.') {
  await mkdir(directory, { recursive: true })
  await writeFile(path.join(directory, 'SKILL.md'), [
    '---',
    `name: ${name}`,
    `description: ${description}`,
    '---',
    '',
    `# ${name}`,
    '',
    body,
  ].join('\n'))
}

try {
  await Promise.all([
    mkdir(path.join(root, 'commands'), { recursive: true }),
    mkdir(path.join(project, '.zyra', 'commands'), { recursive: true }),
    mkdir(path.join(home, '.zyra', 'commands'), { recursive: true }),
    mkdir(path.join(project, '.git'), { recursive: true }),
  ])
  await writeFile(path.join(root, 'commands', 'review.md'), 'description: Built-in review\n\nReview: {{args}}')
  await writeFile(path.join(home, '.zyra', 'commands', 'review.md'), 'description: Personal review\n\nPersonal: {{args}}')
  await writeFile(path.join(project, '.zyra', 'commands', 'review.md'), 'description: Project review\n\nProject: {{args}}')
  await writeFile(path.join(project, '.zyra', 'commands', 'yolo.md'), 'description: Unsafe override\n\nDo something else')
  await writeFile(path.join(project, '.zyra', 'commands', 'Bad Name.md'), 'description: Invalid command')

  await writeSkill(path.join(home, '.pi', 'agent', 'skills', 'standard-user'), 'standard-user', 'A standard Pi user skill.')
  await writeSkill(path.join(home, '.agents', 'skills', 'grouped-user'), 'grouped-user', 'A grouped Agent Skills user skill.')
  await mkdir(path.join(home, '.agents', 'skills'), { recursive: true })
  await writeFile(path.join(home, '.agents', 'skills', 'ignored-root.md'), [
    '---', 'name: ignored-root', 'description: Root Markdown is ignored in .agents.', '---'
  ].join('\n'))
  await writeSkill(path.join(home, '.zyra', 'skills', 'release-check'), 'release-check', 'Personal release checks.')
  await writeSkill(path.join(project, '.pi', 'skills', 'trusted-pi-project'), 'trusted-pi-project', 'A trusted Pi project skill.')
  await writeSkill(path.join(project, '.agents', 'skills', 'trusted-agent-project'), 'trusted-agent-project', 'A trusted Agent Skills project skill.')
  await writeSkill(path.join(project, '.zyra', 'skills', 'release-check'), 'release-check', 'Project release checks.', 'Project instructions win.')
  await writeSkill(path.join(project, '.zyra', 'skills', 'invalid'), 'Bad_Name', 'Invalid names never enter the menu.')

  const malformedDir = path.join(project, '.zyra', 'skills', 'malformed')
  await mkdir(malformedDir, { recursive: true })
  await writeFile(path.join(malformedDir, 'SKILL.md'), '---\nname: malformed\ndescription: missing terminator')

  await writeSkill(
    path.join(project, '.zyra', 'skills', 'oversized'),
    'oversized',
    'x'.repeat(ZYRA_PROMPT_RESOURCE_LIMITS.maxDescriptionCharacters + 20)
  )

  let deepDir = path.join(project, '.zyra', 'skills')
  for (let index = 0; index < ZYRA_PROMPT_RESOURCE_LIMITS.maxDepth + 2; index += 1) deepDir = path.join(deepDir, `level-${index}`)
  await writeSkill(deepDir, 'too-deep', 'This skill must be skipped by the depth bound.')

  const extraCommands = Array.from({ length: ZYRA_PROMPT_RESOURCE_LIMITS.maxCommands + 20 }, (_, index) => index)
  await Promise.all(extraCommands.map((index) => writeFile(
    path.join(project, '.zyra', 'commands', `fixture-${String(index).padStart(3, '0')}.md`),
    `description: Fixture command ${index}`
  )))

  const untrusted = await listZyraPromptResourceManifest({ project, root, home, projectTrusted: false })
  assert.equal(untrusted.skills.some((skill) => skill.name === 'trusted-pi-project'), false)
  assert.equal(untrusted.skills.some((skill) => skill.name === 'trusted-agent-project'), false)
  assert.equal(untrusted.skills.some((skill) => skill.name === 'release-check'), true, 'the existing .zyra project skill path remains supported')

  const resources = await listZyraPromptResourceManifest({ project, root, home, projectTrusted: true })
  assert.deepEqual(
    resources.commands.find((command) => command.name === 'review'),
    { name: 'review', description: 'Project review', scope: 'project' },
    'project commands override broader custom command scopes'
  )
  assert.deepEqual(
    resources.commands.find((command) => command.name === 'yolo'),
    { name: 'yolo', description: 'Switch this thread to full access locally.', scope: 'built-in' },
    'custom command files cannot replace trusted Desktop built-ins'
  )
  assert.equal(resources.commands.some((command) => command.name === 'bad name'), false)
  assert.ok(resources.commands.length <= ZYRA_PROMPT_RESOURCE_LIMITS.maxCommands)
  for (const builtIn of ['yolo', 'safe', 'include']) {
    assert.equal(resources.commands.some((command) => command.name === builtIn), true)
  }

  for (const skillName of ['standard-user', 'grouped-user', 'trusted-pi-project', 'trusted-agent-project', 'release-check']) {
    assert.equal(resources.skills.some((skill) => skill.name === skillName), true, `${skillName} is discovered from a supported Agent Skills location`)
  }
  assert.equal(resources.skills.some((skill) => skill.name === 'ignored-root'), false)
  assert.equal(resources.skills.some((skill) => skill.name === 'Bad_Name'), false)
  assert.equal(resources.skills.some((skill) => skill.name === 'malformed'), false)
  assert.equal(resources.skills.some((skill) => skill.name === 'too-deep'), false)
  assert.equal(resources.skills.find((skill) => skill.name === 'release-check')?.description, 'Project release checks.')
  assert.equal(resources.skills.find((skill) => skill.name === 'oversized')?.description.length, ZYRA_PROMPT_RESOURCE_LIMITS.maxDescriptionCharacters)
  assert.ok(resources.diagnostics.some((entry) => entry.type === 'collision'))
  assert.ok(resources.diagnostics.some((entry) => entry.type === 'limit'))
  assert.ok(resources.diagnostics.length <= ZYRA_PROMPT_RESOURCE_LIMITS.maxDiagnostics)

  const sourcePaths = (await resolveZyraSkillSources({ project, root, home, projectTrusted: true })).map((source) => source.dir)
  for (const expected of [
    path.join(home, '.pi', 'agent', 'skills'),
    path.join(home, '.agents', 'skills'),
    path.join(project, '.pi', 'skills'),
    path.join(project, '.agents', 'skills'),
    path.join(home, '.zyra', 'skills'),
    path.join(project, '.zyra', 'skills'),
  ]) assert.equal(sourcePaths.includes(expected), true, `${expected} is part of the explicit discovery contract`)

  const runtime = {
    project,
    resourceLoader: {
      getSkills: () => ({
        skills: [{
          name: 'release-check',
          description: 'Project release checks.',
          filePath: path.join(project, '.zyra', 'skills', 'release-check', 'SKILL.md'),
          baseDir: path.join(project, '.zyra', 'skills', 'release-check'),
          sourceInfo: {},
          disableModelInvocation: false,
          zyraScope: 'project',
        }],
        diagnostics: [],
      }),
    },
  }
  assert.equal(
    expandZyraPromptResource(runtime, '/review the staged files'),
    'description: Project review\n\nProject: the staged files'
  )
  const skillPrompt = expandZyraPromptResource(runtime, '/skill:release-check package the app')
  assert.match(skillPrompt, /# release-check[\s\S]*Project instructions win\.[\s\S]*User: package the app/)

  const bridgeSource = readFileSync(new URL('../src/zyra-ui-bridge.mjs', import.meta.url), 'utf8')
  const sdkSource = readFileSync(new URL('../src/zyra-sdk.mjs', import.meta.url), 'utf8')
  const desktopRuntimeSource = readFileSync(new URL('../desktop/src/main/assistant/zyra-pi-runtime.ts', import.meta.url), 'utf8')
  assert.match(bridgeSource, /handlePrompt[\s\S]*sdk\.runZyraPrompt\(runtime, payload\.prompt/u, 'the app-server bridge sends Desktop prompts through Zyra prompt expansion')
  assert.match(sdkSource, /runZyraPrompt[\s\S]{0,180}expandZyraPromptResource\(runtime, prompt\)/u, 'Pi-backed prompts expand custom commands and explicit skills before provider dispatch')
  assert.match(desktopRuntimeSource, /async sendPrompt\([\s\S]*worker\.request\('prompt'/u, 'Desktop direct and attached worker routes use the same prompt bridge')
  assert.match(sdkSource, /reload: async \(\) => \{[\s\S]*options\.loadSkills/u, 'soft resource reload refreshes the skill manifest instead of retaining startup state')

  // The public SDK wrapper remains async and uses the same bounded manifest.
  const sdkManifest = await listZyraPromptResources({ project, projectTrusted: true })
  assert.ok(Array.isArray(sdkManifest.commands) && Array.isArray(sdkManifest.skills))

  console.log('Zyra prompt resources: ok')
} finally {
  await rm(fixture, { recursive: true, force: true })
}
