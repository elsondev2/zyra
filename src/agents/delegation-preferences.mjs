import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { withProviderStoreLock, writeProviderJson } from "../provider-transactions.mjs";
import { DELEGATION_PRESETS, normalizeDelegationPreferences } from "./delegation-policy.mjs";

export const delegationPreferencesPath = () => path.join(process.env.ZYRA_DATA_ROOT || homedir(), ".zyra", "delegation-preferences.json");
export function readDelegationPreferences(file = delegationPreferencesPath()) {
  try { return normalizeDelegationPreferences(JSON.parse(readFileSync(file, "utf8"))); }
  catch (error) {
    if (error.code === "ENOENT") return { version: 1, preset: "balanced", notes: "" };
    throw new Error("Delegation preferences could not be read.");
  }
}
export async function saveDelegationPreferences(input, file = delegationPreferencesPath()) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Invalid delegation preferences.");
  return withProviderStoreLock(file, async () => {
    const current = readDelegationPreferences(file);
    const value = normalizeDelegationPreferences({ ...current,
      ...(Object.hasOwn(input, "preset") ? { preset: input.preset } : {}),
      ...(Object.hasOwn(input, "notes") ? { notes: input.notes } : {}),
    });
    await writeProviderJson(file, value); return value;
  });
}
export function delegationSettingsSnapshot(preferences = readDelegationPreferences()) {
  return { preferences, presets: DELEGATION_PRESETS.map(({ id, label, description }) => ({ id, label, description })) };
}
