// Generated from the maintained TypeScript in ../source by scripts/build-owned-runtime.mjs.
import { Container, Text } from "../../../../terminal/src/index.js";
import { mkdir as fsMkdir, writeFile as fsWriteFile } from "fs/promises";
import { dirname } from "path";
import { Type } from "typebox";
import { keyHint } from "../../modes/interactive/components/keybinding-hints.js";
import { getLanguageFromPath, highlightCode } from "../../modes/interactive/theme/theme.js";
import { getExperimentalToolSampling } from "../experimental.js";
import { withFileMutationQueue } from "./file-mutation-queue.js";
import { resolveToCwd } from "./path-utils.js";
import { normalizeDisplayText, renderToolPath, replaceTabs, str } from "./render-utils.js";
import { wrapToolDefinition } from "./tool-definition-wrapper.js";
const writeSchema = Type.Object({
  path: Type.String({ description: "Path to the file to write (relative or absolute)" }),
  content: Type.String({ description: "Content to write to the file" })
});
const writeToolSystemPromptContribution = {
  snippet: "Create or overwrite files",
  guidelines: ["Use write only for new files or complete rewrites."]
};
const defaultWriteOperations = {
  writeFile: (path, content) => fsWriteFile(path, content, "utf-8"),
  mkdir: (dir) => fsMkdir(dir, { recursive: true }).then(() => {
  })
};
class WriteCallRenderComponent extends Text {
  cache;
  constructor() {
    super("", 0, 0);
  }
}
const WRITE_PARTIAL_FULL_HIGHLIGHT_LINES = 50;
function highlightSingleLine(line, lang) {
  const highlighted = highlightCode(line, lang);
  return highlighted[0] ?? "";
}
function refreshWriteHighlightPrefix(cache) {
  const prefixCount = Math.min(WRITE_PARTIAL_FULL_HIGHLIGHT_LINES, cache.normalizedLines.length);
  if (prefixCount === 0) return;
  const prefixSource = cache.normalizedLines.slice(0, prefixCount).join("\n");
  const prefixHighlighted = highlightCode(prefixSource, cache.lang);
  for (let i = 0; i < prefixCount; i++) {
    cache.highlightedLines[i] = prefixHighlighted[i] ?? highlightSingleLine(cache.normalizedLines[i] ?? "", cache.lang);
  }
}
function rebuildWriteHighlightCacheFull(rawPath, fileContent) {
  const lang = rawPath ? getLanguageFromPath(rawPath) : void 0;
  if (!lang) return void 0;
  const displayContent = normalizeDisplayText(fileContent);
  const normalized = replaceTabs(displayContent);
  return {
    rawPath,
    lang,
    rawContent: fileContent,
    normalizedLines: normalized.split("\n"),
    highlightedLines: highlightCode(normalized, lang)
  };
}
function updateWriteHighlightCacheIncremental(cache, rawPath, fileContent) {
  const lang = rawPath ? getLanguageFromPath(rawPath) : void 0;
  if (!lang) return void 0;
  if (!cache) return rebuildWriteHighlightCacheFull(rawPath, fileContent);
  if (cache.lang !== lang || cache.rawPath !== rawPath) return rebuildWriteHighlightCacheFull(rawPath, fileContent);
  if (!fileContent.startsWith(cache.rawContent)) return rebuildWriteHighlightCacheFull(rawPath, fileContent);
  if (fileContent.length === cache.rawContent.length) return cache;
  const deltaRaw = fileContent.slice(cache.rawContent.length);
  const deltaDisplay = normalizeDisplayText(deltaRaw);
  const deltaNormalized = replaceTabs(deltaDisplay);
  cache.rawContent = fileContent;
  if (cache.normalizedLines.length === 0) {
    cache.normalizedLines.push("");
    cache.highlightedLines.push("");
  }
  const segments = deltaNormalized.split("\n");
  const lastIndex = cache.normalizedLines.length - 1;
  cache.normalizedLines[lastIndex] += segments[0];
  cache.highlightedLines[lastIndex] = highlightSingleLine(cache.normalizedLines[lastIndex], cache.lang);
  for (let i = 1; i < segments.length; i++) {
    cache.normalizedLines.push(segments[i]);
    cache.highlightedLines.push(highlightSingleLine(segments[i], cache.lang));
  }
  refreshWriteHighlightPrefix(cache);
  return cache;
}
function trimTrailingEmptyLines(lines) {
  let end = lines.length;
  while (end > 0 && lines[end - 1] === "") {
    end--;
  }
  return lines.slice(0, end);
}
function formatWriteCall(args, options, theme, cache, cwd) {
  const rawPath = str(args?.file_path ?? args?.path);
  const fileContent = str(args?.content);
  const pathDisplay = renderToolPath(rawPath, theme, cwd);
  let text = `${theme.fg("toolTitle", theme.bold("write"))} ${pathDisplay}`;
  if (fileContent === null) {
    text += `

${theme.fg("error", "[invalid content arg - expected string]")}`;
  } else if (fileContent) {
    const lang = rawPath ? getLanguageFromPath(rawPath) : void 0;
    const renderedLines = lang ? cache?.highlightedLines ?? highlightCode(replaceTabs(normalizeDisplayText(fileContent)), lang) : normalizeDisplayText(fileContent).split("\n");
    const lines = trimTrailingEmptyLines(renderedLines);
    const totalLines = lines.length;
    const maxLines = options.expanded ? lines.length : 10;
    const displayLines = lines.slice(0, maxLines);
    const remaining = lines.length - maxLines;
    text += `

${displayLines.map((line) => lang ? line : theme.fg("toolOutput", replaceTabs(line))).join("\n")}`;
    if (remaining > 0) {
      text += `${theme.fg("muted", `
... (${remaining} more lines, ${totalLines} total,`)} ${keyHint("app.tools.expand", "to expand")}${theme.fg("muted", ")")}`;
    }
  }
  return text;
}
function formatWriteResult(result, theme) {
  if (!result.isError) {
    return void 0;
  }
  const output = result.content.filter((c) => c.type === "text").map((c) => c.text || "").join("\n");
  if (!output) {
    return void 0;
  }
  return `
${theme.fg("error", output)}`;
}
function createWriteToolDefinition(cwd, options) {
  const ops = options?.operations ?? defaultWriteOperations;
  return {
    name: "write",
    label: "write",
    description: "Write content to a file. Creates the file if it doesn't exist, overwrites if it does. Automatically creates parent directories.",
    promptSnippet: writeToolSystemPromptContribution.snippet,
    promptGuidelines: [...writeToolSystemPromptContribution.guidelines],
    parameters: writeSchema,
    constrainedSampling: getExperimentalToolSampling(),
    async execute(_toolCallId, { path, content }, signal, _onUpdate, _ctx) {
      const absolutePath = resolveToCwd(path, cwd);
      const dir = dirname(absolutePath);
      return withFileMutationQueue(absolutePath, async () => {
        const throwIfAborted = () => {
          if (signal?.aborted) throw new Error("Operation aborted");
        };
        throwIfAborted();
        await ops.mkdir(dir);
        throwIfAborted();
        await ops.writeFile(absolutePath, content);
        throwIfAborted();
        return {
          content: [{ type: "text", text: `Successfully wrote ${content.length} bytes to ${path}` }],
          details: void 0
        };
      });
    },
    renderCall(args, theme, context) {
      const renderArgs = args;
      const rawPath = str(renderArgs?.file_path ?? renderArgs?.path);
      const fileContent = str(renderArgs?.content);
      const component = context.lastComponent ?? new WriteCallRenderComponent();
      if (fileContent !== null) {
        component.cache = context.argsComplete ? rebuildWriteHighlightCacheFull(rawPath, fileContent) : updateWriteHighlightCacheIncremental(component.cache, rawPath, fileContent);
      } else {
        component.cache = void 0;
      }
      component.setText(
        formatWriteCall(
          renderArgs,
          { expanded: context.expanded, isPartial: context.isPartial },
          theme,
          component.cache,
          context.cwd
        )
      );
      return component;
    },
    renderResult(result, _options, theme, context) {
      const output = formatWriteResult({ ...result, isError: context.isError }, theme);
      if (!output) {
        const component = context.lastComponent ?? new Container();
        component.clear();
        return component;
      }
      const text = context.lastComponent ?? new Text("", 0, 0);
      text.setText(output);
      return text;
    }
  };
}
function createWriteTool(cwd, options) {
  return wrapToolDefinition(createWriteToolDefinition(cwd, options));
}
export {
  createWriteTool,
  createWriteToolDefinition,
  writeToolSystemPromptContribution
};
