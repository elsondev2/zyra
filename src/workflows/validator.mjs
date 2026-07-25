import { MAX_WORKFLOW_SOURCE_BYTES } from "./contracts.mjs";

const FORBIDDEN_SOURCE_PATTERNS = [
  [/(?:^|[^\w])(?:require|process|global|globalThis\.process|module|exports)\b/, "Node globals are unavailable"],
  [/\bimport\s*(?:\(|[^\s{])/, "imports are unavailable"],
  [/\b(?:eval|Function|AsyncFunction|WebAssembly)\s*\(/, "dynamic code evaluation is unavailable"],
  [/\b(?:fetch|XMLHttpRequest|WebSocket|EventSource)\b/, "network APIs are unavailable"],
  [/\b(?:Deno|Bun)\b/, "host runtime globals are unavailable"],
  [/\bMath\.random\s*\(|\bDate\.now\s*\(/, "nondeterministic time/random calls are unavailable"],
];

export function validateWorkflowSource(source, options = {}) {
  const text = String(source ?? "");
  const errors = [];
  const warnings = [];
  const bytes = Buffer.byteLength(text, "utf8");
  if (!text.trim()) errors.push("workflow source is empty");
  if (bytes > (options.maxBytes ?? MAX_WORKFLOW_SOURCE_BYTES)) errors.push(`workflow source exceeds ${options.maxBytes ?? MAX_WORKFLOW_SOURCE_BYTES} bytes`);
  for (const [pattern, message] of FORBIDDEN_SOURCE_PATTERNS) if (pattern.test(stripCommentsAndStrings(text))) errors.push(message);
  if (!/\bagent\s*\(/.test(text)) warnings.push("workflow does not call agent()");
  const projectedCalls = Number(options.projectedCalls ?? countStaticCalls(text));
  if (projectedCalls >= 25) warnings.push(`large workflow projection: ${projectedCalls} agent calls`);
  return { valid: errors.length === 0, errors: [...new Set(errors)], warnings: [...new Set(warnings)], bytes, projectedCalls };
}

export function assertValidWorkflowSource(source, options = {}) {
  const result = validateWorkflowSource(source, options);
  if (!result.valid) throw new Error(`Workflow source rejected: ${result.errors.join("; ")}.`);
  return result;
}

function countStaticCalls(source) {
  return (String(source).match(/\bagent\s*\(/g) ?? []).length;
}

function stripCommentsAndStrings(source) {
  return String(source)
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/\/\/[^\n]*/g, " ")
    .replace(/'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"|`(?:\\.|[^`\\])*`/g, " ");
}
