const permissionRank = { 'read-only': 0, writer: 1, 'full-access': 2 };

export function threadStartOptions(sender, connected = {}) {
  const inherited = sender.agent;
  const ceiling = inherited?.permissionMode || connected.agentPermissionMode
    || ({ 'full-access': 'full-access', 'edits-only': 'writer' }[connected.runtimeMode]) || 'read-only';
  return {
    permissionModes: Object.keys(permissionRank).filter(mode => permissionRank[mode] <= permissionRank[ceiling]),
    defaults: { model: inherited?.selectedModel || 'inherit', effort: inherited?.effort || connected.thinking || connected.config?.thinking || 'medium', permissionMode: inherited?.permissionMode || 'read-only' },
    inheritedScopes: inherited ? { readScope: inherited.readScope || [], writeScope: inherited.writeScope || [] } : null,
    scopeRule: inherited ? 'Descendants retain the parent file scopes and can choose the same or a narrower permission mode.' : 'Writing requires an explicit writeScope within this project. Permission mode cannot exceed this chat authority.',
  };
}

export function resolveThreadStartSettings(input, sender, connected) {
  const options = threadStartOptions(sender, connected);
  const permissionMode = input.permissionMode || options.defaults.permissionMode;
  if (!options.permissionModes.includes(permissionMode)) throw new Error(`Thread permission mode ${permissionMode} is unavailable. Allowed: ${options.permissionModes.join(', ')}.`);
  const inherited = sender.agent;
  if (!inherited && permissionMode !== 'read-only' && !input.writeScope?.length) throw new Error('Choose an explicit writeScope before starting a writing thread.');
  return {
    model: input.model || options.defaults.model,
    ...(input.effort != null ? { effort: input.effort } : inherited?.effort && (!input.model || input.model === inherited.selectedModel) ? { effort: inherited.effort } : {}),
    permissionMode,
    ...(inherited ? { parentAgentRunId: inherited.agentRunId, tools: (inherited.grantedTools || inherited.tools || []).filter(tool => !['browser_control', 'computer_control'].includes(tool)), readScope: inherited.readScope, writeScope: inherited.writeScope }
      : { tools: input.tools || (permissionMode === 'read-only' ? ['read', 'grep', 'find', 'ls'] : ['read', 'grep', 'find', 'ls', 'edit', 'write']), readScope: input.readScope, writeScope: input.writeScope }),
  };
}
