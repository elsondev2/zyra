import os from 'node:os';
import { ZyraAgentServerClient } from '../../../src/agent-server/client.mjs';
import path from 'node:path';
import { realpathSync } from 'node:fs';
import { parseArgs } from 'node:util';
import QRCode from 'qrcode';
import { hostTls } from './tls.mjs';
import { createGateway } from './server.mjs';

const { values } = parseArgs({ options: {
  host: { type: 'string', default: '127.0.0.1' }, port: { type: 'string', default: '47321' },
  project: { type: 'string', multiple: true, default: [] }, state: { type: 'string' }, 'server-state': { type: 'string' },
  channel: { type: 'string', default: 'default' }, pair: { type: 'boolean' }, help: { type: 'boolean' }
}});
if (values.help) {
  console.log('Zyra mobile host\n\nnode src/cli.mjs --host <LAN IP> --project <folder> [--project <folder>] --pair\n\nPC work stays in the existing Zyra agent service. Keep Zyra running before connecting.\nPairing expires after two minutes. Share only the folders you intend to use from your phone.');
} else {
  if (!values.project.length) throw new Error('Select at least one shared project with --project.');
  if (!Number.isInteger(Number(values.port)) || Number(values.port) < 1 || Number(values.port) > 65535) throw new Error('Invalid port.');
  if (['0.0.0.0', '::'].includes(values.host)) throw new Error('Choose one specific local network address.');
  const directory = path.resolve(values.state || path.join(os.homedir(), '.zyra', 'mobile', values.channel));
  const tls = await hostTls(directory);
  const gateway = createGateway({ tls, directory, projects: values.project.map(p => realpathSync(p)), name: os.hostname(), clientFactory: device => new ZyraAgentServerClient({ clientId: 'mobile:' + device.id, surface: 'mobile', displayName: device.name, channel: values.channel,
    stateDirectory: values['server-state'], autoStart: false, verifyRuntimeRevision: false, requiredMethods: ['session.join'] }) });
  await gateway.listen(values.host, Number(values.port));
  console.log('Zyra mobile access is listening on https://' + values.host + ':' + values.port);
  if (values.pair) {
    const pairing = gateway.devices.createPairing();
    const payload = { v: 1, url: 'https://' + values.host + ':' + values.port, fingerprint: tls.fingerprint,
      hostId: gateway.devices.state.hostId, name: os.hostname(), ...pairing };
    const link = 'zyra://pair#' + Buffer.from(JSON.stringify(payload)).toString('base64url');
    console.log(await QRCode.toString(link, { type: 'terminal', small: true }));
    console.log('One-use pairing link (expires in two minutes):\n' + link);
  }
  let closing = false;
  const close = async () => { if (closing) return; closing = true; await gateway.close(); };
  process.once('SIGINT', close); process.once('SIGTERM', close);
}
