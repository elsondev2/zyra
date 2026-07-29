export const meta = {
  version: 1,
  name: "review-changes",
  description: "Discover changed files, review them, verify findings, and synthesize a bounded report",
  phases: ["discover", "review", "verify", "synthesize"],
  budgets: { maxCalls: 24, maxRequests: 24, maxTokens: 1500000, maxCostUsd: 10, maxConcurrency: 3 },
};

const changed = await phase("discover", () =>
  agent("Return the changed source files as JSON with a files string array.", {
    model: "luna",
    fallbackModels: ["openai-codex/gpt-5.4-mini", "openai-codex/gpt-5.3-codex-spark"],
    tools: ["read", "grep", "find", "ls"],
    schema: { type: "object", required: ["files"], properties: { files: { type: "array", items: { type: "string" } } } },
  }),
);

const reviews = await phase("review", () =>
  pipeline(changed.files, (file) =>
    agent(`Review ${file} for concrete defects.`, {
      model: "terra",
      fallbackModels: ["openai-codex/gpt-5.5", "openai-codex/gpt-5.4"],
      agent: "code-reviewer",
      label: file,
      tools: ["read", "grep", "find", "ls"],
    }),
  { concurrency: 3 }),
);

const verified = await phase("verify", () =>
  pipeline(reviews.filter(Boolean), (finding, index) =>
    agent(`Independently verify this finding:\n${finding}`, {
      model: "terra",
      fallbackModels: ["openai-codex/gpt-5.5", "openai-codex/gpt-5.4"],
      label: `verifier-${index + 1}`,
      tools: ["read", "grep", "find", "ls"],
    }),
  { concurrency: 2 }),
);

export default await phase("synthesize", () =>
  agent(`Deduplicate and rank these verified findings:\n${JSON.stringify(verified)}`, {
    model: "sol",
    fallbackModels: ["terra", "openai-codex/gpt-5.5"],
  }),
);
