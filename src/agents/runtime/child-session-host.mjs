import { addUsage, normalizeUsage } from "../contracts.mjs";
import { usageFromAssistantMessage } from "../usage-accounting.mjs";

export class ChildSessionHost {
  constructor(options = {}) {
    this.factory = options.factory;
    this.onEvent = options.onEvent ?? (() => {});
    this.onActivity = options.onActivity ?? (() => {});
    this.sessionResult = null;
    this.unsubscribe = null;
    this.usage = normalizeUsage();
    this.turns = 0;
    this.turnsStarted = 0;
    this.maxTurns = Math.max(1, Number(options.maxTurns) || 12);
    this.lastAssistantText = "";
    this.abortingForLimit = false;
    this.sendChain = Promise.resolve();
  }

  async open(options = {}) {
    if (!this.factory) throw new Error("ChildSessionHost requires a session factory.");
    this.sessionResult = await this.factory.create(options);
    this.unsubscribe = this.sessionResult.session.subscribe((event) => this.handleEvent(event));
    return {
      sessionId: this.sessionResult.sessionId,
      sessionFile: this.sessionResult.sessionFile,
      modelFallbackMessage: this.sessionResult.modelFallbackMessage,
    };
  }

  async run(prompt, options = {}) {
    const session = this.requireSession();
    if (options.signal?.aborted) throw abortError(options.signal.reason);
    const abortListener = () => void session.abort?.();
    options.signal?.addEventListener("abort", abortListener, { once: true });
    try {
      this.reserveTurn();
      await session.prompt(String(prompt), { source: "print" });
      if (options.signal?.aborted) throw abortError(options.signal.reason);
      return this.resultSnapshot();
    } finally {
      options.signal?.removeEventListener("abort", abortListener);
    }
  }

  async send(message) {
    const deliver = this.sendChain.then(async () => {
      const session = this.requireSession();
      if (session.isStreaming) {
        await session.steer(String(message));
        return this.resultSnapshot("steer");
      }
      this.reserveTurn();
      await session.prompt(String(message), { source: "interactive" });
      return this.resultSnapshot("follow-up");
    });
    this.sendChain = deliver.catch(() => {});
    return deliver;
  }

  reserveTurn() {
    if (this.turnsStarted >= this.maxTurns) {
      const error = new Error(`Child agent reached its ${this.maxTurns}-turn limit.`);
      error.code = "CHILD_MAX_TURNS";
      throw error;
    }
    this.turnsStarted += 1;
  }

  resultSnapshot(mode) {
    const session = this.requireSession();
    return {
      ...(mode ? { mode } : {}),
      text: this.lastAssistantText || extractLatestAssistantText(session.messages),
      usage: normalizeUsage(this.usage),
      sessionId: this.sessionResult.sessionId,
      sessionFile: this.sessionResult.sessionFile,
      turns: this.turns,
    };
  }

  async abort(reason = "cancelled") {
    await this.sessionResult?.session?.abort?.();
    void reason;
  }

  dispose() {
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.sessionResult?.session?.dispose?.();
    this.sessionResult = null;
  }

  handleEvent(event) {
    this.onEvent(event);
    if (event?.type === "turn_end") {
      this.turns += 1;
      if (this.turns >= this.maxTurns && this.sessionResult?.session?.isStreaming && !this.abortingForLimit) {
        this.abortingForLimit = true;
        void this.sessionResult.session.abort().finally(() => { this.abortingForLimit = false; });
      }
    }
    if (event?.type === "message_end" && event.message?.role === "assistant") {
      this.lastAssistantText = extractMessageText(event.message);
      this.usage = addUsage(this.usage, usageFromAssistantMessage(event.message));
    }
    if (["tool_execution_start", "tool_execution_update", "tool_execution_end"].includes(event?.type)) {
      this.onActivity({
        type: event.type,
        toolCallId: event.toolCallId ?? event.id,
        toolName: event.toolName ?? event.name,
        args: boundValue(event.args ?? event.arguments, 16 * 1024),
        result: event.type === "tool_execution_end" ? boundValue(event.result, 16 * 1024) : undefined,
        isError: Boolean(event.isError),
        occurredAt: new Date().toISOString(),
      });
    }
  }

  requireSession() {
    if (!this.sessionResult?.session) throw new Error("Child session is not open.");
    return this.sessionResult.session;
  }
}

function extractLatestAssistantText(messages = []) {
  const message = [...(messages ?? [])].reverse().find((entry) => entry?.role === "assistant");
  return extractMessageText(message);
}

function extractMessageText(message = {}) {
  if (typeof message.content === "string") return message.content;
  return (Array.isArray(message.content) ? message.content : [])
    .filter((part) => part?.type === "text")
    .map((part) => String(part.text ?? ""))
    .join("");
}

function boundValue(value, maxBytes) {
  if (value === undefined) return undefined;
  try {
    const text = JSON.stringify(value);
    if (Buffer.byteLength(text, "utf8") <= maxBytes) return JSON.parse(text);
    return { truncated: true, bytes: Buffer.byteLength(text, "utf8") };
  } catch {
    return String(value).slice(0, maxBytes);
  }
}

function abortError(reason) {
  const error = new Error(`Child agent cancelled${reason ? `: ${reason}` : ""}.`);
  error.name = "AbortError";
  return error;
}
