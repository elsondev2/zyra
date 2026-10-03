import { spawn } from 'node:child_process';

type Execute = (command: string, args: string[], input?: string) => Promise<Buffer>;
const MAX_BYTES = 64 * 1024 * 1024;

const execute: Execute = (command, args, input) => new Promise((resolve, reject) => {
  const child = spawn(command, args, { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
  const chunks: Buffer[] = [];
  let size = 0;
  const timer = setTimeout(() => { child.kill(); reject(new Error('Clipboard operation timed out.')); }, 5000);
  child.stdout.on('data', (chunk: Buffer) => {
    size += chunk.length;
    if (size > MAX_BYTES) { child.kill(); reject(new Error('Clipboard content is too large.')); }
    else chunks.push(chunk);
  });
  child.stderr.resume();
  child.on('error', error => { clearTimeout(timer); reject(error); });
  child.on('close', code => { clearTimeout(timer); code === 0 ? resolve(Buffer.concat(chunks)) : reject(new Error('Clipboard content is unavailable.')); });
  child.stdin.on('error', () => {});
  child.stdin.end(input);
});

/** Platform clipboard commands. No downloaded clipboard addon or package lookup. */
export function createPlatformClipboard(options: { platform?: string; env?: NodeJS.ProcessEnv; execute?: Execute } = {}) {
  const platform = options.platform ?? process.platform;
  const env = options.env ?? process.env;
  const run = options.execute ?? execute;
  const powershell = (script: string, input?: string) => run('powershell.exe', ['-NoProfile', '-STA', '-Command', '[Console]::InputEncoding = [Console]::OutputEncoding = [System.Text.UTF8Encoding]::new(); Add-Type -AssemblyName System.Windows.Forms; ' + script], input);
  const linux = async (type: string, input?: string) => {
    if (env.WAYLAND_DISPLAY) {
      try { return await run(input === undefined ? 'wl-paste' : 'wl-copy', input === undefined ? ['--no-newline', '--type', type] : ['--type', type], input); } catch { /* X11 fallback */ }
    }
    return run('xclip', ['-selection', 'clipboard', input === undefined ? '-o' : '-i', '-t', type], input);
  };
  let image: Buffer | undefined;
  const captureImage = async () => {
    if (platform === 'win32') {
      const bytes = await powershell('if (-not [System.Windows.Forms.Clipboard]::ContainsImage()) { exit 3 }; Add-Type -AssemblyName System.Drawing; $img = [System.Windows.Forms.Clipboard]::GetImage(); $stream = [System.IO.MemoryStream]::new(); try { $img.Save($stream, [System.Drawing.Imaging.ImageFormat]::Png); [Console]::Write([Convert]::ToBase64String($stream.ToArray())) } finally { $img.Dispose(); $stream.Dispose() }');
      return Buffer.from(bytes.toString(), 'base64');
    }
    if (platform === 'darwin') {
      const bytes = await run('osascript', ['-l', 'JavaScript', '-e', 'ObjC.import("AppKit"); ObjC.import("Foundation"); var d = $.NSPasteboard.generalPasteboard.dataForType($.NSPasteboardTypePNG); if (!d) throw Error("No PNG image"); ObjC.unwrap(d.base64EncodedStringWithOptions(0));']);
      return Buffer.from(bytes.toString().trim(), 'base64');
    }
    return linux('image/png');
  };
  return {
    async getText(): Promise<string> {
      const result = platform === 'win32' ? await powershell('[Console]::Write([System.Windows.Forms.Clipboard]::GetText())') : platform === 'darwin' ? await run('pbpaste', []) : await linux('text/plain');
      return result.toString('utf8');
    },
    async setText(text: string): Promise<void> {
      if (platform === 'win32') await powershell('[System.Windows.Forms.Clipboard]::SetText([Console]::In.ReadToEnd())', text);
      else if (platform === 'darwin') await run('pbcopy', [], text);
      else await linux('text/plain', text);
    },
    async hasImage(): Promise<boolean> {
      try { image = await captureImage(); return image.length > 0; } catch { image = undefined; return false; }
    },
    async getImageBinary(): Promise<Buffer> {
      const result = image ?? await captureImage();
      image = undefined;
      return result;
    },
  };
}
