#!/usr/bin/env node
import { spawn, execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

const configPath = path.resolve(requiredArg('--config'))
const agentKey = requiredArg('--agent')
const config = JSON.parse(readFileSync(configPath, 'utf8'))
const agent = config.agents?.[agentKey]
if (!agent || !['fleet', 'control'].includes(agentKey)) {
  throw new Error(`Unknown builder agent: ${agentKey}`)
}

const maxAttempts = Math.max(1, Number(config.maxBuilderAttempts || 3))
const coordinator = await waitForCoordinator(config.coordinator.serverFile, 120_000)
const signalContext = {
  url: `http://${coordinator.host}:${coordinator.port}/signal`,
  token: config.coordinator.token,
  agent: agentKey,
}

console.log(`\nZyra autonomous builder: ${agent.label}`)
console.log(`Run: ${config.runId}`)
console.log(`Branch: ${agent.branch}`)
console.log(`Worktree: ${agent.worktree}`)
console.log(`Model: ${config.model} · ${config.thinking}\n`)

await sendSignal(signalContext, 'started', {
  branch: agent.branch,
  worktree: agent.worktree,
  attempt: 0,
})

let lastValidation = null
for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
  console.log(`\n=== ${agent.label}: autonomous attempt ${attempt}/${maxAttempts} ===\n`)
  await sendSignal(signalContext, 'heartbeat', { attempt, message: 'launching Zyra' })

  const prompt = buildPrompt(config, agent, agentKey, attempt, lastValidation)
  const exitCode = await runZyra(config, agent, prompt, attempt, signalContext)
  lastValidation = validateBuilder(config, agent, exitCode)

  if (lastValidation.ok) {
    await sendSignal(signalContext, 'done', {
      attempt,
      branch: agent.branch,
      commit: lastValidation.commit,
      handoffFile: agent.handoffFile,
      message: 'Committed handoff validated.',
    })
    console.log(`\n${agent.label}: READY_FOR_MERGE at ${lastValidation.commit}\n`)
    process.exit(0)
  }

  console.error(`\nAttempt ${attempt} did not produce a merge-ready branch:`)
  for (const reason of lastValidation.reasons) console.error(`- ${reason}`)
  await sendSignal(signalContext, 'heartbeat', {
    attempt,
    message: `attempt incomplete: ${lastValidation.reasons.join('; ')}`.slice(0, 2_000),
  })
  if (attempt < maxAttempts) await sleep(12_000)
}

await sendSignal(signalContext, 'failed', {
  attempt: maxAttempts,
  branch: agent.branch,
  message: lastValidation?.reasons?.join('; ') || 'Builder exhausted retries.',
})
console.error(`\n${agent.label}: BLOCKED_FOR_MERGE after ${maxAttempts} attempts.\n`)
process.exit(1)

async function runZyra(config, agent, prompt, attempt, signalContext) {
  const cli = path.join(config.launcherRoot, 'bin', 'zyra.mjs')
  const args = [
    cli,
    '--project', agent.worktree,
    '--model', config.model,
    '--thinking', config.thinking,
    '--no-onboarding',
    prompt,
  ]
  const child = spawn(process.execPath, args, {
    cwd: agent.worktree,
    env: {
      ...process.env,
      ZYRA_AUTONOMOUS_RUN_ID: config.runId,
      ZYRA_AUTONOMOUS_ROLE: agent.label,
      ZYRA_AUTONOMOUS_BRANCH: agent.branch,
      ZYRA_AUTONOMOUS_ATTEMPT: String(attempt),
    },
    stdio: 'inherit',
    windowsHide: false,
  })

  const heartbeat = setInterval(() => {
    void sendSignal(signalContext, 'heartbeat', {
      attempt,
      pid: child.pid,
      message: 'Zyra builder is running',
    })
  }, 20_000)
  heartbeat.unref?.()

  const exitCode = await new Promise((resolve) => {
    child.once('error', (error) => {
      console.error(`Failed to launch Zyra: ${error.message}`)
      resolve(1)
    })
    child.once('exit', (code, signal) => {
      if (signal) console.error(`Zyra exited by signal ${signal}`)
      resolve(code ?? 1)
    })
  })
  clearInterval(heartbeat)
  return exitCode
}

function buildPrompt(config, agent, agentKey, attempt, validation) {
  const briefMention = `@${agent.promptFile}`
  const planMention = `@${agent.planFile}`
  const runbookMention = '@docs/zyra-parallel-agent-build-runbook.md'
  if (attempt === 1) {
    return [
      `Read and attach ${briefMention}, ${planMention}, and ${runbookMention} completely.`,
      `You are the autonomous ${agent.label} builder for run ${config.runId} on branch ${agent.branch}.`,
      'Execute the full brief end to end now. Do not stop for routine questions or phase approvals.',
      `Write and commit ${agent.handoffFile} with ${agent.successMarker} only after all implementation and verification are complete.`,
    ].join(' ')
  }

  const reasons = validation?.reasons?.join('; ') || 'the previous attempt did not leave a validated handoff'
  return [
    `Read and attach ${briefMention}, ${planMention}, and ${runbookMention} completely.`,
    `This is recovery attempt ${attempt} for autonomous run ${config.runId}.`,
    'Inspect the existing branch, commits, worktree, tests, and any prior partial implementation. Preserve completed work and continue every unfinished phase.',
    `The wrapper found: ${reasons}.`,
    'Fix the concrete problems, complete the full suite, run the required checks, commit everything, and leave a clean worktree.',
    `Write and commit ${agent.handoffFile}; its final line must be ${agent.successMarker}.`,
    'Do not stop for routine questions.',
  ].join(' ')
}

function validateBuilder(config, agent, exitCode) {
  const reasons = []
  let commit = ''
  try {
    commit = git(agent.worktree, ['rev-parse', 'HEAD']).trim()
  } catch (error) {
    reasons.push(`cannot resolve branch HEAD: ${error.message}`)
  }

  if (exitCode !== 0) reasons.push(`Zyra exited with code ${exitCode}`)

  try {
    const branch = git(agent.worktree, ['branch', '--show-current']).trim()
    if (branch !== agent.branch) reasons.push(`worktree is on ${branch || 'detached HEAD'}, expected ${agent.branch}`)
  } catch (error) {
    reasons.push(`cannot resolve branch: ${error.message}`)
  }

  try {
    const count = Number(git(agent.worktree, ['rev-list', '--count', `${config.baseline.commit}..HEAD`]).trim())
    if (!Number.isFinite(count) || count < 1) reasons.push('branch has no commits beyond the automation baseline')
  } catch (error) {
    reasons.push(`cannot inspect commits: ${error.message}`)
  }

  const handoffPath = path.join(agent.worktree, agent.handoffFile)
  if (!existsSync(handoffPath)) {
    reasons.push(`handoff file is missing: ${agent.handoffFile}`)
  } else {
    const workingText = readFileSync(handoffPath, 'utf8')
    if (!workingText.includes(agent.successMarker)) reasons.push(`handoff lacks ${agent.successMarker}`)
    try {
      const committedText = git(agent.worktree, ['show', `HEAD:${agent.handoffFile}`])
      if (!committedText.includes(agent.successMarker)) reasons.push('handoff marker is not committed in HEAD')
    } catch {
      reasons.push('handoff file is not committed in HEAD')
    }
  }

  try {
    const status = git(agent.worktree, ['status', '--porcelain=v1', '--untracked-files=all']).trim()
    if (status) reasons.push(`worktree is not clean (${status.split(/\r?\n/).length} entries)`)
  } catch (error) {
    reasons.push(`cannot inspect worktree status: ${error.message}`)
  }

  return { ok: reasons.length === 0, reasons, commit }
}

async function waitForCoordinator(serverFile, timeoutMs) {
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    if (existsSync(serverFile)) {
      try {
        const value = JSON.parse(readFileSync(serverFile, 'utf8'))
        if (value?.ready && value?.host && Number.isInteger(value?.port)) return value
      } catch {
        // The coordinator writes atomically; retry while replacement completes.
      }
    }
    await sleep(500)
  }
  throw new Error(`Coordinator did not become ready within ${timeoutMs} ms.`)
}

async function sendSignal(context, state, payload = {}) {
  try {
    const response = await fetch(context.url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${context.token}`,
      },
      body: JSON.stringify({
        version: 1,
        agent: context.agent,
        state,
        occurredAt: new Date().toISOString(),
        ...payload,
      }),
      signal: AbortSignal.timeout(5_000),
    })
    if (!response.ok) console.error(`Coordinator signal ${state} returned HTTP ${response.status}`)
  } catch (error) {
    console.error(`Coordinator signal ${state} failed: ${error instanceof Error ? error.message : String(error)}`)
  }
}

function git(cwd, args) {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
    windowsHide: true,
  })
}

function requiredArg(name) {
  const index = process.argv.indexOf(name)
  const value = index >= 0 ? process.argv[index + 1] : ''
  if (!value) throw new Error(`Missing ${name}`)
  return value
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
