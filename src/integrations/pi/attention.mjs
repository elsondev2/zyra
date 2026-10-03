import { spawn } from 'node:child_process';

export function notificationScript(title, body) {
  const quote = value => `'${String(value).replace(/'/g, "''")}'`;
  return `Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
$fullSendIcon = New-Object System.Windows.Forms.NotifyIcon
try {
  $fullSendIcon.Icon = [System.Drawing.SystemIcons]::Information
  $fullSendIcon.BalloonTipTitle = ${quote(title)}
  $fullSendIcon.BalloonTipText = ${quote(body)}
  $fullSendIcon.Visible = $true
  $fullSendIcon.ShowBalloonTip(5000)
  Start-Sleep -Seconds 6
} finally { $fullSendIcon.Dispose() }
`;
}

export function notifyWindows(title, body, options = {}) {
  if ((options.platform || process.platform) !== 'win32') return { started: false, reason: 'Windows notifications unavailable' };
  const encoded = Buffer.from(notificationScript(title, body), 'utf16le').toString('base64');
  const child = (options.spawn || spawn)('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', encoded],
    { windowsHide: true, detached: true, stdio: 'ignore' });
  child.on('error', () => {});
  child.unref();
  return { started: true };
}

export function registerPiAttention(pi, options = {}) {
  const send = options.notify || notifyWindows;
  let last = '';
  let lastAt = 0;
  const attention = (kind, text, ctx) => {
    if (!ctx.hasUI) return { started: false, reason: 'No interactive Pi UI' };
    const key = `${kind}:${text}`;
    if (last === key && Date.now() - lastAt < 30_000) return { started: false, reason: 'Duplicate suppressed' };
    last = key; lastAt = Date.now();
    pi.events.emit('full-send:attention', { kind });
    return send(kind === 'input' ? 'Pi needs your decision' : kind === 'blocked' ? 'Pi needs attention' : 'Pi result ready', text);
  };
  pi.registerTool({
    name: 'full_send_notify', label: 'Task attention',
    description: 'Notify the user of a genuine input need, blocker, or verified result. A notification is not proof of task completion. Do not notify for routine progress.',
    parameters: { type: 'object', properties: { kind: { type: 'string', enum: ['input', 'blocked', 'complete'] },
      summary: { type: 'string', minLength: 1, maxLength: 240 } }, required: ['kind', 'summary'], additionalProperties: false },
    async execute(_id, input, _signal, _update, ctx) {
      const details = attention(input.kind, input.summary, ctx);
      return { content: [{ type: 'text', text: details.started ? 'Notification requested; delivery depends on Windows notification settings.' : details.reason }], details };
    },
  });
  pi.on('tool_call', (event, ctx) => {
    if (event.toolName === 'ask_user') attention('input', String(event.input?.question || 'A question is waiting in your Pi terminal.').slice(0, 240), ctx);
  });
}
