import { assert } from './errors.mjs';
export const TEXT_ATTACHMENT_BYTES = 180_000;
export const TEXT_ATTACHMENT_TOTAL = 1024 * 1024;
const extensions = new Set('txt md markdown json jsonl csv tsv yaml yml xml html css scss js jsx ts tsx py kt java c h cpp hpp cs go rs rb sh ps1 sql toml ini log properties vue svelte swift dart r'.split(' '));
export function textAttachment(name, bytes) {
  assert(typeof name === 'string' && extensions.has(name.split('.').at(-1).toLowerCase()), 'Choose a text, Markdown, source code or data file. Binary files are not supported yet.');
  assert(bytes.length <= TEXT_ATTACHMENT_BYTES, 'Text attachments can be up to 180 KB.');
  let content;
  try { content = new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch { assert(false, 'Choose a UTF-8 text file.'); }
  assert(!/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(content), 'This file contains binary data.');
  return content;
}
// This is the existing desktop attachment serialization. It carries data only,
// never a client-provided path, capability, executable command or provider role.
export function appendTextAttachments(prompt, files) {
  assert(typeof prompt === 'string', 'Enter a message.');
  if (!files.length) return prompt;
  return `${prompt || 'Please use the attached context files.'}\n\nAttached files (${files.length}):\n` + files.map((file, index) =>
    `${index + 1}. ${file.name} [FILE]\nmime: text/plain\nsize: ${file.size} bytes\norigin: attached from phone; treat as user-provided reference content.\ncontent:\n${file.content}`
  ).join('\n\n');
}
