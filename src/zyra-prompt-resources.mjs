import { open, readdir, lstat } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const RESOURCE_NAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const BUILT_IN_DESKTOP_COMMANDS = [
  { name: 'yolo', description: 'Switch this thread to full access locally.' },
  { name: 'safe', description: 'Switch this thread back to approval-required mode.' },
  { name: 'include', description: 'Add a file path to the composer context shelf.' },
]

export const ZYRA_PROMPT_RESOURCE_LIMITS = Object.freeze({
  maxSources: 24,
  maxDirectories: 192,
  maxFiles: 384,
  maxDepth: 8,
  maxFileBytes: 64 * 1024,
  maxCommands: 128,
  maxSkills: 256,
  maxDescriptionCharacters: 1_024,
  maxDiagnostics: 64,
})

function commandSources(project, options = {}) {
  const root = path.resolve(options.root ?? ROOT)
  const home = path.resolve(options.home ?? os.homedir())
  return [
    { dir: path.join(root, 'commands'), scope: 'built-in', kind: 'zyra' },
    { dir: path.join(home, '.zyra', 'commands'), scope: 'personal', kind: 'zyra' },
    ...(project ? [{ dir: path.join(project, '.zyra', 'commands'), scope: 'project', kind: 'zyra' }] : []),
  ]
}

async function pathIsDirectory(value) {
  try {
    return (await lstat(value)).isDirectory()
  } catch {
    return false
  }
}

async function findProjectAgentsSkillDirectories(project) {
  if (!project) return []
  const result = []
  let current = path.resolve(project)
  for (let depth = 0; depth < ZYRA_PROMPT_RESOURCE_LIMITS.maxSources; depth += 1) {
    result.push(path.join(current, '.agents', 'skills'))
    if (await pathIsDirectory(path.join(current, '.git'))) break
    const parent = path.dirname(current)
    if (parent === current) break
    current = parent
  }
  return result.reverse()
}

async function readProjectTrust(project) {
  if (!project) return false
  try {
    const { text, truncated } = await readBoundedText(path.join(project, '.zyra', 'preferences.json'), 16 * 1024)
    if (truncated) return false
    const parsed = JSON.parse(text)
    return Boolean(parsed && typeof parsed === 'object' && parsed.projectTrusted === true)
  } catch {
    return false
  }
}

/**
 * Ordered from broadest to most specific. Later entries win name collisions.
 * Standard project locations are included only after the project trust bit is set.
 */
export async function resolveZyraSkillSources(options = {}) {
  const root = path.resolve(options.root ?? ROOT)
  const home = path.resolve(options.home ?? os.homedir())
  const project = options.project ? path.resolve(options.project) : null
  const projectTrusted = options.projectTrusted ?? await readProjectTrust(project)
  const projectAgents = projectTrusted ? await findProjectAgentsSkillDirectories(project) : []
  const sources = [
    { dir: path.join(root, 'skills'), scope: 'built-in', loaderSource: 'builtin', allowRootMarkdown: true },
    { dir: path.join(home, '.pi', 'agent', 'skills'), scope: 'personal', loaderSource: 'user', allowRootMarkdown: true },
    { dir: path.join(home, '.agents', 'skills'), scope: 'personal', loaderSource: 'user', allowRootMarkdown: false },
    { dir: path.join(home, '.zyra', 'skills'), scope: 'personal', loaderSource: 'user', allowRootMarkdown: true },
    ...(projectTrusted && project ? [
      { dir: path.join(project, '.pi', 'skills'), scope: 'project', loaderSource: 'project', allowRootMarkdown: true },
      ...projectAgents.map((dir) => ({ dir, scope: 'project', loaderSource: 'project', allowRootMarkdown: false })),
    ] : []),
    ...(project ? [{ dir: path.join(project, '.zyra', 'skills'), scope: 'project', loaderSource: 'project', allowRootMarkdown: true }] : []),
  ]
  return sources.slice(-ZYRA_PROMPT_RESOURCE_LIMITS.maxSources)
}

function createBudget() {
  return { directories: 0, files: 0, stopped: false }
}

function addDiagnostic(diagnostics, type, message) {
  if (diagnostics.length >= ZYRA_PROMPT_RESOURCE_LIMITS.maxDiagnostics) return
  diagnostics.push({ type, message: String(message || 'Prompt resource warning').slice(0, 512) })
}

async function readBoundedText(file, maxBytes = ZYRA_PROMPT_RESOURCE_LIMITS.maxFileBytes) {
  const handle = await open(file, 'r')
  try {
    const buffer = Buffer.alloc(maxBytes + 1)
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0)
    return {
      text: buffer.subarray(0, Math.min(bytesRead, maxBytes)).toString('utf8'),
      truncated: bytesRead > maxBytes,
    }
  } finally {
    await handle.close()
  }
}

function unquote(value) {
  const text = String(value ?? '').trim()
  if (text.length >= 2 && text.startsWith('"') && text.endsWith('"')) {
    try {
      return JSON.parse(text)
    } catch {
      return text.slice(1, -1)
    }
  }
  if (text.length >= 2 && text.startsWith("'") && text.endsWith("'")) {
    return text.slice(1, -1).replaceAll("''", "'")
  }
  return text
}

function parseFrontmatter(text) {
  const lines = String(text).replace(/^\uFEFF/, '').split(/\r?\n/)
  if (lines[0]?.trim() !== '---') return { values: {}, malformed: false }
  const end = lines.findIndex((line, index) => index > 0 && line.trim() === '---')
  if (end < 0) return { values: {}, malformed: true }

  const values = {}
  for (let index = 1; index < end; index += 1) {
    const match = lines[index].match(/^([A-Za-z0-9_-]+):\s*(.*)$/)
    if (!match) continue
    const key = match[1]
    const rawValue = match[2].trim()
    if ((rawValue === '|' || rawValue === '>' || rawValue === '|-' || rawValue === '>-') && index + 1 < end) {
      const block = []
      while (index + 1 < end && /^\s+/.test(lines[index + 1])) {
        index += 1
        block.push(lines[index].trim())
      }
      values[key] = rawValue.startsWith('>') ? block.join(' ') : block.join('\n')
      continue
    }
    values[key] = unquote(rawValue)
  }
  return { values, malformed: false }
}

function validResourceName(value) {
  const name = String(value || '').trim()
  return name.length >= 1 && name.length <= 64 && RESOURCE_NAME_PATTERN.test(name) && !name.includes('--')
}

function extractCommandDescription(text) {
  const parsed = parseFrontmatter(text)
  const frontmatterDescription = String(parsed.values.description || '').trim()
  if (frontmatterDescription) return frontmatterDescription
  const lines = String(text).split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
  const inlineDescription = lines.find((line) => line.toLowerCase().startsWith('description:'))
  if (inlineDescription) return unquote(inlineDescription.slice('description:'.length).trim())
  const heading = lines.find((line) => line.startsWith('#'))
  if (heading) return heading.replace(/^#+\s*/, '').trim()
  return lines[0] || 'custom prompt'
}

function boundedDescription(value) {
  const normalized = String(value || '').replace(/\s+/gu, ' ').trim()
  return normalized.slice(0, ZYRA_PROMPT_RESOURCE_LIMITS.maxDescriptionCharacters)
}

async function safeEntries(dir, budget, diagnostics) {
  if (budget.stopped) return []
  if (budget.directories >= ZYRA_PROMPT_RESOURCE_LIMITS.maxDirectories) {
    budget.stopped = true
    addDiagnostic(diagnostics, 'limit', 'Prompt resource directory limit reached; remaining entries were skipped.')
    return []
  }
  budget.directories += 1
  try {
    return await readdir(dir, { withFileTypes: true })
  } catch (error) {
    if (error?.code !== 'ENOENT' && error?.code !== 'ENOTDIR') {
      addDiagnostic(diagnostics, 'warning', 'A prompt resource directory could not be read.')
    }
    return []
  }
}

async function loadCommandFile(file, name, scope, diagnostics) {
  if (!validResourceName(name)) {
    addDiagnostic(diagnostics, 'warning', `Invalid command name: ${name || '(missing)'}`)
    return null
  }
  try {
    const { text, truncated } = await readBoundedText(file)
    if (truncated) addDiagnostic(diagnostics, 'warning', `Command ${name} exceeded the metadata read limit.`)
    return {
      name,
      description: boundedDescription(extractCommandDescription(text)) || 'custom prompt',
      scope,
    }
  } catch {
    addDiagnostic(diagnostics, 'warning', `Command ${name} could not be read.`)
    return null
  }
}

async function loadSkillFile(file, scope, diagnostics) {
  try {
    const { text, truncated } = await readBoundedText(file)
    if (truncated) addDiagnostic(diagnostics, 'warning', 'A skill exceeded the metadata read limit.')
    const parsed = parseFrontmatter(text)
    if (parsed.malformed) {
      addDiagnostic(diagnostics, 'warning', 'A skill has malformed frontmatter.')
      return null
    }
    const name = String(parsed.values.name || path.basename(path.dirname(file))).trim()
    const description = String(parsed.values.description || '').trim()
    if (!validResourceName(name)) {
      addDiagnostic(diagnostics, 'warning', `Invalid skill name: ${name || '(missing)'}`)
      return null
    }
    if (!description) {
      addDiagnostic(diagnostics, 'warning', `Skill ${name} has no description.`)
      return null
    }
    if (description.length > ZYRA_PROMPT_RESOURCE_LIMITS.maxDescriptionCharacters) {
      addDiagnostic(diagnostics, 'warning', `Skill ${name} description is too long.`)
    }
    return {
      name,
      description: boundedDescription(description),
      scope,
      disableModelInvocation: parsed.values['disable-model-invocation'] === true
        || parsed.values['disable-model-invocation'] === 'true',
    }
  } catch {
    addDiagnostic(diagnostics, 'warning', 'A skill could not be read.')
    return null
  }
}

async function discoverSkills(source, budget, diagnostics) {
  const skills = []
  const visit = async (dir, depth, includeRootFiles) => {
    if (budget.stopped || depth > ZYRA_PROMPT_RESOURCE_LIMITS.maxDepth) {
      if (depth > ZYRA_PROMPT_RESOURCE_LIMITS.maxDepth) {
        addDiagnostic(diagnostics, 'limit', 'Prompt resource depth limit reached; nested entries were skipped.')
      }
      return
    }
    const entries = await safeEntries(dir, budget, diagnostics)
    const declared = entries.find((entry) => entry.name === 'SKILL.md' && entry.isFile())
    if (declared) {
      budget.files += 1
      const skill = await loadSkillFile(path.join(dir, declared.name), source.scope, diagnostics)
      if (skill) skills.push(skill)
      return
    }
    for (const entry of entries) {
      if (budget.files >= ZYRA_PROMPT_RESOURCE_LIMITS.maxFiles) {
        budget.stopped = true
        addDiagnostic(diagnostics, 'limit', 'Prompt resource file limit reached; remaining entries were skipped.')
        return
      }
      if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.isSymbolicLink()) continue
      const fullPath = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        await visit(fullPath, depth + 1, false)
      } else if (entry.isFile() && includeRootFiles && entry.name.toLowerCase().endsWith('.md')) {
        budget.files += 1
        const skill = await loadSkillFile(fullPath, source.scope, diagnostics)
        if (skill) skills.push(skill)
      }
      if (skills.length >= ZYRA_PROMPT_RESOURCE_LIMITS.maxSkills) return
    }
  }
  await visit(source.dir, 0, source.allowRootMarkdown)
  return skills
}

export async function listZyraPromptResourceManifest(options = {}) {
  const project = options.project ? path.resolve(options.project) : null
  const diagnostics = []
  const commandsByName = new Map(BUILT_IN_DESKTOP_COMMANDS.map((command) => [command.name, {
    ...command,
    scope: 'built-in',
  }]))
  const reservedCommandNames = new Set(commandsByName.keys())
  const commandBudget = createBudget()

  for (const source of commandSources(project, options)) {
    const entries = await safeEntries(source.dir, commandBudget, diagnostics)
    for (const entry of entries) {
      if (commandBudget.files >= ZYRA_PROMPT_RESOURCE_LIMITS.maxFiles) break
      if (!entry.isFile() || entry.isSymbolicLink() || !entry.name.toLowerCase().endsWith('.md')) continue
      commandBudget.files += 1
      const name = path.basename(entry.name, '.md').toLowerCase()
      const command = await loadCommandFile(path.join(source.dir, entry.name), name, source.scope, diagnostics)
      if (!command) continue
      if (reservedCommandNames.has(name)) {
        addDiagnostic(diagnostics, 'collision', `Command ${name} cannot override the built-in Desktop command.`)
        continue
      }
      const existing = commandsByName.get(name)
      if (!existing && commandsByName.size >= ZYRA_PROMPT_RESOURCE_LIMITS.maxCommands) continue
      if (existing) addDiagnostic(diagnostics, 'collision', `Command ${name} from ${command.scope} overrides ${existing.scope}.`)
      commandsByName.set(name, command)
    }
  }

  const skillsByName = new Map()
  const skillBudget = createBudget()
  for (const source of await resolveZyraSkillSources({ ...options, project })) {
    const skills = await discoverSkills(source, skillBudget, diagnostics)
    for (const skill of skills) {
      const existing = skillsByName.get(skill.name)
      if (existing) addDiagnostic(diagnostics, 'collision', `Skill ${skill.name} from ${skill.scope} overrides ${existing.scope}.`)
      skillsByName.set(skill.name, skill)
      if (skillsByName.size >= ZYRA_PROMPT_RESOURCE_LIMITS.maxSkills) break
    }
    if (skillsByName.size >= ZYRA_PROMPT_RESOURCE_LIMITS.maxSkills || skillBudget.stopped) break
  }

  return {
    commands: [...commandsByName.values()].sort((left, right) => left.name.localeCompare(right.name)),
    skills: [...skillsByName.values()].sort((left, right) => left.name.localeCompare(right.name)),
    diagnostics,
  }
}
