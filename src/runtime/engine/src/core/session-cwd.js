// Generated from the maintained TypeScript in ../source by scripts/build-owned-runtime.mjs.
import { existsSync } from "node:fs";
function getMissingSessionCwdIssue(sessionManager, fallbackCwd) {
  const sessionFile = sessionManager.getSessionFile();
  if (!sessionFile) {
    return void 0;
  }
  const sessionCwd = sessionManager.getCwd();
  if (!sessionCwd || existsSync(sessionCwd)) {
    return void 0;
  }
  return {
    sessionFile,
    sessionCwd,
    fallbackCwd
  };
}
function formatMissingSessionCwdError(issue) {
  const sessionFile = issue.sessionFile ? `
Session file: ${issue.sessionFile}` : "";
  return `Stored session working directory does not exist: ${issue.sessionCwd}${sessionFile}
Current working directory: ${issue.fallbackCwd}`;
}
function formatMissingSessionCwdPrompt(issue) {
  return `cwd from session file does not exist
${issue.sessionCwd}

continue in current cwd
${issue.fallbackCwd}`;
}
class MissingSessionCwdError extends Error {
  issue;
  constructor(issue) {
    super(formatMissingSessionCwdError(issue));
    this.name = "MissingSessionCwdError";
    this.issue = issue;
  }
}
function assertSessionCwdExists(sessionManager, fallbackCwd) {
  const issue = getMissingSessionCwdIssue(sessionManager, fallbackCwd);
  if (issue) {
    throw new MissingSessionCwdError(issue);
  }
}
export {
  MissingSessionCwdError,
  assertSessionCwdExists,
  formatMissingSessionCwdError,
  formatMissingSessionCwdPrompt,
  getMissingSessionCwdIssue
};
