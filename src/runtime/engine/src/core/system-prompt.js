// Generated from the maintained TypeScript in ../source by scripts/build-owned-runtime.mjs.
import { getDocsPath, getExamplesPath, getReadmePath } from "../config.js";
import { formatSkillsForPrompt } from "./skills.js";
function buildSystemPrompt(options) {
  const {
    customPrompt,
    selectedTools,
    toolSnippets,
    promptGuidelines,
    appendSystemPrompt,
    cwd,
    contextFiles: providedContextFiles,
    skills: providedSkills
  } = options;
  const promptCwd = cwd.replace(/\\/g, "/");
  const appendSection = appendSystemPrompt ? `

${appendSystemPrompt}` : "";
  const contextFiles = providedContextFiles ?? [];
  const skills = providedSkills ?? [];
  if (customPrompt) {
    let prompt2 = customPrompt;
    if (appendSection) {
      prompt2 += appendSection;
    }
    if (contextFiles.length > 0) {
      prompt2 += "\n\n<project_context>\n\n";
      prompt2 += "Project-specific instructions and guidelines:\n\n";
      for (const { path: filePath, content } of contextFiles) {
        prompt2 += `<project_instructions path="${filePath}">
${content}
</project_instructions>

`;
      }
      prompt2 += "</project_context>\n";
    }
    const customPromptHasRead = !selectedTools || selectedTools.includes("read");
    if (customPromptHasRead && skills.length > 0) {
      prompt2 += formatSkillsForPrompt(skills);
    }
    prompt2 += `
Current working directory: ${promptCwd}
`;
    return prompt2;
  }
  const readmePath = getReadmePath();
  const docsPath = getDocsPath();
  const examplesPath = getExamplesPath();
  const tools = selectedTools || ["read", "bash", "edit", "write"];
  const visibleTools = tools.filter((name) => !!toolSnippets?.[name]);
  const toolsList = visibleTools.length > 0 ? visibleTools.map((name) => `- ${name}: ${toolSnippets[name]}`).join("\n") : "(none)";
  const guidelinesList = [];
  const guidelinesSet = /* @__PURE__ */ new Set();
  const addGuideline = (guideline) => {
    if (guidelinesSet.has(guideline)) {
      return;
    }
    guidelinesSet.add(guideline);
    guidelinesList.push(guideline);
  };
  const hasBash = tools.includes("bash");
  const hasPowerShell = tools.includes("powershell");
  const hasGrep = tools.includes("grep");
  const hasFind = tools.includes("find");
  const hasLs = tools.includes("ls");
  const hasRead = tools.includes("read");
  if ((hasBash || hasPowerShell) && !hasGrep && !hasFind && !hasLs) {
    if (hasBash && hasPowerShell) {
      addGuideline("Use bash or PowerShell for file operations like listing, searching, and finding files");
    } else if (hasPowerShell) {
      addGuideline("Use PowerShell for file operations like listing, searching, and finding files");
    } else {
      addGuideline("Use bash for file operations like ls, rg, find");
    }
  }
  for (const guideline of promptGuidelines ?? []) {
    const normalized = guideline.trim();
    if (normalized.length > 0) {
      addGuideline(normalized);
    }
  }
  addGuideline("Be concise in your responses");
  addGuideline("Show file paths clearly when working with files");
  const guidelines = guidelinesList.map((g) => `- ${g}`).join("\n");
  let prompt = `You are an expert coding assistant operating inside Zyra, a coding agent harness. You help users by reading files, executing commands, editing code, and writing new files.

Available tools:
${toolsList}

In addition to the tools above, you may have access to other custom tools depending on the project.

Guidelines:
${guidelines}

Zyra runtime documentation: ${getReadmePath()}. Read the maintained local runtime modules when changing tools, provider transports, extensions, or terminal components.`;
  if (appendSection) {
    prompt += appendSection;
  }
  if (contextFiles.length > 0) {
    prompt += "\n\n<project_context>\n\n";
    prompt += "Project-specific instructions and guidelines:\n\n";
    for (const { path: filePath, content } of contextFiles) {
      prompt += `<project_instructions path="${filePath}">
${content}
</project_instructions>

`;
    }
    prompt += "</project_context>\n";
  }
  if (hasRead && skills.length > 0) {
    prompt += formatSkillsForPrompt(skills);
  }
  prompt += `
Current working directory: ${promptCwd}`;
  return prompt;
}
export {
  buildSystemPrompt
};
