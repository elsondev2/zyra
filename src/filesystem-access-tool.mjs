import path from "node:path";
import { statSync } from "node:fs";
import { Type } from "@sinclair/typebox";
import { canonicalPermissionPath, resolvePermissionPath } from "./permission-paths.mjs";

export const FILESYSTEM_ACCESS_TOOL = "filesystem_access";
const contains = (parent, child) => {
  const relative = path.relative(parent, child);
  return relative === "" || (relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
};
const result = (details) => ({ content: [{ type: "text", text: JSON.stringify(details) }], details });

// Grants belong to this live runtime, never to shared Project settings. Saved
// read-only roots remain ceilings, including when an approved parent overlaps.
export function createFilesystemAccessController({ project, roots, requestPermission, getPermissionMode }) {
  const grants = [];
  const currentRoots = () => [...roots, ...grants];
  const inspect = () => ({
    permissionMode: getPermissionMode(), workingDirectory: project,
    roots: currentRoots().map(root => ({ path: root.path, access: root.access, lifetime: roots.includes(root) ? "saved Project scope" : root.once ? "next matching tool call" : "until chat reconnects" })),
    note: "Full access controls action approvals, not folder scope. Request only the folder needed. Saved read-only folders cannot be upgraded here. Temporary grants expire when the chat reconnects; permanent folders belong in Settings > Projects.",
    issueReporting: "If GitHub CLI is available and authenticated, use gh issue create in the intended repository after user authorization. Never include credentials or private session contents.",
  });
  const tool = {
    name: FILESYSTEM_ACCESS_TOOL,
    label: "Folder access",
    description: "Inspect this chat's effective filesystem scope or request access to a specific existing folder through the user's approval UI. Use after a scope denial instead of switching tools to bypass it. Approval is required even in Full access mode. Grants apply immediately and expire on reconnect.",
    parameters: Type.Object({
      operation: Type.Union([Type.Literal("inspect"), Type.Literal("request")]),
      path: Type.Optional(Type.String({ description: "Existing folder to request, not a file." })),
      access: Type.Optional(Type.Union([Type.Literal("read-only"), Type.Literal("read-write")])),
      reason: Type.Optional(Type.String({ description: "Why this folder is needed for the user's task." })),
    }, { additionalProperties: false }),
    async execute(toolCallId, params, signal) {
      if (params.operation === "inspect") return result(inspect());
      if (params.operation !== "request") throw new Error("Choose inspect or request.");
      if (!params.path?.trim() || !params.reason?.trim()) throw new Error("Folder path and reason are required.");
      if (signal?.aborted) return result({ granted: false, cancelled: true });
      const folder = resolvePermissionPath(params.path, project, "ls");
      if (!statSync(folder).isDirectory()) throw new Error("Request an existing folder, not a file.");
      const canonical = canonicalPermissionPath(folder);
      if (!canonical) throw new Error("The folder cannot be resolved safely.");
      const access = params.access === "read-write" ? "read-write" : "read-only";
      const readonly = roots.some(root => root.access === "read-only"
        && (contains(root.path, folder) || (root.realPath && contains(root.realPath, canonical))));
      if (access === "read-write" && readonly) return result({ granted: false, reason: "This folder is saved as read-only. Change its Project setting explicitly to allow writes." });
      if (grants.length >= 16) return result({ granted: false, reason: "Temporary folder limit reached. Add permanent folders in Settings > Projects." });
      // Never route a scope expansion through automatic review or Full access.
      const decision = await requestPermission({
        requestType: access === "read-only" ? "file-read" : "file-change", toolName: FILESYSTEM_ACCESS_TOOL, toolCallId,
        title: `Allow ${access === "read-only" ? "read-only" : "read and write"} folder access?`,
        detail: `${folder}\n${params.reason.trim()}\nAllow once covers the next matching tool call. The folder grant button lasts until this chat reconnects. Existing read-only restrictions still apply.`,
        paths: [folder], grantLabel: "Allow folder until chat reconnects",
      });
      if (signal?.aborted) return result({ granted: false, cancelled: true });
      if (!["acceptOnce", "acceptForSession"].includes(decision)) return result({ granted: false, reason: "Folder access was declined." });
      // A directory/link swapped while the approval was open is not the folder
      // the user reviewed. Do not broaden scope using its replacement.
      if (canonicalPermissionPath(folder) !== canonical || !statSync(folder).isDirectory()) {
        return result({ granted: false, reason: "The folder changed while awaiting approval. Request it again." });
      }
      if (grants.length >= 16) return result({ granted: false, reason: "Temporary folder limit reached while awaiting approval." });
      // An explicitly approved upgrade replaces an earlier temporary grant for
      // this exact directory; saved read-only roots were checked above.
      for (let index = grants.length - 1; index >= 0; index--) {
        if (grants[index].path === folder && grants[index].realPath === canonical) grants.splice(index, 1);
      }
      grants.push({ path: folder, realPath: canonical, access, once: decision === "acceptOnce" });
      return result({ granted: true, path: folder, access, lifetime: decision === "acceptOnce" ? "next matching tool call" : "until chat reconnects", note: "Retry the original tool. A reconnect ends this temporary grant." });
    },
  };
  return {
    tool, currentRoots,
    consume(paths, toolName) {
      if (toolName === FILESYSTEM_ACCESS_TOOL) return;
      for (let index = grants.length - 1; index >= 0; index--) {
        const root = grants[index];
        if (!root.once) continue;
        if (paths.some(value => {
          try { return contains(root.path, resolvePermissionPath(value, project, toolName)); }
          catch { return false; }
        })) grants.splice(index, 1);
      }
    },
  };
}
