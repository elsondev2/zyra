import assert from "node:assert/strict";
import { defineZyraTool } from "../src/agents/define-zyra-tool.mjs";

const validTool = {
  name: "example",
  label: "Example",
  description: "A test tool.",
  parameters: { type: "object" },
  execute: async () => ({ content: [] }),
};

assert.equal(defineZyraTool(validTool), validTool);
assert.throws(() => defineZyraTool(null), /must be an object/);
assert.throws(() => defineZyraTool({ ...validTool, name: " " }), /non-empty name/);
assert.throws(() => defineZyraTool({ ...validTool, parameters: null }), /parameter schema/);
assert.throws(() => defineZyraTool({ ...validTool, execute: null }), /execute function/);

console.log("Zyra tool definition contract: ok");
