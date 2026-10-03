import { createBrowserToolSet, BROWSER_TOOLSET_NAMES } from '../../agent-control/browser-toolset.mjs';
import { createComputerToolSet, COMPUTER_TOOLSET_NAMES } from '../../agent-control/computer-toolset.mjs';
import { ZyraExternalToolsClient } from '../../agent-control/external-tools-client.mjs';

const SEARCH = 'zyra_tool_search';
const toPiName = name => name === 'tool_search' ? SEARCH : name;
const toZyraName = name => name === SEARCH ? 'tool_search' : name;
const deferred = new Set([...BROWSER_TOOLSET_NAMES, ...COMPUTER_TOOLSET_NAMES]);

export function registerPiZyraTools(pi, options = {}) {
  let client;
  let sourceSessionId;
  const clients = new Set();
  const makeClient = options.createClient || (input => new ZyraExternalToolsClient(input));
  const bridge = { async request(operation, settings) {
    if (!client) throw new Error('Zyra tools require an active Pi session. Reload this extension.');
    return client.request(operation, settings);
  } };
  const sessionRef = { current: {
    getActiveToolNames: () => pi.getActiveTools().map(toZyraName),
    setActiveToolsByName: names => pi.setActiveTools(names.map(toPiName)),
  } };
  const tools = [...createBrowserToolSet({ client: bridge, sessionRef }), ...createComputerToolSet({ client: bridge, sessionRef })];
  for (const tool of tools) {
    pi.registerTool({ ...tool, name: toPiName(tool.name), executionMode: 'sequential',
      promptSnippet: tool.name === 'browser_use' ? 'Load Zyra Browser and paired Chrome tools when interaction is needed.'
        : tool.name === 'tool_search' ? 'Load Zyra Windows computer tools when desktop interaction is needed.' : undefined,
      async execute(id, args, signal) { return tool.execute(id, args, signal); },
    });
  }
  pi.registerTool({
    name: 'zyra_tools_status', label: 'Zyra connection',
    description: 'Check whether Zyra Desktop can host Pi browser, Chrome and computer tools. Does not launch apps or acquire control grants.',
    parameters: { type: 'object', properties: {}, additionalProperties: false },
    async execute() {
      try {
        if (!client) throw new Error('No active Pi session.');
        const details = await client.status();
        return { content: [{ type: 'text', text: JSON.stringify(details) }], details };
      } catch (error) {
        return { content: [{ type: 'text', text: `Zyra tools unavailable: ${error.message}. Start the configured Zyra Desktop instance; an older server needs reloading to activate the gateway.` }],
          details: { ok: false, code: error.code || 'CONTROL_DRIVER_UNAVAILABLE' } };
      }
    },
  });
  const unload = () => pi.setActiveTools(pi.getActiveTools().filter(name => !deferred.has(toZyraName(name))));
  const bind = async (_event, ctx) => {
    if (client) { await client.close(); clients.delete(client); }
    sourceSessionId = ctx.sessionManager.getSessionId();
    client = makeClient({ ...options, project: ctx.cwd, sourceSessionId });
    clients.add(client);
    unload();
  };
  pi.on('session_start', bind);
  pi.on('agent_start', async (_event, ctx) => {
    if (!client || sourceSessionId !== ctx.sessionManager.getSessionId()) await bind(_event, ctx);
  });
  pi.on('agent_end', async () => { await client?.endTurn(); unload(); });
  pi.on('session_shutdown', async () => { await Promise.all([...clients].map(value => value.close())); clients.clear(); });
  pi.registerCommand('zyra-tools', {
    description: 'Check the Zyra Desktop tool connection',
    handler: async (_args, ctx) => {
      try { const status = await client.status(); ctx.ui.notify(status.available ? 'Zyra tools connected' : 'Open Zyra Desktop to connect its tools', status.available ? 'info' : 'warning'); }
      catch (error) { ctx.ui.notify(`Zyra tools: ${error.message}`, 'error'); }
    },
  });
  return { tools, unload };
}

export default registerPiZyraTools;
