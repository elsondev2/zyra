#!/usr/bin/env node
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  createAgentSession,
  createWriteTool,
  generateDiffString,
  generateUnifiedPatch,
  SessionManager,
  withFileMutationQueue,
} from "@earendil-works/pi-coding-agent";
import {
  createZyraWriteTool,
  resolveZyraWritePath,
  ZYRA_WRITE_SNAPSHOT_MAX_BYTES,
} from "../src/write-diff-tool.mjs";

function assertPatchReconstructs(patch, relativePath, expectedContent, label) {
  const applyRoot = mkdtempSync(path.join(os.tmpdir(), "zyra-write-patch-"));
  try {
    mkdirSync(path.dirname(path.join(applyRoot, relativePath)), { recursive: true });
    writeFileSync(path.join(applyRoot, "change.patch"), patch, "utf8");
    const applied = spawnSync(
      "git",
      ["-c", "core.autocrlf=false", "apply", "--whitespace=nowarn", "change.patch"],
      { cwd: applyRoot, encoding: "utf8" },
    );
    assert.equal(applied.status, 0, `${label} patch must apply cleanly: ${applied.stderr}`);
    assert.deepEqual(
      readFileSync(path.join(applyRoot, relativePath)),
      Buffer.from(expectedContent, "utf8"),
      `${label} patch must reconstruct the exact written bytes`,
    );
  } finally {
    rmSync(applyRoot, { recursive: true, force: true });
  }
}

const project = mkdtempSync(path.join(os.tmpdir(), "zyra-write-diff-"));
try {
  const tool = createZyraWriteTool({
    cwd: project,
    createWriteTool,
    generateDiffString,
    generateUnifiedPatch,
    withFileMutationQueue,
  });
  assert.equal(tool.name, "write");
  assert.equal(tool.parameters, createWriteTool(project).parameters, "enriched write keeps Pi's public parameter contract");

  const fakeHome = path.join(project, "fake-home");
  assert.equal(resolveZyraWritePath(project, "~/notes.txt", { homeDir: fakeHome }), path.join(fakeHome, "notes.txt"));
  if (process.platform === "win32") {
    assert.equal(resolveZyraWritePath(project, "~\\notes.txt", { homeDir: fakeHome }), path.join(fakeHome, "notes.txt"));
  }
  assert.equal(resolveZyraWritePath(project, "@src/at-prefix.txt"), path.join(project, "src", "at-prefix.txt"));
  assert.equal(resolveZyraWritePath(project, "src/unicode\u202fspace.txt"), path.join(project, "src", "unicode space.txt"));
  const fileUrlTarget = path.join(project, "src", "file-url.txt");
  assert.equal(resolveZyraWritePath(project, pathToFileURL(fileUrlTarget).href), fileUrlTarget);

  const atPrefixResult = await tool.execute("write-at-prefix", {
    path: "@src/at-prefix.txt",
    content: "at prefix\n",
  });
  assert.equal(readFileSync(path.join(project, "src", "at-prefix.txt"), "utf8"), "at prefix\n");
  assert.equal(existsSync(path.join(project, "@src", "at-prefix.txt")), false);
  assert.equal(atPrefixResult.details.path, "src/at-prefix.txt");
  assertPatchReconstructs(atPrefixResult.details.patch, "src/at-prefix.txt", "at prefix\n", "leading @ path");

  const unicodeSpaceResult = await tool.execute("write-unicode-space", {
    path: "src/unicode\u202fspace.txt",
    content: "unicode space\n",
  });
  assert.equal(readFileSync(path.join(project, "src", "unicode space.txt"), "utf8"), "unicode space\n");
  assert.equal(existsSync(path.join(project, "src", "unicode\u202fspace.txt")), false);
  assert.equal(unicodeSpaceResult.details.path, "src/unicode space.txt");
  assertPatchReconstructs(unicodeSpaceResult.details.patch, "src/unicode space.txt", "unicode space\n", "Unicode-space path");

  const addCases = [
    { label: "empty file", toolCallId: "write-new-empty", relativePath: "src/empty.txt", content: "" },
    { label: "trailing LF", toolCallId: "write-new-trailing", relativePath: "src/new-file.txt", content: "alpha\nbeta\n" },
    { label: "no trailing newline", toolCallId: "write-new-no-eof", relativePath: "src/no-eof.txt", content: "alpha" },
    { label: "CRLF", toolCallId: "write-new-crlf", relativePath: "src/crlf.txt", content: "alpha\r\nbeta\r\n" },
  ];
  let addResult;
  for (const testCase of addCases) {
    const result = await tool.execute(testCase.toolCallId, {
      path: testCase.relativePath,
      content: testCase.content,
    });
    assert.deepEqual(
      readFileSync(path.join(project, testCase.relativePath)),
      Buffer.from(testCase.content, "utf8"),
      `${testCase.label} write must preserve exact bytes`,
    );
    assert.equal(result.details.source, "synthetic-snapshot");
    assert.equal(result.details.snapshotBacked, true);
    assert.equal(result.details.authoritative, true);
    assert.equal(result.details.changes[0].kind, "add");
    assertPatchReconstructs(result.details.patch, testCase.relativePath, testCase.content, testCase.label);
    if (testCase.toolCallId === "write-new-trailing") addResult = result;
  }
  assert.match(addResult.details.patch, /--- \/dev\/null/);
  assert.match(addResult.details.patch, /\+\+\+ b\/src\/new-file\.txt/);
  assert.match(addResult.details.patch, /\+alpha/);

  writeFileSync(path.join(project, "src", "existing.txt"), "before\n", "utf8");
  const existingResult = await tool.execute("write-existing", {
    path: "src/existing.txt",
    content: "after\n",
  });
  assert.equal(readFileSync(path.join(project, "src", "existing.txt"), "utf8"), "after\n");
  assert.equal(existingResult.details.source, "synthetic-snapshot");
  assert.equal(existingResult.details.snapshotBacked, true);
  assert.equal(existingResult.details.changes[0].kind, "update");
  assert.match(existingResult.details.patch, /-before/);
  assert.match(existingResult.details.patch, /\+after/);
  assert.match(existingResult.details.diff, /before/);
  assert.match(existingResult.details.diff, /after/);

  writeFileSync(path.join(project, "src", "binary.bin"), Buffer.from([0, 1, 2, 3]));
  const binaryResult = await tool.execute("write-binary-existing", {
    path: "src/binary.bin",
    content: "now text",
  });
  assert.equal(binaryResult.details.patch, undefined);
  assert.equal(binaryResult.details.authoritative, false);
  assert.equal(binaryResult.details.snapshotBacked, false);
  assert.equal(binaryResult.details.diffUnavailableReason, "binary");
  assert.equal(readFileSync(path.join(project, "src", "binary.bin"), "utf8"), "now text");

  const oversizedResult = await tool.execute("write-large", {
    path: "src/large.txt",
    content: "x".repeat(ZYRA_WRITE_SNAPSHOT_MAX_BYTES + 1),
  });
  assert.equal(oversizedResult.details.patch, undefined);
  assert.equal(oversizedResult.details.diffUnavailableReason, "too-large");
  assert.equal(oversizedResult.details.truncated, true);

  mkdirSync(path.join(project, "src", "directory-target"), { recursive: true });
  await assert.rejects(
    () => tool.execute("write-failed", { path: "src/directory-target", content: "cannot write directory" }),
    /EISDIR|illegal operation|directory/i,
  );
  assert.equal(readFileSync(path.join(project, "src", "existing.txt"), "utf8"), "after\n", "a failed write cannot affect a prior successful snapshot");

  const { session } = await createAgentSession({
    cwd: project,
    tools: ["write"],
    customTools: [tool],
    sessionManager: SessionManager.inMemory(project),
  });
  try {
    const registeredWrites = session.agent.state.tools.filter((entry) => entry.name === "write");
    assert.equal(registeredWrites.length, 1, "Zyra's custom write must replace the built-in name rather than add a duplicate tool");
    const registeredResult = await registeredWrites[0].execute(
      "registered-write",
      { path: "src/registered.txt", content: "registered\n" },
      undefined,
      () => undefined,
    );
    assert.equal(registeredResult.details?.source, "synthetic-snapshot", "the tool actually registered with Pi must return enriched details");
    assert.match(registeredResult.details?.patch || "", /\+registered/);
  } finally {
    session.dispose();
  }

  console.log("Zyra write snapshot enrichment: ok");
} finally {
  rmSync(project, { recursive: true, force: true });
}
