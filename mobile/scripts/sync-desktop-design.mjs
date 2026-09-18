import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { pointsPath } from './lucide-points.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const read = p => readFileSync(path.join(root, p), 'utf8');
const requireDesktop = createRequire(path.join(root, 'desktop/package.json'));
const ts = requireDesktop('typescript');
const defaultTokens = {};
vm.runInNewContext(ts.transpileModule(read('desktop/src/shared/preferences/default-theme-tokens.ts'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, { exports: defaultTokens });
const catalog = read('desktop/src/renderer/src/lib/settings-theme-catalog.ts');
const contract = read('desktop/src/shared/preferences/theme-contract.ts');
const literal = catalog.match(/export const THEMES = (\[[\s\S]*?\]) as const satisfies/);
assert.ok(literal, 'Desktop theme catalog shape changed');
const themes = JSON.parse(JSON.stringify(vm.runInNewContext('(' + literal[1] + ')', defaultTokens)));
const ids = kind => [...contract.match(new RegExp(`export const ${kind}_THEME_IDS = \\[([\\s\\S]*?)\\]`))[1].matchAll(/'([^']+)'/g)].map(m => m[1]);
assert.deepEqual(themes.map(t => t.id).sort(), [...ids('LIGHT'), ...ids('DARK')].sort());
const output = (relative, content) => {
  const dest = path.join(root, relative);
  if (process.argv.includes('--check')) assert.equal(readFileSync(dest, 'utf8'), content, `${relative} differs from Desktop; run node mobile/scripts/sync-desktop-design.mjs`);
  else { mkdirSync(path.dirname(dest), { recursive: true }); writeFileSync(dest, content); }
};
const semanticsCode = ts.transpileModule(read('desktop/src/renderer/src/lib/settings-theme-semantics.ts'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const semantics = { exports: {} }; vm.runInNewContext(semanticsCode, semantics);
const resolved = themes.map(t => ({ ...t, dark: !ids('LIGHT').includes(t.id), tokens: semantics.exports.resolveThemeTokens(t.tokens) }));
for (const theme of resolved) assert.ok(semantics.exports.getContrastRatio(theme.tokens.textDarker, theme.tokens.bg) >= 4.5, theme.id + ' supporting text contrast');
output('mobile/android/app/src/main/assets/desktop-themes.json', JSON.stringify(resolved, null, 2) + '\n');
const voiceLiteral = read('desktop/src/renderer/src/pages/assistant/instructor-voice-visuals.ts').match(/export const INSTRUCTOR_VOICE_VISUAL_THEMES = (\{[\s\S]*?\}) as const/);
assert.ok(voiceLiteral, 'Desktop voice palette shape changed');
const voices = vm.runInNewContext('(' + voiceLiteral[1] + ')');
output('mobile/android/app/src/main/java/dev/zyra/mobile/voice/VoiceChoice.kt', `package dev.zyra.mobile.voice

// Generated from Desktop instructor-voice-visuals by sync-desktop-design.mjs.
data class VoiceChoice(val id: String, val primary: Long, val secondary: Long, val highlight: Long, val frequency: Float, val phase: Float) {
    val name get() = id.replaceFirstChar { it.uppercase() }
    companion object {
        val all = listOf(
${Object.entries(voices).map(([id, v]) => `            VoiceChoice("${id}", 0xff${v.primary.slice(1)}, 0xff${v.secondary.slice(1)}, 0xff${v.highlight.slice(1)}, ${v.frequency}f, ${v.phase}f)`).join(',\n')})
        fun resolve(id: String?) = all.firstOrNull { it.id == id } ?: all.first { it.id == "cove" }
    }
}
`);

// Convert Desktop's ISC-licensed Lucide primitives to Android vector resources.
// This keeps one icon language without shipping an entire second icon library.
const names = ['arrow-left','arrow-up','chevron-down','chevron-right','message-square','monitor','folder','settings','search','plus','x','check','qr-code','camera','image','link','wifi','wifi-off','circle-alert','refresh-cw','ellipsis','terminal','git-branch','palette','sun','moon','smartphone','archive','pencil','paperclip','square','arrow-down','bot','workflow','sliders-horizontal','info','shield-check','log-out','square-pen','copy','folder-open','filter','chevrons-up-down','circle','external-link','keyboard','file','clipboard-paste','mic','audio-lines','mic-off','volume-2','headphones','phone-off','play','chevron-left','puzzle','brain','text-cursor-input','bell'];
for (const name of names) {
  const source = read(`desktop/node_modules/lucide-react/dist/esm/icons/${name}.js`);
  const nodes = vm.runInNewContext('(' + source.match(/createLucideIcon\([^,]+, ([\s\S]*?)\);/)[1] + ')');
  const paths = nodes.map(([tag, a]) => {
    if (tag === 'path') return a.d;
    if (tag === 'line') return `M${a.x1},${a.y1}L${a.x2},${a.y2}`;
    if (tag === 'polyline' || tag === 'polygon') return pointsPath(a.points, tag === 'polygon');
    if (tag === 'circle' || tag === 'ellipse') {
      const x = +a.cx, y = +a.cy, rx = +(a.rx || a.r), ry = +(a.ry || a.r);
      return `M${x-rx},${y}a${rx},${ry} 0 1,0 ${2*rx},0a${rx},${ry} 0 1,0 ${-2*rx},0`;
    }
    if (tag === 'rect') {
      const x = +(a.x || 0), y = +(a.y || 0), w = +a.width, h = +a.height, r = +(a.rx || 0);
      return `M${x+r},${y}h${w-2*r}q${r},0 ${r},${r}v${h-2*r}q0,${r} ${-r},${r}h${2*r-w}q${-r},0 ${-r},${-r}v${2*r-h}q0,${-r} ${r},${-r}Z`;
    }
    throw new Error(`Unsupported Lucide primitive ${tag}`);
  });
  output(`mobile/android/app/src/main/res/drawable/ic_${name.replaceAll('-', '_')}.xml`, `<!-- Lucide ${name}, ISC license. Generated by mobile/scripts/sync-desktop-design.mjs. -->\n<vector xmlns:android="http://schemas.android.com/apk/res/android" android:width="24dp" android:height="24dp" android:viewportWidth="24" android:viewportHeight="24">\n${paths.map(d => `    <path android:pathData="${d}" android:strokeColor="#FFFFFFFF" android:strokeWidth="1.8" android:strokeLineCap="round" android:strokeLineJoin="round" android:fillColor="@android:color/transparent"/>`).join('\n')}\n</vector>\n`);
}
output('mobile/android/app/src/main/assets/lucide-LICENSE.txt', read('desktop/node_modules/lucide-react/LICENSE'));
const openai = read('desktop/src/renderer/src/assets/openai-logo-symbol.svg');
const openaiPaths = [...openai.matchAll(/\bd="([^"]+)"/g)].map(match => match[1]);
assert.ok(openaiPaths.length, 'Desktop OpenAI symbol must contain paths');
output('mobile/android/app/src/main/res/drawable/ic_openai.xml', `<!-- OpenAI brand symbol, shared with Desktop. Generated by sync-desktop-design.mjs. -->\n<vector xmlns:android="http://schemas.android.com/apk/res/android" android:width="24dp" android:height="24dp" android:viewportWidth="158.7128" android:viewportHeight="157.296">\n${openaiPaths.map(d => `    <path android:pathData="${d}" android:fillColor="#FFFFFFFF"/>`).join('\n')}\n</vector>\n`);
console.log(`${themes.length} Desktop themes and ${names.length} Lucide icons ${process.argv.includes('--check') ? 'verified' : 'generated'}.`);
