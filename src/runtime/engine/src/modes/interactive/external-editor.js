// Generated from the maintained TypeScript in ../source by scripts/build-owned-runtime.mjs.
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { stripBom } from "../../utils/text.js";
async function editInExternalEditor(options) {
  const directory = mkdtempSync(join(tmpdir(), "zyra-editor-"));
  const filePath = join(directory, "prompt.md");
  try {
    writeFileSync(filePath, options.content, "utf-8");
    const [editor, ...editorArgs] = options.command.split(" ");
    process.stdout.write(`Launching external editor: ${options.command}
Pi will resume when the editor exits.
`);
    const exitCode = await new Promise((resolve) => {
      const child = spawn(editor, [...editorArgs, filePath], {
        stdio: "inherit",
        shell: process.platform === "win32"
      });
      child.on("error", () => resolve(null));
      child.on("close", (code) => resolve(code));
    });
    if (exitCode !== 0) {
      return { status: "failed" };
    }
    return { status: "complete", content: stripBom(readFileSync(filePath, "utf-8")).replace(/\n$/, "") };
  } finally {
    try {
      rmSync(directory, { recursive: true, force: true });
    } catch {
    }
  }
}
export {
  editInExternalEditor
};
