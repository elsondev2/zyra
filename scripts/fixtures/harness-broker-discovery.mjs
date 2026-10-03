import { appendFileSync } from 'node:fs';

export const catalog = { connected: ['broker-fixture'], all: [{ id: 'broker-fixture', models: {
  discovered: { id: 'discovered', name: 'Discovered fixture', capabilities: { reasoning: true }, limit: { context: 32768, output: 4096 } },
} }] };
if (process.env.ZYRA_BROKER_FIXTURE_LOG) {
  const deniedFetch = globalThis.fetch;
  globalThis.fetch = async (url, options = {}) => {
    if (String(url) !== 'http://127.0.0.1:9/provider' || (options.method || 'GET') !== 'GET') return deniedFetch(url, options);
    if (new Headers(options.headers).get('authorization') !== `Basic ${Buffer.from('opencode:private-broker-fixture').toString('base64')}`) throw Error('Fixture transport authentication missing');
    appendFileSync(process.env.ZYRA_BROKER_FIXTURE_LOG, 'provider\n');
    return Response.json(catalog);
  };
}
