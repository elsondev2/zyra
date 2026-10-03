// Generated from the maintained TypeScript in ../source by scripts/build-owned-runtime.mjs.
import { anthropicMessagesApi } from "./api/anthropic-messages.lazy.js";
import { azureOpenAIResponsesApi } from "./api/azure-openai-responses.lazy.js";
import { googleGenerativeAIApi } from "./api/google-generative-ai.lazy.js";
import { googleVertexApi } from "./api/google-vertex.lazy.js";
import { mistralConversationsApi } from "./api/mistral-conversations.lazy.js";
import { openAICodexResponsesApi } from "./api/openai-codex-responses.lazy.js";
import { openAICompletionsApi } from "./api/openai-completions.lazy.js";
import { openAIResponsesApi } from "./api/openai-responses.lazy.js";
const anthropicMessagesStreams = anthropicMessagesApi();
const azureOpenAIResponsesStreams = azureOpenAIResponsesApi();
const googleGenerativeAIStreams = googleGenerativeAIApi();
const googleVertexStreams = googleVertexApi();
const mistralConversationsStreams = mistralConversationsApi();
const openAICodexResponsesStreams = openAICodexResponsesApi();
const openAICompletionsStreams = openAICompletionsApi();
const openAIResponsesStreams = openAIResponsesApi();
const streamAnthropic = anthropicMessagesStreams.stream;
const streamSimpleAnthropic = anthropicMessagesStreams.streamSimple;
const streamAzureOpenAIResponses = azureOpenAIResponsesStreams.stream;
const streamSimpleAzureOpenAIResponses = azureOpenAIResponsesStreams.streamSimple;
const streamGoogle = googleGenerativeAIStreams.stream;
const streamSimpleGoogle = googleGenerativeAIStreams.streamSimple;
const streamGoogleVertex = googleVertexStreams.stream;
const streamSimpleGoogleVertex = googleVertexStreams.streamSimple;
const streamMistral = mistralConversationsStreams.stream;
const streamSimpleMistral = mistralConversationsStreams.streamSimple;
const streamOpenAICodexResponses = openAICodexResponsesStreams.stream;
const streamSimpleOpenAICodexResponses = openAICodexResponsesStreams.streamSimple;
const streamOpenAICompletions = openAICompletionsStreams.stream;
const streamSimpleOpenAICompletions = openAICompletionsStreams.streamSimple;
const streamOpenAIResponses = openAIResponsesStreams.stream;
const streamSimpleOpenAIResponses = openAIResponsesStreams.streamSimple;
export {
  streamAnthropic,
  streamAzureOpenAIResponses,
  streamGoogle,
  streamGoogleVertex,
  streamMistral,
  streamOpenAICodexResponses,
  streamOpenAICompletions,
  streamOpenAIResponses,
  streamSimpleAnthropic,
  streamSimpleAzureOpenAIResponses,
  streamSimpleGoogle,
  streamSimpleGoogleVertex,
  streamSimpleMistral,
  streamSimpleOpenAICodexResponses,
  streamSimpleOpenAICompletions,
  streamSimpleOpenAIResponses
};
