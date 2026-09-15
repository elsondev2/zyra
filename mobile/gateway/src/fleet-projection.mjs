const pick = (value, keys) => Object.fromEntries(keys.filter(key => value?.[key] !== undefined).map(key => [key, value[key]]));
export function projectFleetList(result, payload = {}) {
  const offset = Math.max(0, Number.isSafeInteger(payload.offset) ? payload.offset : 0), limit = 30;
  const all = Array.isArray(result.runs) ? [...result.runs].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))) : [];
  const definitions = (result.definitions?.active || []).map(entry => ({
    name: entry.name || entry.definition?.name,
    description: entry.definition?.description || '', runnable: entry.runnable !== false,
    errors: entry.errors || [], warnings: entry.warnings || [],
    ...pick(entry.definition, ['role', 'permissionMode', 'tools', 'phases', 'budgets', 'trusted', 'origin'])
  }));
  return { definitions, runs: all.slice(offset, offset + limit).map(run => ({
    ...pick(run, ['agentRunId', 'workflowRunId', 'definitionName', 'label', 'status', 'createdAt', 'elapsedMs', 'selectedModel', 'usage', 'parentAgentRunId']),
    goal: String(run.goal || '').slice(0, 500)
  })), nextOffset: offset + limit < all.length ? offset + limit : null };
}
