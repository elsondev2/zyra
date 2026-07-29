export function installZyraNextTurnCheckpoint(session, managedBash, options = {}) {
  const agent = session?.agent;
  if (!agent) return () => {};

  const previousPrepareNextTurnWithContext = agent.prepareNextTurnWithContext
    ?? (agent.prepareNextTurn
      ? async (_turn, signal) => agent.prepareNextTurn(signal)
      : undefined);

  const checkpoint = async (turn, signal) => {
    const previousSnapshot = await previousPrepareNextTurnWithContext?.(turn, signal);

    await checkMidRunCompaction(session, turn?.message, signal, options);
    await pollManagedBash(agent, managedBash, signal, options);

    const previousContext = previousSnapshot?.context ?? turn?.context ?? {};
    const state = agent.state ?? {};
    return {
      ...previousSnapshot,
      context: {
        ...previousContext,
        systemPrompt: state.systemPrompt ?? previousContext.systemPrompt,
        messages: Array.isArray(state.messages) ? state.messages.slice() : previousContext.messages,
        tools: Array.isArray(state.tools) ? state.tools.slice() : previousContext.tools,
      },
      model: previousSnapshot?.model ?? state.model,
      thinkingLevel: previousSnapshot?.thinkingLevel ?? state.thinkingLevel,
    };
  };

  agent.prepareNextTurnWithContext = checkpoint;
  return () => {
    if (agent.prepareNextTurnWithContext === checkpoint) {
      agent.prepareNextTurnWithContext = previousPrepareNextTurnWithContext;
    }
  };
}

async function checkMidRunCompaction(session, assistantMessage, signal, options = {}) {
  if (!assistantMessage || assistantMessage.role !== "assistant") return;
  if (signal?.aborted || session?.isCompacting) return;
  const checkCompaction = options.checkCompaction ?? session?._checkCompaction;
  if (typeof checkCompaction !== "function") return;

  try {
    await checkCompaction.call(session, assistantMessage);
  } catch (error) {
    options.onError?.(error, { phase: "compaction" });
  }
}

async function pollManagedBash(agent, managedBash, signal, options = {}) {
  if (!managedBash?.hasAutoPollJobs?.()) return;
  try {
    const text = await options.waitForUpdate?.(managedBash, {
      waitMs: options.intervalMs,
      signal: signal ?? agent.signal,
    });
    if (!text || signal?.aborted || agent.signal?.aborted) return;
    agent.steer({
      role: "custom",
      customType: "zyra.managed-bash.update.v1",
      content: [
        {
          type: "text",
          text: [
            "[Zyra managed command update]",
            text,
            "",
            "Use this command output to decide whether to keep waiting, check status again, stop the job, or continue with the task.",
          ].join("\n"),
        },
      ],
      display: false,
      details: { source: "managed-bash-auto-poll" },
      timestamp: Date.now(),
    });
  } catch (error) {
    options.onError?.(error, { phase: "managed-bash" });
  }
}
