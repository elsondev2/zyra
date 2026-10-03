// Generated from the maintained TypeScript in ../source by scripts/build-owned-runtime.mjs.
import {
  BedrockRuntimeClient,
  BedrockRuntimeServiceException,
  StopReason as BedrockStopReason,
  CachePointType,
  CacheTTL,
  ConversationRole,
  ConverseStreamCommand,
  ImageFormat,
  ToolResultStatus
} from "@aws-sdk/client-bedrock-runtime";
import { NodeHttpHandler } from "@smithy/node-http-handler";
import { HttpProxyAgent } from "http-proxy-agent";
import { HttpsProxyAgent } from "https-proxy-agent";
import { calculateCost } from "../models.js";
import { appendAssistantMessageDiagnostic } from "../utils/diagnostics.js";
import { normalizeProviderError } from "../utils/error-body.js";
import { AssistantMessageEventStream } from "../utils/event-stream.js";
import { providerHeadersToRecord } from "../utils/headers.js";
import { parseStreamingJson } from "../utils/json-parse.js";
import { resolveHttpProxyUrlForTarget } from "../utils/node-http-proxy.js";
import { getProviderEnvValue } from "../utils/provider-env.js";
import { sanitizeSurrogates } from "../utils/sanitize-unicode.js";
import { getJsonSchemaToolParameters, resolveJsonSchemaStrictSampling } from "./constrained-sampling.js";
import {
  adjustMaxTokensForThinking,
  buildBaseOptions,
  clampMaxTokensToContext,
  clampReasoning
} from "./simple-options.js";
import { transformMessages } from "./transform-messages.js";
const EMPTY_TEXT_PLACEHOLDER = "<empty>";
const REDACTED_THINKING_PLACEHOLDER = "[Reasoning redacted]";
const stream = (model, context, options = {}) => {
  const stream2 = new AssistantMessageEventStream();
  (async () => {
    const output = {
      role: "assistant",
      content: [],
      api: "bedrock-converse-stream",
      provider: model.provider,
      model: model.id,
      usage: {
        input: 0,
        output: 0,
        cacheRead: 0,
        cacheWrite: 0,
        totalTokens: 0,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 }
      },
      stopReason: "pending",
      timestamp: Date.now()
    };
    const blocks = output.content;
    const optionsProfile = options.profile || options.env?.AWS_PROFILE;
    const config = {
      profile: optionsProfile || getProviderEnvValue("AWS_PROFILE", options.env)
    };
    const configuredRegion = getConfiguredBedrockRegion(options);
    const hasAmbientConfiguredProfile = Boolean(getProviderEnvValue("AWS_PROFILE"));
    const endpointRegion = getStandardBedrockEndpointRegion(model.baseUrl);
    const useExplicitEndpoint = shouldUseExplicitBedrockEndpoint(
      model.baseUrl,
      configuredRegion,
      hasAmbientConfiguredProfile
    );
    if (useExplicitEndpoint) {
      config.endpoint = model.baseUrl;
    }
    const skipAuth = getProviderEnvValue("AWS_BEDROCK_SKIP_AUTH", options.env) === "1";
    const bearerToken = options.bearerToken || options.apiKey || getProviderEnvValue("AWS_BEARER_TOKEN_BEDROCK", options.env) || void 0;
    const useBearerToken = bearerToken !== void 0 && !skipAuth;
    if (typeof process !== "undefined" && (process.versions?.node || process.versions?.bun)) {
      const arnRegionMatch = model.id.match(/^arn:aws(?:-[a-z0-9-]+)?:bedrock:([a-z0-9-]+):/);
      if (arnRegionMatch) {
        config.region = arnRegionMatch[1];
      } else if (configuredRegion) {
        config.region = configuredRegion;
      } else if (endpointRegion && useExplicitEndpoint) {
        config.region = endpointRegion;
      } else if (!hasAmbientConfiguredProfile) {
        config.region = "us-east-1";
      }
      if (skipAuth) {
        config.credentials = {
          accessKeyId: "dummy-access-key",
          secretAccessKey: "dummy-secret-key"
        };
      }
      const credentials = getConfiguredBedrockCredentials(options.env);
      if (!skipAuth && credentials && !optionsProfile) {
        config.credentials = credentials;
      }
      const proxyUrl = resolveHttpProxyUrlForTarget(model.baseUrl, options.env);
      if (proxyUrl) {
        config.requestHandler = new NodeHttpHandler({
          httpAgent: new HttpProxyAgent(proxyUrl),
          httpsAgent: new HttpsProxyAgent(proxyUrl)
        });
      } else if (getProviderEnvValue("AWS_BEDROCK_FORCE_HTTP1", options.env) === "1") {
        config.requestHandler = new NodeHttpHandler();
      }
    } else {
      config.region = configuredRegion || (endpointRegion && useExplicitEndpoint ? endpointRegion : void 0) || "us-east-1";
    }
    if (useBearerToken) {
      config.token = { token: bearerToken };
      config.authSchemePreference = ["httpBearerAuth"];
    }
    let responseRequestId;
    try {
      const supportsStrictMode = model.compat?.supportsStrictMode ?? false;
      const client = new BedrockRuntimeClient(config);
      let observedRawResponse = false;
      if (options.onResponse) {
        addResponseHeadersMiddleware(client, options.onResponse, model, () => {
          observedRawResponse = true;
        });
      }
      const customHeaders = providerHeadersToRecord(options.headers);
      if (customHeaders) {
        addCustomHeadersMiddleware(client, customHeaders);
      }
      const cacheRetention = resolveCacheRetention(options.cacheRetention, options.env);
      const inferenceMaxTokens = options.maxTokens ?? (isAnthropicClaudeModel(model) ? model.maxTokens : void 0);
      let commandInput = {
        modelId: model.id,
        messages: convertMessages(context, model, cacheRetention, options.env),
        system: buildSystemPrompt(context.systemPrompt, model, cacheRetention, options.env),
        inferenceConfig: {
          ...inferenceMaxTokens !== void 0 && { maxTokens: inferenceMaxTokens },
          ...options.temperature !== void 0 && { temperature: options.temperature }
        },
        toolConfig: convertToolConfig(context.tools, options.toolChoice, supportsStrictMode),
        additionalModelRequestFields: buildAdditionalModelRequestFields(model, options),
        ...options.requestMetadata !== void 0 && { requestMetadata: options.requestMetadata }
      };
      const nextCommandInput = await options?.onPayload?.(commandInput, model);
      if (nextCommandInput !== void 0) {
        commandInput = nextCommandInput;
      }
      const command = new ConverseStreamCommand(commandInput);
      const response = await client.send(command, { abortSignal: options.signal });
      responseRequestId = normalizeDiagnosticValue(response.$metadata.requestId);
      if (!observedRawResponse && response.$metadata.httpStatusCode !== void 0) {
        const responseHeaders = {};
        if (response.$metadata.requestId) {
          responseHeaders["x-amzn-requestid"] = response.$metadata.requestId;
        }
        await options?.onResponse?.({ status: response.$metadata.httpStatusCode, headers: responseHeaders }, model);
      }
      for await (const item of response.stream) {
        if (item.messageStart) {
          if (item.messageStart.role !== ConversationRole.ASSISTANT) {
            throw new Error("Unexpected assistant message start but got user message start instead");
          }
          stream2.push({ type: "start", partial: output });
        } else if (item.contentBlockStart) {
          handleContentBlockStart(item.contentBlockStart, blocks, output, stream2);
        } else if (item.contentBlockDelta) {
          handleContentBlockDelta(item.contentBlockDelta, blocks, output, stream2);
        } else if (item.contentBlockStop) {
          handleContentBlockStop(item.contentBlockStop, blocks, output, stream2);
        } else if (item.messageStop) {
          output.rawStopReason = item.messageStop.stopReason;
          const { stopReason, errorMessage } = mapStopReason(item.messageStop.stopReason);
          output.stopReason = stopReason;
          if (errorMessage) {
            output.errorMessage = errorMessage;
          }
        } else if (item.metadata) {
          handleMetadata(item.metadata, model, output);
        } else if (item.internalServerException) {
          throw item.internalServerException;
        } else if (item.modelStreamErrorException) {
          throw item.modelStreamErrorException;
        } else if (item.validationException) {
          throw item.validationException;
        } else if (item.throttlingException) {
          throw item.throttlingException;
        } else if (item.serviceUnavailableException) {
          throw item.serviceUnavailableException;
        }
      }
      if (options.signal?.aborted) {
        throw new Error("Request was aborted");
      }
      if (output.stopReason === "pending") {
        throw new Error("Bedrock stream ended without a stop reason");
      }
      if (output.stopReason === "error" || output.stopReason === "aborted") {
        throw new Error(output.errorMessage || "An unknown error occurred");
      }
      for (const block of output.content) finalizeStreamingBlock(block);
      stream2.push({ type: "done", reason: output.stopReason, message: output });
      stream2.end();
    } catch (error) {
      for (const block of output.content) {
        finalizeStreamingBlock(block);
      }
      output.stopReason = options.signal?.aborted ? "aborted" : "error";
      output.errorMessage = formatBedrockError(error);
      if (output.stopReason === "error") {
        appendBedrockFailureDiagnostic(output, error, responseRequestId);
      }
      stream2.push({ type: "error", reason: output.stopReason, error: output });
      stream2.end();
    }
  })();
  return stream2;
};
const BEDROCK_ERROR_PREFIXES = {
  InternalServerException: "Internal server error",
  ModelStreamErrorException: "Model stream error",
  ValidationException: "Validation error",
  ThrottlingException: "Throttling error",
  ServiceUnavailableException: "Service unavailable"
};
const BEDROCK_DATA_RETENTION_DOCS_URL = "https://docs.aws.amazon.com/bedrock/latest/userguide/data-retention.html";
function formatBedrockError(error) {
  const norm = normalizeProviderError(error);
  const core = !norm.messageCarriesBody && norm.status !== void 0 && norm.body !== void 0 ? `${norm.status}: ${norm.body}` : norm.message;
  const dataRetentionHint = /data retention mode/i.test(core) ? ` See ${BEDROCK_DATA_RETENTION_DOCS_URL} for supported data retention modes.` : "";
  if (error instanceof BedrockRuntimeServiceException) {
    const prefix = BEDROCK_ERROR_PREFIXES[error.name] ?? error.name;
    return `${prefix}: ${core}${dataRetentionHint}`;
  }
  return `${core}${dataRetentionHint}`;
}
const MAX_BEDROCK_DIAGNOSTIC_VALUE_CHARS = 200;
function normalizeDiagnosticValue(value) {
  if (typeof value !== "string") return void 0;
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > MAX_BEDROCK_DIAGNOSTIC_VALUE_CHARS) return void 0;
  return trimmed;
}
function extractBedrockErrorCode(error) {
  if (!(error instanceof Error) || !error.name.endsWith("Exception")) return void 0;
  return normalizeDiagnosticValue(error.name);
}
function appendBedrockFailureDiagnostic(output, error, fallbackRequestId) {
  const metadata = error?.$metadata;
  const details = {};
  if (typeof metadata?.httpStatusCode === "number") details.status = metadata.httpStatusCode;
  const errorCode = extractBedrockErrorCode(error);
  if (errorCode !== void 0) details.errorCode = errorCode;
  const requestId = normalizeDiagnosticValue(metadata?.requestId) ?? fallbackRequestId;
  if (requestId !== void 0) details.requestId = requestId;
  if (Object.keys(details).length === 0) return;
  appendAssistantMessageDiagnostic(output, { type: "bedrock_response_failure", timestamp: Date.now(), details });
}
const RESERVED_HEADER_EXACT = /* @__PURE__ */ new Set(["authorization", "host"]);
function isReservedHeader(key) {
  const lower = key.toLowerCase();
  return lower.startsWith("x-amz-") || RESERVED_HEADER_EXACT.has(lower);
}
function addCustomHeadersMiddleware(client, headers) {
  const middleware = (next) => async (args) => {
    const request = args.request;
    if (request && typeof request === "object" && "headers" in request) {
      const requestHeaders = request.headers;
      for (const [key, value] of Object.entries(headers)) {
        if (!isReservedHeader(key)) {
          requestHeaders[key] = value;
        }
      }
    }
    return next(args);
  };
  client.middlewareStack.add(middleware, { step: "build", name: "pi-ai-custom-headers", priority: "low" });
}
function isSmithyHttpResponse(response) {
  if (!response || typeof response !== "object") return false;
  const candidate = response;
  return typeof candidate.statusCode === "number" && !!candidate.headers && typeof candidate.headers === "object";
}
function toProviderResponse(response) {
  if (!isSmithyHttpResponse(response)) return void 0;
  return { status: response.statusCode, headers: { ...response.headers } };
}
function addResponseHeadersMiddleware(client, onResponse, model, onObserved) {
  const middleware = (next) => async (args) => {
    const result = await next(args);
    const providerResponse = toProviderResponse(result.response);
    if (providerResponse) {
      onObserved();
      await onResponse(providerResponse, model);
    }
    return result;
  };
  client.middlewareStack.add(middleware, { step: "deserialize", name: "pi-ai-response-headers" });
}
const streamSimple = (model, context, options) => {
  const base = {
    ...buildBaseOptions(model, context, options, void 0),
    toolChoice: options?.toolChoice
  };
  if (!options?.reasoning) {
    return stream(model, context, { ...base, reasoning: void 0 });
  }
  if (isAnthropicClaudeModel(model)) {
    if (supportsAdaptiveThinking(model.id, model.name)) {
      return stream(model, context, {
        ...base,
        reasoning: options.reasoning,
        thinkingBudgets: options.thinkingBudgets
      });
    }
    const adjusted = adjustMaxTokensForThinking(
      base.maxTokens,
      model.maxTokens,
      options.reasoning,
      options.thinkingBudgets
    );
    const maxTokens = clampMaxTokensToContext(model, context, adjusted.maxTokens);
    return stream(model, context, {
      ...base,
      maxTokens,
      reasoning: options.reasoning,
      thinkingBudgets: {
        ...options.thinkingBudgets || {},
        [clampReasoning(options.reasoning)]: Math.min(adjusted.thinkingBudget, Math.max(0, maxTokens - 1024))
      }
    });
  }
  return stream(model, context, {
    ...base,
    reasoning: options.reasoning,
    thinkingBudgets: options.thinkingBudgets
  });
};
function handleContentBlockStart(event, blocks, output, stream2) {
  const index = event.contentBlockIndex;
  const start = event.start;
  if (start?.toolUse) {
    const block = {
      type: "toolCall",
      id: start.toolUse.toolUseId || "",
      name: start.toolUse.name || "",
      arguments: {},
      partialJson: "",
      index
    };
    output.content.push(block);
    stream2.push({ type: "toolcall_start", contentIndex: blocks.length - 1, partial: output });
  }
}
function handleContentBlockDelta(event, blocks, output, stream2) {
  const contentBlockIndex = event.contentBlockIndex;
  const delta = event.delta;
  let index = blocks.findIndex((b) => b.index === contentBlockIndex);
  let block = blocks[index];
  if (delta?.text !== void 0) {
    if (!block) {
      const newBlock = { type: "text", text: "", index: contentBlockIndex };
      output.content.push(newBlock);
      index = blocks.length - 1;
      block = blocks[index];
      stream2.push({ type: "text_start", contentIndex: index, partial: output });
    }
    if (block.type === "text") {
      block.text += delta.text;
      stream2.push({ type: "text_delta", contentIndex: index, delta: delta.text, partial: output });
    }
  } else if (delta?.toolUse && block?.type === "toolCall") {
    block.partialJson = (block.partialJson || "") + (delta.toolUse.input || "");
    block.arguments = parseStreamingJson(block.partialJson);
    stream2.push({ type: "toolcall_delta", contentIndex: index, delta: delta.toolUse.input || "", partial: output });
  } else if (delta?.reasoningContent) {
    let thinkingBlock = block;
    let thinkingIndex = index;
    if (!thinkingBlock) {
      const newBlock = { type: "thinking", thinking: "", thinkingSignature: "", index: contentBlockIndex };
      output.content.push(newBlock);
      thinkingIndex = blocks.length - 1;
      thinkingBlock = blocks[thinkingIndex];
      stream2.push({ type: "thinking_start", contentIndex: thinkingIndex, partial: output });
    }
    if (thinkingBlock?.type === "thinking") {
      if (delta.reasoningContent.text) {
        thinkingBlock.thinking += delta.reasoningContent.text;
        stream2.push({
          type: "thinking_delta",
          contentIndex: thinkingIndex,
          delta: delta.reasoningContent.text,
          partial: output
        });
      }
      if (delta.reasoningContent.signature && !thinkingBlock.redacted) {
        thinkingBlock.thinkingSignature = (thinkingBlock.thinkingSignature || "") + delta.reasoningContent.signature;
      }
      if (delta.reasoningContent.redactedContent?.length) {
        if (!thinkingBlock.redacted) {
          thinkingBlock.redacted = true;
          thinkingBlock.thinkingSignature = "";
          thinkingBlock.thinking += REDACTED_THINKING_PLACEHOLDER;
          stream2.push({
            type: "thinking_delta",
            contentIndex: thinkingIndex,
            delta: REDACTED_THINKING_PLACEHOLDER,
            partial: output
          });
        }
        thinkingBlock.redactedChunks ??= [];
        thinkingBlock.redactedChunks.push(delta.reasoningContent.redactedContent);
      }
    }
  }
}
function flushRedactedContent(block) {
  if (block.type !== "thinking" || !block.redactedChunks) return;
  block.thinkingSignature = bytesToBase64(block.redactedChunks);
  delete block.redactedChunks;
}
function finalizeStreamingBlock(block) {
  delete block.index;
  delete block.partialJson;
  flushRedactedContent(block);
}
function handleMetadata(event, model, output) {
  if (event.usage) {
    output.usage.input = event.usage.inputTokens || 0;
    output.usage.output = event.usage.outputTokens || 0;
    output.usage.cacheRead = event.usage.cacheReadInputTokens || 0;
    output.usage.cacheWrite = event.usage.cacheWriteInputTokens || 0;
    output.usage.totalTokens = event.usage.totalTokens || output.usage.input + output.usage.output;
    calculateCost(model, output.usage);
  }
}
function handleContentBlockStop(event, blocks, output, stream2) {
  const index = blocks.findIndex((b) => b.index === event.contentBlockIndex);
  const block = blocks[index];
  if (!block) return;
  delete block.index;
  switch (block.type) {
    case "text":
      stream2.push({ type: "text_end", contentIndex: index, content: block.text, partial: output });
      break;
    case "thinking":
      flushRedactedContent(block);
      stream2.push({ type: "thinking_end", contentIndex: index, content: block.thinking, partial: output });
      break;
    case "toolCall":
      block.arguments = parseStreamingJson(block.partialJson);
      delete block.partialJson;
      stream2.push({ type: "toolcall_end", contentIndex: index, toolCall: block, partial: output });
      break;
  }
}
function getModelMatchCandidates(modelId, modelName) {
  const values = modelName ? [modelId, modelName] : [modelId];
  return values.flatMap((value) => {
    const lower = value.toLowerCase();
    return [lower, lower.replace(/[\s_.:]+/g, "-")];
  });
}
function supportsAdaptiveThinking(modelId, modelName) {
  const candidates = getModelMatchCandidates(modelId, modelName);
  return candidates.some(
    (s) => s.includes("opus-4-6") || s.includes("opus-4-7") || s.includes("opus-4-8") || s.includes("opus-5") || s.includes("sonnet-4-6") || s.includes("sonnet-5") || s.includes("fable-5")
  );
}
function supportsNativeXhighEffort(model) {
  const candidates = getModelMatchCandidates(model.id, model.name);
  return candidates.some(
    (s) => s.includes("opus-4-7") || s.includes("opus-4-8") || s.includes("opus-5") || s.includes("sonnet-5") || s.includes("fable-5")
  );
}
function mapThinkingLevelToEffort(model, level) {
  if (level === "xhigh" && supportsNativeXhighEffort(model)) return "xhigh";
  const mapped = level ? model.thinkingLevelMap?.[level] : void 0;
  if (typeof mapped === "string") return mapped;
  switch (level) {
    case "minimal":
    case "low":
      return "low";
    case "medium":
      return "medium";
    case "high":
      return "high";
    default:
      return "high";
  }
}
function resolveCacheRetention(cacheRetention, env) {
  if (cacheRetention) {
    return cacheRetention;
  }
  if (getProviderEnvValue("ZYRA_CACHE_RETENTION", env) === "long") {
    return "long";
  }
  return "short";
}
function isAnthropicClaudeModel(model) {
  const id = model.id.toLowerCase();
  const name = model.name?.toLowerCase() ?? "";
  return id.includes("anthropic.claude") || id.includes("anthropic/claude") || name.includes("anthropic.claude") || name.includes("anthropic/claude") || name.includes("claude");
}
function supportsPromptCaching(model, env) {
  const candidates = getModelMatchCandidates(model.id, model.name);
  const hasClaudeRef = candidates.some((s) => s.includes("claude"));
  if (!hasClaudeRef) {
    if (getProviderEnvValue("AWS_BEDROCK_FORCE_CACHE", env) === "1") return true;
    return false;
  }
  if (candidates.some((s) => s.includes("fable-5") || s.includes("opus-5") || s.includes("sonnet-5"))) return true;
  if (candidates.some((s) => s.includes("-4-"))) return true;
  if (candidates.some((s) => s.includes("claude-3-7-sonnet"))) return true;
  if (candidates.some((s) => s.includes("claude-3-5-haiku"))) return true;
  return false;
}
function supportsThinkingSignature(model) {
  return isAnthropicClaudeModel(model);
}
function buildSystemPrompt(systemPrompt, model, cacheRetention, env) {
  if (!systemPrompt) return void 0;
  const blocks = [{ text: sanitizeSurrogates(systemPrompt) }];
  if (cacheRetention !== "none" && supportsPromptCaching(model, env)) {
    blocks.push({
      cachePoint: { type: CachePointType.DEFAULT, ...cacheRetention === "long" ? { ttl: CacheTTL.ONE_HOUR } : {} }
    });
  }
  return blocks;
}
function normalizeToolCallId(id) {
  const sanitized = id.replace(/[^a-zA-Z0-9_-]/g, "_");
  return sanitized.length > 64 ? sanitized.slice(0, 64) : sanitized;
}
function createNonBlankTextBlock(text) {
  const sanitized = sanitizeSurrogates(text);
  return sanitized.trim().length === 0 ? void 0 : { text: sanitized };
}
function createRequiredTextBlock(text) {
  return createNonBlankTextBlock(text) ?? { text: EMPTY_TEXT_PLACEHOLDER };
}
function sanitizeBedrockDocument(value) {
  if (Array.isArray(value)) {
    return value.map(sanitizeBedrockDocument);
  }
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).filter(([key]) => key.length > 0).map(([key, nestedValue]) => [key, sanitizeBedrockDocument(nestedValue)])
    );
  }
  return value;
}
function convertToolResultContent(content) {
  const result = [];
  for (const c of content) {
    if (c.type === "image") {
      result.push({ image: createImageBlock(c.mimeType, c.data) });
    } else {
      const textBlock = createNonBlankTextBlock(c.text);
      if (textBlock) result.push(textBlock);
    }
  }
  if (result.length === 0) result.push({ text: EMPTY_TEXT_PLACEHOLDER });
  return result;
}
function convertMessages(context, model, cacheRetention, env) {
  const result = [];
  const transformedMessages = transformMessages(context.messages, model, normalizeToolCallId);
  for (let i = 0; i < transformedMessages.length; i++) {
    const m = transformedMessages[i];
    switch (m.role) {
      case "user": {
        const content = [];
        if (typeof m.content === "string") {
          content.push(createRequiredTextBlock(m.content));
        } else {
          for (const c of m.content) {
            switch (c.type) {
              case "text": {
                const textBlock = createNonBlankTextBlock(c.text);
                if (textBlock) content.push(textBlock);
                break;
              }
              case "image":
                content.push({ image: createImageBlock(c.mimeType, c.data) });
                break;
              default:
                continue;
            }
          }
          if (content.length === 0) content.push({ text: EMPTY_TEXT_PLACEHOLDER });
        }
        result.push({
          role: ConversationRole.USER,
          content
        });
        break;
      }
      case "assistant": {
        if (m.content.length === 0) {
          continue;
        }
        const contentBlocks = [];
        for (const c of m.content) {
          switch (c.type) {
            case "text": {
              const textBlock = createNonBlankTextBlock(c.text);
              if (!textBlock) continue;
              contentBlocks.push(textBlock);
              break;
            }
            case "toolCall":
              contentBlocks.push({
                toolUse: { toolUseId: c.id, name: c.name, input: sanitizeBedrockDocument(c.arguments) }
              });
              break;
            case "thinking": {
              if (c.redacted) {
                const redactedContent = decodeRedactedContent(c.thinkingSignature);
                if (redactedContent?.length) {
                  contentBlocks.push({ reasoningContent: { redactedContent } });
                }
                continue;
              }
              const thinking = sanitizeSurrogates(c.thinking);
              if (thinking.trim().length === 0) continue;
              if (supportsThinkingSignature(model)) {
                if (!c.thinkingSignature || c.thinkingSignature.trim().length === 0) {
                  contentBlocks.push({ text: thinking });
                } else {
                  contentBlocks.push({
                    reasoningContent: {
                      reasoningText: {
                        text: thinking,
                        signature: c.thinkingSignature
                      }
                    }
                  });
                }
              } else {
                contentBlocks.push({
                  reasoningContent: {
                    reasoningText: { text: thinking }
                  }
                });
              }
              break;
            }
            default:
              continue;
          }
        }
        if (contentBlocks.length === 0) {
          continue;
        }
        result.push({
          role: ConversationRole.ASSISTANT,
          content: contentBlocks
        });
        break;
      }
      case "toolResult": {
        const toolResults = [];
        toolResults.push({
          toolResult: {
            toolUseId: m.toolCallId,
            content: convertToolResultContent(m.content),
            status: m.isError ? ToolResultStatus.ERROR : ToolResultStatus.SUCCESS
          }
        });
        let j = i + 1;
        while (j < transformedMessages.length && transformedMessages[j].role === "toolResult") {
          const nextMsg = transformedMessages[j];
          toolResults.push({
            toolResult: {
              toolUseId: nextMsg.toolCallId,
              content: convertToolResultContent(nextMsg.content),
              status: nextMsg.isError ? ToolResultStatus.ERROR : ToolResultStatus.SUCCESS
            }
          });
          j++;
        }
        i = j - 1;
        result.push({
          role: ConversationRole.USER,
          content: toolResults
        });
        break;
      }
      default:
        continue;
    }
  }
  if (cacheRetention !== "none" && supportsPromptCaching(model, env) && result.length > 0) {
    const lastMessage = result[result.length - 1];
    if (lastMessage.role === ConversationRole.USER && lastMessage.content) {
      lastMessage.content.push({
        cachePoint: {
          type: CachePointType.DEFAULT,
          ...cacheRetention === "long" ? { ttl: CacheTTL.ONE_HOUR } : {}
        }
      });
    }
  }
  return result;
}
function convertToolConfig(tools, toolChoice, supportsStrictMode) {
  if (!tools?.length) return void 0;
  if (toolChoice === "none") return void 0;
  const bedrockTools = tools.map((tool) => {
    const strict = resolveJsonSchemaStrictSampling(tool, supportsStrictMode);
    return {
      toolSpec: {
        name: tool.name,
        description: tool.description,
        inputSchema: { json: getJsonSchemaToolParameters(tool, strict) },
        ...strict === true ? { strict: true } : {}
      }
    };
  });
  let bedrockToolChoice;
  switch (toolChoice) {
    case "auto":
      bedrockToolChoice = { auto: {} };
      break;
    case "any":
      bedrockToolChoice = { any: {} };
      break;
    default:
      if (toolChoice?.type === "tool") {
        bedrockToolChoice = { tool: { name: toolChoice.name } };
      }
  }
  return { tools: bedrockTools, toolChoice: bedrockToolChoice };
}
function mapStopReason(reason) {
  switch (reason) {
    case BedrockStopReason.END_TURN:
    case BedrockStopReason.STOP_SEQUENCE:
      return { stopReason: "stop" };
    case BedrockStopReason.MAX_TOKENS:
    case BedrockStopReason.MODEL_CONTEXT_WINDOW_EXCEEDED:
      return { stopReason: "length" };
    case BedrockStopReason.TOOL_USE:
      return { stopReason: "toolUse" };
    default:
      return reason ? { stopReason: "error", errorMessage: `Provider stopped with: ${reason}` } : { stopReason: "error" };
  }
}
function getConfiguredBedrockRegion(options) {
  return options.region || getProviderEnvValue("AWS_REGION", options.env) || getProviderEnvValue("AWS_DEFAULT_REGION", options.env) || void 0;
}
function getConfiguredBedrockCredentials(env) {
  const accessKeyId = getProviderEnvValue("AWS_ACCESS_KEY_ID", env);
  const secretAccessKey = getProviderEnvValue("AWS_SECRET_ACCESS_KEY", env);
  if (!accessKeyId || !secretAccessKey) {
    return void 0;
  }
  const sessionToken = getProviderEnvValue("AWS_SESSION_TOKEN", env);
  return {
    accessKeyId,
    secretAccessKey,
    ...sessionToken ? { sessionToken } : {}
  };
}
function getStandardBedrockEndpointRegion(baseUrl) {
  if (!baseUrl) {
    return void 0;
  }
  try {
    const { hostname } = new URL(baseUrl);
    const match = hostname.toLowerCase().match(/^bedrock-runtime(?:-fips)?\.([a-z0-9-]+)\.amazonaws\.com(?:\.cn)?$/);
    return match?.[1];
  } catch {
    return void 0;
  }
}
function shouldUseExplicitBedrockEndpoint(baseUrl, configuredRegion, hasAmbientConfiguredProfile) {
  const endpointRegion = getStandardBedrockEndpointRegion(baseUrl);
  if (!endpointRegion) {
    return true;
  }
  return !configuredRegion && !hasAmbientConfiguredProfile;
}
function isGovCloudBedrockTarget(model, options) {
  const region = getConfiguredBedrockRegion(options);
  if (region?.toLowerCase().startsWith("us-gov-")) {
    return true;
  }
  const modelId = model.id.toLowerCase();
  return modelId.startsWith("us-gov.") || modelId.startsWith("arn:aws-us-gov:");
}
function buildAdditionalModelRequestFields(model, options) {
  if (!options.reasoning || !model.reasoning) {
    return void 0;
  }
  if (isAnthropicClaudeModel(model)) {
    const display = isGovCloudBedrockTarget(model, options) ? void 0 : options.thinkingDisplay ?? "summarized";
    const result = supportsAdaptiveThinking(model.id, model.name) ? {
      thinking: { type: "adaptive", ...display !== void 0 ? { display } : {} },
      output_config: { effort: mapThinkingLevelToEffort(model, options.reasoning) }
    } : (() => {
      const defaultBudgets = {
        minimal: 1024,
        low: 2048,
        medium: 8192,
        high: 16384,
        xhigh: 16384,
        // Budget-based Claude clamps extended levels to high
        max: 16384
      };
      const level = options.reasoning === "xhigh" || options.reasoning === "max" ? "high" : options.reasoning;
      const budget = options.thinkingBudgets?.[level] ?? defaultBudgets[options.reasoning];
      return {
        thinking: {
          type: "enabled",
          budget_tokens: budget,
          ...display !== void 0 ? { display } : {}
        }
      };
    })();
    if (!supportsAdaptiveThinking(model.id, model.name) && (options.interleavedThinking ?? true)) {
      result.anthropic_beta = ["interleaved-thinking-2025-05-14"];
    }
    return result;
  }
  return void 0;
}
function createImageBlock(mimeType, data) {
  let format;
  switch (mimeType) {
    case "image/jpeg":
    case "image/jpg":
      format = ImageFormat.JPEG;
      break;
    case "image/png":
      format = ImageFormat.PNG;
      break;
    case "image/gif":
      format = ImageFormat.GIF;
      break;
    case "image/webp":
      format = ImageFormat.WEBP;
      break;
    default:
      throw new Error(`Unknown image type: ${mimeType}`);
  }
  return { source: { bytes: base64ToBytes(data) }, format };
}
function base64ToBytes(data) {
  const binaryString = atob(data);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}
function decodeRedactedContent(signature) {
  if (!signature) return void 0;
  try {
    return base64ToBytes(signature);
  } catch {
    return void 0;
  }
}
function bytesToBase64(chunks) {
  const WINDOW = 32768;
  let binary = "";
  for (const chunk of chunks) {
    for (let i = 0; i < chunk.length; i += WINDOW) {
      binary += String.fromCharCode(...chunk.subarray(i, i + WINDOW));
    }
  }
  return btoa(binary);
}
export {
  stream,
  streamSimple
};
