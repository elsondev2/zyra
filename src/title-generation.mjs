const DESKTOP_TITLE_PROMPT_PREFIX = "you write concise titles for coding assistant chat sessions.";
const LEGACY_BRIDGE_TITLE_PROMPT_PREFIX = "write a concise title for this coding-assistant chat.";

export function isZyraTitleGenerationPrompt(value) {
  const prompt = String(value || "").trim().toLowerCase();
  return (
    prompt.startsWith(DESKTOP_TITLE_PROMPT_PREFIX)
    && (prompt.includes("\nuser request to title:") || prompt.includes("\nrecent completed turns:") || prompt.includes("\ncompleted conversation:"))
  ) || (
    prompt.startsWith(LEGACY_BRIDGE_TITLE_PROMPT_PREFIX)
    && prompt.includes("\nreturn title text only")
  );
}

export function removeZyraTitleGenerationMessages(messages = []) {
  const visible = [];
  let skipGeneratedResponse = false;
  for (const message of Array.isArray(messages) ? messages : []) {
    if (message?.role === "user" && isZyraTitleGenerationPrompt(messageText(message))) {
      skipGeneratedResponse = true;
      continue;
    }
    if (skipGeneratedResponse && message?.role === "toolResult") continue;
    if (skipGeneratedResponse && message?.role === "assistant") {
      skipGeneratedResponse = false;
      continue;
    }
    if (message?.role === "user") skipGeneratedResponse = false;
    visible.push(message);
  }
  return visible;
}

function messageText(message) {
  if (typeof message?.content === "string") return message.content;
  if (!Array.isArray(message?.content)) return "";
  return message.content
    .filter((part) => part?.type === "text")
    .map((part) => String(part.text || ""))
    .join("\n");
}
