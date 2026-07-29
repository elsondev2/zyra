export function normalizeTemporaryBrowserOperation(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Browser relay operation is invalid.");
  const operation = String(value.operation || "");
  if (operation === "open_tab") return { operation, reveal: value.reveal !== false };
  if (operation === "list_targets") return { operation, targetKind: "zyra-browser" };
  if (!["request_grant", "observe", "act", "release"].includes(operation)) {
    throw new Error(`Browser relay operation is not allowed: ${operation || "missing"}.`);
  }
  if (operation !== "release") {
    const targetId = String(value.targetId || "");
    if (!/^(?:control-target:)?zyra-browser:/.test(targetId)) {
      throw new Error("The temporary relay is restricted to in-app Browser targets.");
    }
  }
  return JSON.parse(JSON.stringify(value));
}
