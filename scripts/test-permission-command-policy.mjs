import assert from 'node:assert/strict';
import { isDefinitelyCriticalZyraToolPermission, isPotentiallyCriticalZyraToolPermission } from '../src/permission-command-policy.mjs';

const classify = command => isDefinitelyCriticalZyraToolPermission({ toolName: 'bash', command });
const probe = `powershell -NoProfile -Command "Get-ItemProperty 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*' | Where-Object { $_.DisplayName -like '*ExampleApp*' } | Format-List; Get-AppxPackage *ExampleApp*; Test-Path (Join-Path $env:LOCALAPPDATA 'Programs\\ExampleApp\\ExampleApp.exe')"`;
assert.equal(classify(probe), false, 'read-only installed-app lookup must not match disk formatting');
for (const command of [
  "ffprobe -v error -show_entries format=duration,size,bit_rate:stream=index,codec_name,codec_type,width,height,r_frame_rate,sample_rate,channels,pix_fmt -of json 'C:/Users/example/Downloads/source.mp4'",
  "ffmpeg -nostdin -n -i source.mp4 -vf 'scale=640:-2,format=yuv420p' preview.mp4",
  'ffmpeg -nostdin -n -i source.mp4 -af aformat=sample_fmts=s16:sample_rates=16000 preview.wav',
]) {
  assert.equal(classify(command), false, 'media format options are not disk-format commands');
  assert.equal(isPotentiallyCriticalZyraToolPermission({ toolName: 'bash', command }), false, 'routine media processing does not need permission review');
}
for (const formatter of ['Format-List', 'Format-Table', 'Format-Wide', 'Format-Custom', 'Format-Hex']) {
  assert.equal(classify(`Get-Item example | ${formatter}`), false, formatter);
  assert.equal(classify(`powershell -Command "Get-Item example | ${formatter} -Property Name"`), false, formatter);
}
for (const command of [
  'format C:', 'FORMAT D: /FS:NTFS', 'format.com E:', '"C:\\Windows\\System32\\format.exe" F:',
  'Format-Volume -DriveLetter D', 'format-list.exe D:', 'format-list-custom D:',
  'diskpart', 'Remove-Item data -Recurse -Force', 'git push origin dev',
  'ffprobe -show_entries format=duration source.mp4; format D:',
  'terraform apply -auto-approve', 'winget install ExampleApp', 'Set-ExecutionPolicy Unrestricted',
]) assert.equal(classify(command), true, `critical action remains gated: ${command}`);
assert.equal(isPotentiallyCriticalZyraToolPermission({ toolName: 'bash', command: probe }), false);
assert.equal(isPotentiallyCriticalZyraToolPermission({ toolName: 'bash', command: 'echo token' }), true);
assert.equal(isPotentiallyCriticalZyraToolPermission({ toolName: 'read', outsideProject: true }), true);
assert.equal(isDefinitelyCriticalZyraToolPermission({ toolName: 'delete', detail: 'example' }), true);
assert.equal(isDefinitelyCriticalZyraToolPermission({ toolName: 'plugin_mcp' }), true, 'opaque Plugin MCP tools always need review');
assert.equal(classify('npm test'), false);
console.log('Permission command policy: read-only formatters, real destructive commands and escalation boundaries: ok');
