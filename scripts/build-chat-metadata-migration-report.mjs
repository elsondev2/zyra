import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { DatabaseSync } from "node:sqlite";
import { CanonicalChatIndex } from "../src/agent-server/chat-index.mjs";
import { ZyraAgentServerClient } from "../src/agent-server/client.mjs";

const HOME = path.resolve(os.homedir());
const args = parseArgs(process.argv.slice(2));
const backupDirectory = path.resolve(args.backup || findLatestVerifiedBackup());
const snapshotPath = path.join(backupDirectory, "assistant-state.sqlite.snapshot");
if (!existsSync(snapshotPath)) throw new Error(`Verified SQLite snapshot not found: ${snapshotPath}`);

const projectRoots = [...new Set([
  HOME,
  path.join(HOME, "my_coding_play", "zyra"),
  ...args.projects
].map((value) => path.resolve(value)).filter(existsSync))];
const reportIndexDirectory = path.join(backupDirectory, "migration-report-index");
const index = new CanonicalChatIndex({ stateDirectory: reportIndexDirectory });
await index.listProjects(projectRoots);
const indexSnapshot = index.snapshot();
const indexedChats = Object.values(indexSnapshot.chats);
const desktopRows = readDesktopRows(snapshotPath);
const desktopByCanonicalId = new Map(desktopRows.filter((row) => row.providerThreadId).map((row) => [row.providerThreadId, row]));
const indexedIds = new Set(indexedChats.map((chat) => chat.canonicalChatId));
const recommendations = indexedChats.map((chat) => recommendMetadata(chat, desktopByCanonicalId.get(chat.canonicalChatId) || null));
const orphanDesktopRows = desktopRows
  .filter((row) => row.providerThreadId && !indexedIds.has(row.providerThreadId))
  .map(recommendOrphanRecovery);
const titleRecommendations = [...recommendations, ...orphanDesktopRows];
const titleEvidenceChats = [
  ...indexedChats,
  ...orphanDesktopRows.map((row) => ({
    canonicalChatId: row.canonicalChatId,
    firstMessage: row.titleCandidates[0] || "",
    titleCandidates: row.titleCandidates
  }))
];
if (args.aiTitleCache) applyAiTitleCache(titleRecommendations, args.aiTitleCache);
if (args.generateAiTitles) await improveWeakTitlesWithAi(titleEvidenceChats, titleRecommendations);
const reportOrphanDesktopRows = orphanDesktopRows.map(({ titleCandidates: _privateTitleCandidates, ...row }) => row);

const report = {
  version: 1,
  mode: "dry-run",
  generatedAt: new Date().toISOString(),
  source: {
    verifiedSnapshot: snapshotPath,
    verifiedSnapshotSha256: sha256File(snapshotPath),
    canonicalSessionRoots: projectRoots,
    transcriptIndex: path.join(reportIndexDirectory, "chat-index-v2.json")
  },
  invariants: [
    "No live SQLite or JSONL transcript was modified.",
    "Project/title recommendations are metadata only; transcript paths remain unchanged.",
    "Low-confidence project recommendations preserve the current assignment."
  ],
  titleGeneration: {
    aiRequested: args.generateAiTitles,
    cacheReport: args.aiTitleCache || null,
    model: args.generateAiTitles ? "openai-codex/gpt-5.4-mini" : null
  },
  summary: {
    canonicalChats: recommendations.length,
    desktopThreads: desktopRows.length,
    orphanDesktopThreads: orphanDesktopRows.length,
    projectChangesRecommended: recommendations.filter((entry) => entry.project.changed).length,
    titleChangesRecommended: titleRecommendations.filter((entry) => entry.title.changed).length,
    highConfidenceProjectChanges: recommendations.filter((entry) => entry.project.changed && entry.project.confidence === "high").length,
    homeAssignmentsRetained: recommendations.filter((entry) => pathKey(entry.project.recommended) === pathKey(HOME)).length
  },
  recommendations,
  orphanDesktopRows: reportOrphanDesktopRows
};
const timestamp = report.generatedAt.replace(/[:.]/g, "-");
const outputPath = path.resolve(args.output || path.join(backupDirectory, `chat-metadata-migration-dry-run-${timestamp}.json`));
mkdirSync(path.dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
process.stdout.write(`${JSON.stringify({ outputPath, summary: report.summary }, null, 2)}\n`);

function recommendMetadata(chat, desktop) {
  const scores = new Map();
  const reasons = new Map();
  const add = (root, score, reason) => {
    const normalized = normalizeExistingProjectRoot(root);
    if (!normalized || pathKey(normalized) === pathKey(HOME)) return;
    scores.set(normalized, (scores.get(normalized) || 0) + score);
    const rootReasons = reasons.get(normalized) || [];
    if (!rootReasons.includes(reason)) rootReasons.push(reason);
    reasons.set(normalized, rootReasons);
  };

  if (chat.storageProject && pathKey(chat.storageProject) !== pathKey(HOME)) add(chat.storageProject, 8, "physical canonical session root");
  if (desktop?.projectPath && pathKey(desktop.projectPath) !== pathKey(HOME)) add(desktop.projectPath, 3, "current Desktop metadata");
  if (chat.cwd && pathKey(chat.cwd) !== pathKey(HOME)) add(chat.cwd, 4, "canonical session cwd");
  for (const [evidencePath, weightValue] of Object.entries(chat.pathEvidence || {})) {
    const root = findProjectRoot(evidencePath);
    if (!root) continue;
    add(root, Math.min(12, Math.max(1, Number(weightValue) || 1)), `tool path evidence (${compactPath(evidencePath)})`);
  }

  const ranked = [...scores.entries()].sort((left, right) => right[1] - left[1]);
  const best = ranked[0] || null;
  const secondScore = ranked[1]?.[1] || 0;
  const currentProject = desktop?.projectPath || chat.project || chat.cwd || chat.storageProject || HOME;
  let recommendedProject = currentProject;
  let confidence = "low";
  if (best) {
    confidence = best[1] >= 10 && best[1] >= secondScore * 1.5 ? "high" : best[1] >= 5 ? "medium" : "low";
    if (confidence !== "low") recommendedProject = best[0];
  }
  if (!best && pathKey(currentProject) === pathKey(HOME)) {
    recommendedProject = HOME;
    confidence = "high";
  }

  const currentTitle = desktop?.title || chat.title || "New chat";
  const canonicalTitle = chat.title || "";
  const suggestedTitle = chooseTitle(currentTitle, canonicalTitle, chat.titleCandidates || [chat.firstMessage || ""]);
  return {
    canonicalChatId: chat.canonicalChatId,
    desktopSessionId: desktop?.sessionId || null,
    desktopThreadId: desktop?.threadId || null,
    transcript: {
      path: chat.sessionPath,
      storageProject: chat.storageProject,
      unchanged: true
    },
    project: {
      current: currentProject,
      recommended: recommendedProject,
      changed: pathKey(currentProject) !== pathKey(recommendedProject),
      confidence,
      score: best?.[1] || 0,
      alternatives: ranked.slice(0, 4).map(([root, score]) => ({ root, score, reasons: reasons.get(root) || [] }))
    },
    title: {
      current: currentTitle,
      recommended: suggestedTitle,
      changed: normalizeTitleKey(currentTitle) !== normalizeTitleKey(suggestedTitle),
      confidence: isWeakTitle(currentTitle) && suggestedTitle !== currentTitle ? "medium" : "high",
      source: !isWeakTitle(currentTitle) ? "existing Desktop title" : !isWeakTitle(canonicalTitle) ? "canonical session title" : "first user request heuristic"
    },
    counts: {
      canonicalEntries: chat.entryCount || 0,
      messages: chat.messageCount || 0,
      visibleMessages: chat.displayMessageCount || 0,
      toolCalls: chat.toolCallCount || 0,
      errors: chat.errorCount || 0,
      images: chat.imageCount || 0
    }
  };
}

function recommendOrphanRecovery(row) {
  const currentTitle = row.title || "New Session";
  let suggestedTitle = chooseTitle(currentTitle, "", row.titleCandidates);
  if (isWeakTitle(suggestedTitle) && row.messageCount === 0) suggestedTitle = "Recovered empty chat";
  return {
    canonicalChatId: row.providerThreadId,
    desktopSessionId: row.sessionId,
    desktopThreadId: row.threadId,
    currentTitle,
    currentProject: row.projectPath,
    desktopMessageCount: row.messageCount,
    desktopActivityCount: row.activityCount,
    titleCandidates: row.titleCandidates,
    project: {
      current: row.projectPath || HOME,
      recommended: row.projectPath || HOME,
      changed: false,
      confidence: "high"
    },
    title: {
      current: currentTitle,
      recommended: suggestedTitle,
      changed: normalizeTitleKey(currentTitle) !== normalizeTitleKey(suggestedTitle),
      confidence: suggestedTitle === "Recovered empty chat" ? "high" : "medium",
      source: suggestedTitle === "Recovered empty chat" ? "deterministic empty-chat label" : "recovered Desktop message evidence"
    },
    recommendation: "recover-canonical-transcript-from-verified-Desktop-backup-before-unification"
  };
}

function applyAiTitleCache(recommendations, cachePathValue) {
  const cachePath = path.resolve(cachePathValue);
  const cachedReport = JSON.parse(readFileSync(cachePath, "utf8"));
  const titles = new Map((cachedReport.recommendations || [])
    .filter((entry) => String(entry?.title?.source || "").startsWith("AI") && entry?.title?.recommended)
    .map((entry) => [entry.canonicalChatId, entry.title]));
  for (const recommendation of recommendations) {
    const cached = titles.get(recommendation.canonicalChatId);
    if (!cached) continue;
    recommendation.title = { ...recommendation.title, ...cached, source: `${cached.source} (cached)` };
  }
}

async function improveWeakTitlesWithAi(indexedChats, recommendations) {
  const byId = new Map(indexedChats.map((chat) => [chat.canonicalChatId, chat]));
  const targets = recommendations.filter((entry) => isWeakTitle(entry.title.recommended));
  if (targets.length === 0) return;
  const client = new ZyraAgentServerClient({
    root: path.resolve(import.meta.dirname, ".."),
    autoStart: false,
    clientId: `chat-title-report:${process.pid}`,
    surface: "tui"
  });
  await client.connect();
  try {
    for (const target of targets) {
      const chat = byId.get(target.canonicalChatId);
      const excerpts = (chat?.titleCandidates || [chat?.firstMessage || ""])
        .map((value) => String(value || "").replace(/\s+/g, " ").trim())
        .filter(Boolean)
        .slice(0, 10)
        .map((value, index) => `${index + 1}. ${value.slice(0, 700)}`)
        .join("\n");
      if (!excerpts) continue;
      try {
        const result = await client.request("runtime.generateText", {
          cwd: target.project.recommended || HOME,
          model: "openai-codex/gpt-5.4-mini",
          thinking: "low",
          prompt: [
            "Create one concise title for this coding-assistant chat from the user-message excerpts.",
            "Return only the title, no quotes, markdown, prefix, or explanation.",
            "Use 3-9 words and at most 60 characters. Ignore greetings and managed-command boilerplate.",
            "If the excerpts contain only greetings and no topic, return: Greeting-only chat",
            "Preserve the actual topic; do not invent details.",
            "",
            excerpts
          ].join("\n")
        }, { timeoutMs: 120_000 });
        const title = sanitizeAiTitle(result.text);
        if (!title || isWeakTitle(title)) continue;
        target.title.recommended = title;
        target.title.changed = normalizeTitleKey(title) !== normalizeTitleKey(target.title.current);
        target.title.confidence = "high";
        target.title.source = "AI generated from early user-message excerpts";
      } catch (error) {
        target.title.generationError = error instanceof Error ? error.message : String(error);
      }
    }
  } finally {
    client.close();
  }
}

function sanitizeAiTitle(value) {
  return String(value || "")
    .replace(/^title\s*:\s*/i, "")
    .replace(/^[\"'`*_#\s]+|[\"'`*_#\s]+$/g, "")
    .split(/\r?\n/)[0]
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60);
}

function readDesktopRows(file) {
  const db = new DatabaseSync(file, { readOnly: true });
  try {
    const rows = db.prepare(`
      SELECT s.id AS session_id, s.title, s.project_path, t.id AS thread_id,
             t.provider_thread_id, t.cwd,
             (SELECT COUNT(*) FROM assistant_messages m WHERE m.thread_id = t.id) AS persisted_message_count,
             (SELECT COUNT(*) FROM assistant_activities a WHERE a.thread_id = t.id) AS persisted_activity_count
      FROM assistant_sessions s
      JOIN assistant_threads t ON t.session_id = s.id
    `).all();
    const readTitleCandidates = db.prepare(`
      SELECT text
      FROM assistant_messages
      WHERE thread_id = ? AND role = 'user' AND trim(coalesce(text, '')) <> ''
      ORDER BY created_at ASC
      LIMIT 10
    `);
    return rows.map((row) => ({
      sessionId: String(row.session_id || ""),
      title: String(row.title || ""),
      projectPath: String(row.project_path || row.cwd || "") || null,
      threadId: String(row.thread_id || ""),
      providerThreadId: String(row.provider_thread_id || "") || null,
      cwd: String(row.cwd || "") || null,
      messageCount: Number(row.persisted_message_count || 0),
      activityCount: Number(row.persisted_activity_count || 0),
      titleCandidates: readTitleCandidates.all(row.thread_id)
        .map((message) => String(message.text || "").replace(/\s+/g, " ").trim().slice(0, 2_000))
        .filter(Boolean)
    }));
  } finally {
    db.close();
  }
}

function findProjectRoot(value) {
  let candidate = path.resolve(String(value || ""));
  while (!existsSync(candidate) && path.dirname(candidate) !== candidate) candidate = path.dirname(candidate);
  if (!existsSync(candidate)) return null;
  try { if (!statSync(candidate).isDirectory()) candidate = path.dirname(candidate); }
  catch { return null; }
  let markerFallback = null;
  while (path.dirname(candidate) !== candidate && isWithin(candidate, HOME)) {
    if (existsSync(path.join(candidate, ".git"))) return candidate;
    if (!markerFallback && hasProjectMarker(candidate)) markerFallback = candidate;
    if (pathKey(candidate) === pathKey(HOME)) break;
    candidate = path.dirname(candidate);
  }
  return markerFallback;
}

function normalizeExistingProjectRoot(value) {
  if (!value) return null;
  const root = findProjectRoot(value);
  if (root) return root;
  const resolved = path.resolve(value);
  return existsSync(resolved) && pathKey(resolved) !== pathKey(HOME) ? resolved : null;
}

function hasProjectMarker(directory) {
  return ["package.json", "pyproject.toml", "Cargo.toml", "go.mod", "pom.xml", ".project"].some((name) => existsSync(path.join(directory, name)));
}

function chooseTitle(current, canonical, titleCandidates) {
  if (normalizeTitleKey(current) === "--version" || normalizeTitleKey(canonical) === "--version") return "Check local Zyra version";
  if (!isWeakTitle(current)) return cleanTitle(current);
  if (!isWeakTitle(canonical)) return cleanTitle(canonical);
  for (const candidate of titleCandidates) {
    const derived = deriveTitle(candidate);
    if (derived && !isWeakTitle(derived)) return derived;
  }
  return cleanTitle(current) || "New chat";
}

function deriveTitle(value) {
  let text = String(value || "")
    .split(/\n\nAttached files \(/i)[0]
    .replace(/[`#*_>]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (/^(?:\[zyra managed command update\]|the user sent the following while you were already working|go on\.?$|continue\.?$)/i.test(text)) return "";
  text = text.replace(/^(?:hi|hello|hey|helo|yo)\b[,.!?:;\s-]*/i, "");
  text = text.replace(/^(?:can|could|would) you\s+/i, "");
  if (!text) return "";
  const sentence = text.split(/(?<=[.!?])\s+/)[0].replace(/[.!?]+$/, "").trim();
  const clipped = sentence.length <= 72 ? sentence : `${sentence.slice(0, 69).replace(/\s+\S*$/, "")}…`;
  return clipped.charAt(0).toUpperCase() + clipped.slice(1);
}

function isWeakTitle(value) {
  const title = normalizeTitleKey(value);
  return !title
    || /^(?:new chat|new session|untitled|hello|hi|hey|helo|yo|test|testing|anything|initial greeting|hello response)[.!? ]*$/.test(title)
    || /^--[a-z0-9][a-z0-9-]*$/.test(title)
    || title.length < 4;
}

function cleanTitle(value) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, 240);
}

function normalizeTitleKey(value) {
  return cleanTitle(value).toLowerCase();
}

function compactPath(value) {
  const resolved = path.resolve(value);
  const relative = path.relative(HOME, resolved);
  return relative && !relative.startsWith("..") ? `~/${relative.replace(/\\/g, "/")}` : resolved;
}

function isWithin(candidate, root) {
  const relative = path.relative(root, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function pathKey(value) {
  const resolved = path.resolve(String(value || ""));
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

function findLatestVerifiedBackup() {
  const root = path.join(HOME, "zyra-chat-recovery-backups");
  if (!existsSync(root)) throw new Error("No chat-recovery backup root exists; pass --backup <directory>.");
  const candidates = readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(root, entry.name))
    .filter((directory) => existsSync(path.join(directory, "assistant-state.sqlite.snapshot")))
    .sort((left, right) => statSync(right).mtimeMs - statSync(left).mtimeMs);
  if (!candidates[0]) throw new Error("No verified SQLite snapshot was found; pass --backup <directory>.");
  return candidates[0];
}

function sha256File(file) {
  return createHash("sha256").update(readFileSync(file)).digest("hex");
}

function parseArgs(values) {
  const result = { backup: "", output: "", projects: [], generateAiTitles: false, aiTitleCache: "" };
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (value === "--backup") result.backup = values[++index] || "";
    else if (value === "--output") result.output = values[++index] || "";
    else if (value === "--project") result.projects.push(values[++index] || "");
    else if (value === "--generate-ai-titles") result.generateAiTitles = true;
    else if (value === "--ai-title-cache") result.aiTitleCache = values[++index] || "";
  }
  return result;
}
