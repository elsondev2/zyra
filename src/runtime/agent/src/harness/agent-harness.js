// Generated from the maintained TypeScript in ../source by scripts/build-owned-runtime.mjs.
import { TaggedError } from "./result.js";
class LaneBusy extends TaggedError("LaneBusy") {
}
class MissingIdentities extends TaggedError("MissingIdentities") {
}
class NoActiveRun extends TaggedError("NoActiveRun") {
}
class NoActiveOperation extends TaggedError("NoActiveOperation") {
}
class NothingToResume extends TaggedError("NothingToResume") {
}
class InvalidMessage extends TaggedError("InvalidMessage") {
}
class UnknownSkill extends TaggedError("UnknownSkill") {
}
class UnknownTemplate extends TaggedError("UnknownTemplate") {
}
class UnknownTarget extends TaggedError("UnknownTarget") {
}
class UnknownQueueItem extends TaggedError("UnknownQueueItem") {
}
class LaneExists extends TaggedError("LaneExists") {
}
class InvalidLane extends TaggedError("InvalidLane") {
}
class NothingToCompact extends TaggedError("NothingToCompact") {
}
class Closed extends TaggedError("Closed") {
}
class HarnessFault extends Error {
  cause;
  constructor(message, cause) {
    super(message);
    this.name = "HarnessFault";
    this.cause = cause;
  }
}
class HarnessClosed extends Error {
  constructor() {
    super("AgentHarness was closed while the operation was active");
    this.name = "HarnessClosed";
  }
}
class HarnessNotImplemented extends Error {
  operation;
  constructor(operation) {
    super(`AgentHarness.${operation} is not implemented yet`);
    this.name = "HarnessNotImplemented";
    this.operation = operation;
  }
}
class UnavailableRegistry {
  operation;
  isClosed;
  constructor(operation, isClosed) {
    this.operation = operation;
    this.isClosed = isClosed;
  }
  on(_name, _handler, _options) {
    throw this.isClosed() ? new HarnessClosed() : new HarnessNotImplemented(this.operation);
  }
}
class AgentHarness {
  name = "main";
  session;
  hooks;
  events;
  durableSession;
  model;
  thinkingLevel;
  activeToolNames;
  tools;
  resources;
  streamOptions;
  retryPolicy;
  compactionSettings;
  steeringMode;
  followUpMode;
  closed = false;
  constructor(options) {
    this.durableSession = options.session;
    this.session = options.session;
    this.hooks = new UnavailableRegistry("hooks.on", () => this.closed);
    this.events = new UnavailableRegistry("events.on", () => this.closed);
    this.model = options.model;
    this.thinkingLevel = options.thinkingLevel ?? "off";
    this.activeToolNames = [...options.activeToolNames ?? options.tools?.map((tool) => tool.name) ?? []];
    this.tools = [...options.tools ?? []];
    this.resources = {
      skills: options.resources?.skills ? [...options.resources.skills] : void 0,
      promptTemplates: options.resources?.promptTemplates ? [...options.resources.promptTemplates] : void 0
    };
    this.streamOptions = { ...options.streamOptions ?? {} };
    this.retryPolicy = options.retry ?? { enabled: false, maxRetries: 0, baseDelayMs: 1e3 };
    this.compactionSettings = options.compaction ?? {
      enabled: true,
      reserveTokens: 16384,
      keepRecentTokens: 2e4
    };
    this.steeringMode = options.steeringMode ?? "one-at-a-time";
    this.followUpMode = options.followUpMode ?? "one-at-a-time";
  }
  static async create(options) {
    const [record] = await options.session.findRecords({ limit: 1 });
    if (record !== void 0) throw new HarnessNotImplemented("create.restore");
    return { harness: new AgentHarness(options), suspended: [] };
  }
  unavailable(operation) {
    return Promise.reject(this.closed ? new HarnessClosed() : new HarnessNotImplemented(operation));
  }
  async getLeafId() {
    return this.durableSession.getLeafId();
  }
  async prompt(_input, _images) {
    return this.unavailable("prompt");
  }
  async skill(_name, _additionalInstructions) {
    return this.unavailable("skill");
  }
  async promptFromTemplate(_name, _args) {
    return this.unavailable("promptFromTemplate");
  }
  async compact(_options) {
    return this.unavailable("compact");
  }
  async navigateTree(_targetId, _options) {
    return this.unavailable("navigateTree");
  }
  async resume() {
    return this.unavailable("resume");
  }
  async abort() {
    return this.unavailable("abort");
  }
  async steer(_input, _images) {
    return this.unavailable("steer");
  }
  async followUp(_input, _images) {
    return this.unavailable("followUp");
  }
  async nextRun(_input, _images) {
    return this.unavailable("nextRun");
  }
  async cancelQueued(_entryId) {
    return this.unavailable("cancelQueued");
  }
  async recordUsage(_usage, _options) {
    return this.unavailable("recordUsage");
  }
  async waitForIdle() {
    return this.unavailable("waitForIdle");
  }
  async runWhenIdle(_callback) {
    return this.unavailable("runWhenIdle");
  }
  async peekAction() {
    return this.unavailable("peekAction");
  }
  async executeAction() {
    return this.unavailable("executeAction");
  }
  async runToCompletion() {
    return this.unavailable("runToCompletion");
  }
  async getModel() {
    return this.model;
  }
  async setModel(model) {
    this.model = model;
  }
  async getThinkingLevel() {
    return this.thinkingLevel;
  }
  async setThinkingLevel(level) {
    this.thinkingLevel = level;
  }
  async getActiveTools() {
    return [...this.activeToolNames];
  }
  async setActiveTools(names) {
    this.activeToolNames = [...names];
  }
  async watch() {
    return this.unavailable("watch");
  }
  async lane(_name) {
    return this.unavailable("lane");
  }
  async createLane(_name, _at) {
    return this.unavailable("createLane");
  }
  async lanes() {
    return this.unavailable("lanes");
  }
  async getTools() {
    return [...this.tools];
  }
  async setTools(tools, activeNames) {
    this.tools = [...tools];
    this.activeToolNames = [...activeNames ?? tools.map((tool) => tool.name)];
  }
  async getResources() {
    return {
      skills: this.resources.skills ? [...this.resources.skills] : void 0,
      promptTemplates: this.resources.promptTemplates ? [...this.resources.promptTemplates] : void 0
    };
  }
  async setResources(resources) {
    this.resources = {
      skills: resources.skills ? [...resources.skills] : void 0,
      promptTemplates: resources.promptTemplates ? [...resources.promptTemplates] : void 0
    };
  }
  async getStreamOptions() {
    return { ...this.streamOptions };
  }
  async setStreamOptions(options) {
    this.streamOptions = { ...options };
  }
  async getRetryPolicy() {
    return { ...this.retryPolicy };
  }
  async setRetryPolicy(policy) {
    this.retryPolicy = { ...policy };
  }
  async getCompactionSettings() {
    return { ...this.compactionSettings };
  }
  async setCompactionSettings(settings) {
    this.compactionSettings = { ...settings };
  }
  async getSteeringMode() {
    return this.steeringMode;
  }
  async setSteeringMode(mode) {
    this.steeringMode = mode;
  }
  async getFollowUpMode() {
    return this.followUpMode;
  }
  async setFollowUpMode(mode) {
    this.followUpMode = mode;
  }
  async watchSession() {
    return this.unavailable("watchSession");
  }
  async close() {
    this.closed = true;
  }
}
export {
  AgentHarness,
  Closed,
  HarnessClosed,
  HarnessFault,
  HarnessNotImplemented,
  InvalidLane,
  InvalidMessage,
  LaneBusy,
  LaneExists,
  MissingIdentities,
  NoActiveOperation,
  NoActiveRun,
  NothingToCompact,
  NothingToResume,
  UnknownQueueItem,
  UnknownSkill,
  UnknownTarget,
  UnknownTemplate
};
