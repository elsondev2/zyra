export const DELEGATION_PRESETS = Object.freeze([
  { id: "balanced", label: "Balanced", description: "Match capability and effort to the task.", guidance: "Choose a suitable model and reasoning effort for each delegated task. Balance quality, expected API-equivalent cost and speed. Avoid unnecessary agents and duplicated context." },
  { id: "cost", label: "Prioritize cost", description: "Keep routine delegated work economical.", guidance: "Prefer lower estimated API cost for routine work, using enough reasoning to finish reliably. Consider input, output, caching, repeated attempts and delegation overhead. Escalate for failed attempts or difficult, high-risk work rather than blindly choosing the cheapest model." },
  { id: "quality", label: "Prioritize quality", description: "Favor capable models for difficult or risky work.", guidance: "Favor strong task suitability and careful reasoning for difficult or high-risk work. Verify results. Routine retrieval and mechanical work can still use economical models. A higher price alone is not evidence of quality." },
  { id: "speed", label: "Prioritize speed", description: "Minimize waiting and unnecessary delegation.", guidance: "Favor fast completion and avoid unnecessary delegation or excessive reasoning on simple tasks. Use parallel agents only for genuinely independent work. Do not infer measured latency from price alone; preserve verification and safety." }
]);

export function normalizeDelegationPreferences(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Invalid delegation preferences.");
  if (!DELEGATION_PRESETS.some(preset => preset.id === input.preset)) throw new Error("Choose a delegation approach.");
  if (typeof input.notes !== "string" || input.notes.length > 4000) throw new Error("Delegation guidance must be at most 4,000 characters.");
  if (input.version !== undefined && input.version !== 1) throw new Error("Unsupported delegation preferences version.");
  return { version: 1, preset: input.preset, notes: input.notes.trim() };
}

export function buildDelegationGuidance(preferences) {
  const value = normalizeDelegationPreferences(preferences);
  return [DELEGATION_PRESETS.find(preset => preset.id === value.preset).guidance,
    value.notes ? `User guidance: ${value.notes}` : "",
    "Use estimated API cost as the common comparison, including subscription models. Unknown pricing is not free; catalog estimates are not verified bills. Existing permissions, scopes, budget limits and explicit agent-model requirements still apply."
  ].filter(Boolean).join("\n");
}
