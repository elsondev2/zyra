import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import os from 'node:os'
import path from 'node:path'

export const ZYRA_SKILL_SOURCE_DEFINITIONS = Object.freeze([
  Object.freeze({
    id: 'zyra',
    label: 'Zyra',
    description: 'Skills created for Zyra.',
    personalSegments: ['.zyra', 'skills'],
    projectSegments: ['.zyra', 'skills'],
    allowRootMarkdown: true,
  }),
  Object.freeze({
    id: 'codex',
    label: 'Codex',
    description: 'Compatible skills from Codex.',
    personalSegments: ['.codex', 'skills'],
    projectSegments: ['.codex', 'skills'],
    allowRootMarkdown: false,
  }),
  Object.freeze({
    id: 'claude',
    label: 'Claude Code',
    description: 'Compatible skills from Claude Code.',
    personalSegments: ['.claude', 'skills'],
    projectSegments: ['.claude', 'skills'],
    allowRootMarkdown: false,
  }),
  Object.freeze({
    id: 'agents',
    label: 'Shared agents',
    description: 'Skills shared through the Agent Skills folder.',
    personalSegments: ['.agents', 'skills'],
    projectSegments: ['.agents', 'skills'],
    allowRootMarkdown: false,
  }),
  Object.freeze({
    id: 'pi',
    label: 'Pi',
    description: 'Compatible skills from Pi.',
    personalSegments: ['.pi', 'agent', 'skills'],
    projectSegments: ['.pi', 'skills'],
    allowRootMarkdown: true,
  }),
])

export const DEFAULT_ZYRA_SKILL_SOURCE_SETTINGS = Object.freeze({
  version: 1,
  enabledSourceIds: Object.freeze(['zyra', 'agents', 'pi']),
  priority: Object.freeze(['zyra', 'codex', 'claude', 'agents', 'pi']),
  preferredSourceBySkill: Object.freeze({}),
  customSources: Object.freeze([]),
})

const SKILL_NAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const MAX_SETTINGS_BYTES = 64 * 1024
const MAX_CUSTOM_SOURCES = 10
const MAX_SKILL_OVERRIDES = 256

function normalizePathKey(value) {
  const resolved = path.resolve(value)
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved
}

function customSourceId(value) {
  return `custom-${createHash('sha256').update(normalizePathKey(value)).digest('hex').slice(0, 12)}`
}

function normalizeCustomSources(value) {
  if (!Array.isArray(value)) return []
  const seenPaths = new Set()
  const result = []
  for (const candidate of value) {
    if (!candidate || typeof candidate !== 'object') continue
    const rawPath = String(candidate.path || '').trim()
    if (!rawPath || !path.isAbsolute(rawPath)) continue
    const resolvedPath = path.resolve(rawPath)
    const pathKey = normalizePathKey(resolvedPath)
    if (seenPaths.has(pathKey)) continue
    seenPaths.add(pathKey)
    const fallbackLabel = path.basename(resolvedPath) || 'Skill folder'
    const label = String(candidate.label || fallbackLabel).trim().slice(0, 64) || fallbackLabel
    result.push({
      id: customSourceId(resolvedPath),
      label,
      path: resolvedPath,
      enableOnAdd: candidate.enableOnAdd === true,
    })
    if (result.length >= MAX_CUSTOM_SOURCES) break
  }
  return result
}

export function normalizeZyraSkillSourceSettings(value = {}) {
  const candidate = value && typeof value === 'object' ? value : {}
  const customSources = normalizeCustomSources(candidate.customSources)
  const validIds = new Set([
    ...ZYRA_SKILL_SOURCE_DEFINITIONS.map((source) => source.id),
    ...customSources.map((source) => source.id),
  ])

  const requestedPriority = Array.isArray(candidate.priority) ? candidate.priority : []
  const priority = []
  for (const id of requestedPriority) {
    if (typeof id !== 'string' || !validIds.has(id) || priority.includes(id)) continue
    priority.push(id)
  }
  for (const id of DEFAULT_ZYRA_SKILL_SOURCE_SETTINGS.priority) {
    if (validIds.has(id) && !priority.includes(id)) priority.push(id)
  }
  for (const source of customSources) {
    if (!priority.includes(source.id)) priority.unshift(source.id)
  }

  const requestedEnabled = Array.isArray(candidate.enabledSourceIds)
    ? candidate.enabledSourceIds
    : DEFAULT_ZYRA_SKILL_SOURCE_SETTINGS.enabledSourceIds
  const enabledSourceIds = []
  for (const id of requestedEnabled) {
    if (typeof id !== 'string' || !validIds.has(id) || enabledSourceIds.includes(id)) continue
    enabledSourceIds.push(id)
  }
  for (const source of customSources) {
    if (source.enableOnAdd && !enabledSourceIds.includes(source.id)) enabledSourceIds.push(source.id)
  }

  const preferredSourceBySkill = {}
  let preferredSourceCount = 0
  if (candidate.preferredSourceBySkill && typeof candidate.preferredSourceBySkill === 'object') {
    for (const [skillName, sourceId] of Object.entries(candidate.preferredSourceBySkill)) {
      if (preferredSourceCount >= MAX_SKILL_OVERRIDES) break
      if (!SKILL_NAME_PATTERN.test(skillName) || typeof sourceId !== 'string' || !validIds.has(sourceId)) continue
      preferredSourceBySkill[skillName] = sourceId
      preferredSourceCount += 1
    }
  }

  return {
    version: 1,
    enabledSourceIds,
    priority,
    preferredSourceBySkill,
    customSources: customSources.map(({ enableOnAdd: _enableOnAdd, ...source }) => source),
  }
}

export function zyraSkillSourceSettingsPath(options = {}) {
  const home = path.resolve(options.home ?? os.homedir())
  return path.join(home, '.zyra', 'skill-sources.json')
}

export async function readZyraSkillSourceSettings(options = {}) {
  try {
    const file = zyraSkillSourceSettingsPath(options)
    const text = await readFile(file, 'utf8')
    if (Buffer.byteLength(text, 'utf8') > MAX_SETTINGS_BYTES) return normalizeZyraSkillSourceSettings()
    return normalizeZyraSkillSourceSettings(JSON.parse(text))
  } catch {
    return normalizeZyraSkillSourceSettings()
  }
}

export async function writeZyraSkillSourceSettings(value, options = {}) {
  const settings = normalizeZyraSkillSourceSettings(value)
  const file = zyraSkillSourceSettingsPath(options)
  const directory = path.dirname(file)
  const temporary = `${file}.${process.pid}.${Date.now()}.tmp`
  await mkdir(directory, { recursive: true })
  await writeFile(temporary, `${JSON.stringify(settings, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 })
  try {
    await rename(temporary, file)
  } catch {
    await writeFile(file, `${JSON.stringify(settings, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 })
    await rm(temporary, { force: true }).catch(() => undefined)
  }
  return settings
}
