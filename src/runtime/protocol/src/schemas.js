// Generated from the maintained TypeScript in ../source by scripts/build-owned-runtime.mjs.
import Type from "typebox";
const PROTOCOL_VERSION = 1;
const IdSchema = Type.String({ minLength: 1 });
const TimestampSchema = Type.Integer({ minimum: 0 });
const StrictObject = (properties) => Type.Object(properties, { additionalProperties: false });
const JsonValueRecursiveSchema = Type.Cyclic(
  {
    JsonValue: Type.Union([
      Type.Null(),
      Type.Boolean(),
      Type.Number(),
      Type.String(),
      Type.Array(Type.Ref("JsonValue")),
      Type.Record(Type.String(), Type.Ref("JsonValue"))
    ])
  },
  "JsonValue"
);
const JsonValueSchema = Type.Unsafe(JsonValueRecursiveSchema);
const ThinkingLevelSchema = Type.Union([
  Type.Literal("off"),
  Type.Literal("minimal"),
  Type.Literal("low"),
  Type.Literal("medium"),
  Type.Literal("high"),
  Type.Literal("xhigh"),
  Type.Literal("max")
]);
const SessionPhaseSchema = Type.Union([
  Type.Literal("idle"),
  Type.Literal("turn"),
  Type.Literal("compaction"),
  Type.Literal("branch_summary"),
  Type.Literal("retry")
]);
const ModelRefSchema = StrictObject({
  provider: IdSchema,
  id: IdSchema
});
const ModelCostSchema = StrictObject({
  input: Type.Number({ minimum: 0 }),
  output: Type.Number({ minimum: 0 }),
  cacheRead: Type.Number({ minimum: 0 }),
  cacheWrite: Type.Number({ minimum: 0 })
});
const ModelMetadataSchema = StrictObject({
  provider: IdSchema,
  id: IdSchema,
  name: Type.String({ minLength: 1 }),
  api: IdSchema,
  reasoning: Type.Boolean(),
  input: Type.Array(Type.Union([Type.Literal("text"), Type.Literal("image")])),
  contextWindow: Type.Integer({ minimum: 1 }),
  maxTokens: Type.Integer({ minimum: 1 }),
  cost: ModelCostSchema,
  supportedThinkingLevels: Type.Array(ThinkingLevelSchema, { minItems: 1 }),
  authenticated: Type.Boolean()
});
const TextContentSchema = StrictObject({
  type: Type.Literal("text"),
  text: Type.String()
});
const ThinkingContentSchema = StrictObject({
  type: Type.Literal("thinking"),
  thinking: Type.String(),
  redacted: Type.Optional(Type.Boolean())
});
const ImageContentSchema = StrictObject({
  type: Type.Literal("image"),
  data: Type.String(),
  mimeType: Type.String({ minLength: 1 })
});
const ToolCallContentSchema = StrictObject({
  type: Type.Literal("toolCall"),
  toolCallId: IdSchema,
  toolName: IdSchema,
  input: JsonValueSchema
});
const UserContentSchema = Type.Union([TextContentSchema, ImageContentSchema]);
const AssistantContentSchema = Type.Union([TextContentSchema, ThinkingContentSchema, ToolCallContentSchema]);
const ToolContentSchema = Type.Union([TextContentSchema, ImageContentSchema]);
const UsageSchema = StrictObject({
  input: Type.Integer({ minimum: 0 }),
  output: Type.Integer({ minimum: 0 }),
  cacheRead: Type.Integer({ minimum: 0 }),
  cacheWrite: Type.Integer({ minimum: 0 }),
  reasoning: Type.Optional(Type.Integer({ minimum: 0 })),
  totalTokens: Type.Integer({ minimum: 0 }),
  cost: StrictObject({
    input: Type.Number({ minimum: 0 }),
    output: Type.Number({ minimum: 0 }),
    cacheRead: Type.Number({ minimum: 0 }),
    cacheWrite: Type.Number({ minimum: 0 }),
    total: Type.Number({ minimum: 0 })
  })
});
const UserTranscriptItemSchema = StrictObject({
  id: IdSchema,
  role: Type.Literal("user"),
  content: Type.Array(UserContentSchema),
  timestamp: TimestampSchema
});
const AssistantTranscriptItemProperties = {
  id: IdSchema,
  role: Type.Literal("assistant"),
  content: Type.Array(AssistantContentSchema),
  model: ModelRefSchema,
  responseModel: Type.Optional(Type.String({ minLength: 1 })),
  usage: Type.Optional(UsageSchema),
  timestamp: TimestampSchema
};
const StreamingAssistantTranscriptItemSchema = StrictObject({
  ...AssistantTranscriptItemProperties,
  status: Type.Literal("streaming")
});
const CompleteAssistantTranscriptItemSchema = StrictObject({
  ...AssistantTranscriptItemProperties,
  status: Type.Literal("complete"),
  stopReason: Type.Union([Type.Literal("stop"), Type.Literal("length"), Type.Literal("toolUse")])
});
const ErrorAssistantTranscriptItemSchema = StrictObject({
  ...AssistantTranscriptItemProperties,
  status: Type.Literal("error"),
  stopReason: Type.Literal("error"),
  errorMessage: Type.Optional(Type.String({ minLength: 1 }))
});
const AbortedAssistantTranscriptItemSchema = StrictObject({
  ...AssistantTranscriptItemProperties,
  status: Type.Literal("aborted"),
  stopReason: Type.Literal("aborted"),
  errorMessage: Type.Optional(Type.String())
});
const AssistantTranscriptItemSchema = Type.Union([
  StreamingAssistantTranscriptItemSchema,
  CompleteAssistantTranscriptItemSchema,
  ErrorAssistantTranscriptItemSchema,
  AbortedAssistantTranscriptItemSchema
]);
const ToolTranscriptItemProperties = {
  id: IdSchema,
  role: Type.Literal("tool"),
  toolCallId: IdSchema,
  toolName: IdSchema,
  input: JsonValueSchema,
  content: Type.Array(ToolContentSchema),
  details: Type.Optional(JsonValueSchema),
  usage: Type.Optional(UsageSchema),
  timestamp: TimestampSchema
};
const RunningToolTranscriptItemSchema = StrictObject({
  ...ToolTranscriptItemProperties,
  status: Type.Literal("running"),
  isError: Type.Literal(false)
});
const CompleteToolTranscriptItemSchema = StrictObject({
  ...ToolTranscriptItemProperties,
  status: Type.Literal("complete"),
  isError: Type.Literal(false)
});
const ErrorToolTranscriptItemSchema = StrictObject({
  ...ToolTranscriptItemProperties,
  status: Type.Literal("error"),
  isError: Type.Literal(true)
});
const ToolTranscriptItemSchema = Type.Union([
  RunningToolTranscriptItemSchema,
  CompleteToolTranscriptItemSchema,
  ErrorToolTranscriptItemSchema
]);
const TranscriptItemSchema = Type.Union([
  UserTranscriptItemSchema,
  AssistantTranscriptItemSchema,
  ToolTranscriptItemSchema
]);
const TranscriptProgressSchema = Type.Union([
  StrictObject({
    type: Type.Literal("item_started"),
    item: TranscriptItemSchema
  }),
  StrictObject({
    type: Type.Literal("assistant_delta"),
    messageId: IdSchema,
    contentIndex: Type.Integer({ minimum: 0 }),
    kind: Type.Union([Type.Literal("text"), Type.Literal("thinking"), Type.Literal("toolCall")]),
    delta: Type.String()
  }),
  StrictObject({
    type: Type.Literal("item_updated"),
    item: Type.Union([AssistantTranscriptItemSchema, ToolTranscriptItemSchema])
  }),
  StrictObject({
    type: Type.Literal("item_finished"),
    item: Type.Union([
      CompleteAssistantTranscriptItemSchema,
      ErrorAssistantTranscriptItemSchema,
      AbortedAssistantTranscriptItemSchema,
      CompleteToolTranscriptItemSchema,
      ErrorToolTranscriptItemSchema
    ])
  })
]);
const SessionMetadataSchema = StrictObject({
  id: IdSchema,
  createdAt: TimestampSchema,
  updatedAt: Type.Optional(TimestampSchema),
  parentSessionId: Type.Optional(IdSchema),
  sessionName: Type.Optional(Type.String()),
  cwd: Type.Optional(Type.String({ minLength: 1 }))
});
const SessionSnapshotSchema = StrictObject({
  id: IdSchema,
  name: Type.Optional(Type.String()),
  cwd: Type.String({ minLength: 1 }),
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
  phase: SessionPhaseSchema,
  model: ModelRefSchema,
  thinkingLevel: ThinkingLevelSchema,
  attached: Type.Boolean(),
  locked: Type.Boolean(),
  revision: Type.Integer({ minimum: 0 }),
  transcript: Type.Array(TranscriptItemSchema),
  queuedSteer: Type.Array(UserTranscriptItemSchema),
  queuedSteerCount: Type.Integer({ minimum: 0 })
});
const ServerSnapshotSchema = StrictObject({
  serverId: IdSchema,
  protocolVersion: Type.Literal(PROTOCOL_VERSION),
  revision: Type.Integer({ minimum: 0 }),
  sessions: Type.Array(SessionMetadataSchema),
  models: Type.Array(ModelMetadataSchema)
});
const ProtocolErrorCodeSchema = Type.Union([
  Type.Literal("version"),
  Type.Literal("busy"),
  Type.Literal("session_locked"),
  Type.Literal("not_found"),
  Type.Literal("invalid_request"),
  Type.Literal("not_implemented"),
  Type.Literal("internal_error")
]);
const ProtocolErrorSchema = StrictObject({
  code: ProtocolErrorCodeSchema,
  message: Type.String(),
  details: Type.Optional(JsonValueSchema)
});
const PromptPayloadProperties = {
  sessionId: IdSchema,
  text: Type.String()
};
const ListCommandSchema = StrictObject({ command: Type.Literal("list") });
const CreateCommandSchema = StrictObject({
  command: Type.Literal("create"),
  cwd: Type.Optional(Type.String({ minLength: 1 })),
  name: Type.Optional(Type.String()),
  model: Type.Optional(ModelRefSchema),
  thinkingLevel: Type.Optional(ThinkingLevelSchema)
});
const AttachCommandSchema = StrictObject({ command: Type.Literal("attach"), sessionId: IdSchema });
const DetachCommandSchema = StrictObject({ command: Type.Literal("detach"), sessionId: IdSchema });
const PromptCommandSchema = StrictObject({ command: Type.Literal("prompt"), ...PromptPayloadProperties });
const SteerCommandSchema = StrictObject({ command: Type.Literal("steer"), ...PromptPayloadProperties });
const AbortCommandSchema = StrictObject({ command: Type.Literal("abort"), sessionId: IdSchema });
const SetModelCommandSchema = StrictObject({
  command: Type.Literal("set_model"),
  sessionId: IdSchema,
  model: ModelRefSchema
});
const SetThinkingCommandSchema = StrictObject({
  command: Type.Literal("set_thinking"),
  sessionId: IdSchema,
  thinkingLevel: ThinkingLevelSchema
});
const CommandSchema = Type.Union([
  ListCommandSchema,
  CreateCommandSchema,
  AttachCommandSchema,
  DetachCommandSchema,
  PromptCommandSchema,
  SteerCommandSchema,
  AbortCommandSchema,
  SetModelCommandSchema,
  SetThinkingCommandSchema
]);
const CreateResultSchema = StrictObject({
  command: Type.Literal("create"),
  session: SessionSnapshotSchema
});
const AttachResultSchema = StrictObject({
  command: Type.Literal("attach"),
  session: SessionSnapshotSchema
});
const PromptResultSchema = StrictObject({
  command: Type.Literal("prompt"),
  session: SessionSnapshotSchema
});
const SteerResultSchema = StrictObject({
  command: Type.Literal("steer"),
  session: SessionSnapshotSchema
});
const AbortResultSchema = StrictObject({
  command: Type.Literal("abort"),
  session: SessionSnapshotSchema
});
const SetModelResultSchema = StrictObject({
  command: Type.Literal("set_model"),
  session: SessionSnapshotSchema
});
const SetThinkingResultSchema = StrictObject({
  command: Type.Literal("set_thinking"),
  session: SessionSnapshotSchema
});
const ListResultSchema = StrictObject({
  command: Type.Literal("list"),
  sessions: Type.Array(SessionMetadataSchema)
});
const DetachResultSchema = StrictObject({
  command: Type.Literal("detach"),
  sessionId: IdSchema
});
const CommandResultSchema = Type.Union([
  ListResultSchema,
  CreateResultSchema,
  AttachResultSchema,
  DetachResultSchema,
  PromptResultSchema,
  SteerResultSchema,
  AbortResultSchema,
  SetModelResultSchema,
  SetThinkingResultSchema
]);
const ClientHelloSchema = StrictObject({
  type: Type.Literal("hello"),
  version: Type.Integer({ minimum: 0 })
});
const RequestEnvelopeSchema = StrictObject({
  type: Type.Literal("request"),
  id: IdSchema,
  request: CommandSchema
});
const ClientMessageSchema = Type.Union([ClientHelloSchema, RequestEnvelopeSchema]);
const ServerEventSchema = Type.Union([
  StrictObject({ type: Type.Literal("server_snapshot"), snapshot: ServerSnapshotSchema }),
  StrictObject({ type: Type.Literal("session_snapshot"), snapshot: SessionSnapshotSchema }),
  StrictObject({
    type: Type.Literal("session_progress"),
    sessionId: IdSchema,
    progress: TranscriptProgressSchema
  }),
  StrictObject({ type: Type.Literal("session_removed"), sessionId: IdSchema })
]);
const ServerHelloSchema = StrictObject({
  type: Type.Literal("hello"),
  version: Type.Literal(PROTOCOL_VERSION),
  connectionId: IdSchema,
  snapshot: ServerSnapshotSchema
});
const ServerHelloErrorSchema = StrictObject({
  type: Type.Literal("hello_error"),
  error: ProtocolErrorSchema
});
const ResponseEnvelopeSchema = Type.Union([
  StrictObject({
    type: Type.Literal("response"),
    id: IdSchema,
    ok: Type.Literal(true),
    result: CommandResultSchema
  }),
  StrictObject({
    type: Type.Literal("response"),
    id: IdSchema,
    ok: Type.Literal(false),
    error: ProtocolErrorSchema
  })
]);
const EventEnvelopeSchema = StrictObject({
  type: Type.Literal("event"),
  event: ServerEventSchema
});
const ServerMessageSchema = Type.Union([
  ServerHelloSchema,
  ServerHelloErrorSchema,
  ResponseEnvelopeSchema,
  EventEnvelopeSchema
]);
export {
  AbortCommandSchema,
  AbortResultSchema,
  AssistantContentSchema,
  AssistantTranscriptItemSchema,
  AttachCommandSchema,
  AttachResultSchema,
  ClientHelloSchema,
  ClientMessageSchema,
  CommandResultSchema,
  CommandSchema,
  CreateCommandSchema,
  CreateResultSchema,
  DetachCommandSchema,
  DetachResultSchema,
  EventEnvelopeSchema,
  ImageContentSchema,
  JsonValueSchema,
  ListCommandSchema,
  ListResultSchema,
  ModelCostSchema,
  ModelMetadataSchema,
  ModelRefSchema,
  PROTOCOL_VERSION,
  PromptCommandSchema,
  PromptResultSchema,
  ProtocolErrorCodeSchema,
  ProtocolErrorSchema,
  RequestEnvelopeSchema,
  ResponseEnvelopeSchema,
  ServerEventSchema,
  ServerHelloErrorSchema,
  ServerHelloSchema,
  ServerMessageSchema,
  ServerSnapshotSchema,
  SessionMetadataSchema,
  SessionPhaseSchema,
  SessionSnapshotSchema,
  SetModelCommandSchema,
  SetModelResultSchema,
  SetThinkingCommandSchema,
  SetThinkingResultSchema,
  SteerCommandSchema,
  SteerResultSchema,
  TextContentSchema,
  ThinkingContentSchema,
  ThinkingLevelSchema,
  ToolCallContentSchema,
  ToolContentSchema,
  ToolTranscriptItemSchema,
  TranscriptItemSchema,
  TranscriptProgressSchema,
  UsageSchema,
  UserContentSchema,
  UserTranscriptItemSchema
};
