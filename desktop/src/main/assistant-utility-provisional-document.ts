import { defaultThemeTokens } from '../shared/preferences/default-theme-tokens'
import type { UtilityWindowCreationOptions } from './assistant/assistant-utility-window-manager'

function escapeUtilityProvisionalText(value: string): string {
    return value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character] || character)
}

export function assistantUtilityProvisionalUrl(options: UtilityWindowCreationOptions, appearance: 'light' | 'dark'): string {
    const theme = defaultThemeTokens(appearance)
    const label = escapeUtilityProvisionalText(String(options.label || 'Workspace').slice(0, 160))
    const accent = /^#[0-9a-f]{6}$/i.test(String(options.accentColor || '')) ? String(options.accentColor) : theme.primary
    const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="color-scheme" content="${appearance}"><title>Zyra</title><style>*{box-sizing:border-box}html,body{width:100%;height:100%;margin:0;overflow:hidden;background:${theme.bg};color:${theme.text};font-family:system-ui,-apple-system,"Segoe UI",sans-serif}.bar{height:34px;display:flex;align-items:center;border-bottom:1px solid ${theme.border};background:${theme.card};box-shadow:inset 0 2px 0 ${accent}}.brand{width:76px;height:100%;display:flex;align-items:center;padding:0 12px;border-right:1px solid ${theme.border};color:${theme.textDark};font-size:11px;font-weight:650}.tab{height:28px;max-width:220px;margin-left:4px;padding:0 10px;display:flex;align-items:center;gap:7px;border:1px solid color-mix(in srgb,${accent} 30%,${theme.borderSecondary});border-radius:6px;background:color-mix(in srgb,${accent} 10%,${theme.card});font-size:10px;font-weight:600}.dot{width:7px;height:7px;flex:0 0 auto;border-radius:50%;background:${accent}}.label{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.surface{height:calc(100% - 34px);display:flex;align-items:center;justify-content:center;background:radial-gradient(circle at 50% 36%,color-mix(in srgb,${accent} 8%,transparent),transparent 42%),${theme.bg}}.status{display:flex;align-items:center;gap:8px;color:${theme.textDarker};font-size:11px}.spinner{width:12px;height:12px;border:1.5px solid ${theme.borderSecondary};border-top-color:${accent};border-radius:50%;animation:spin .8s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}@media(prefers-reduced-motion:reduce){.spinner{animation:none}}</style></head><body><div class="bar"><div class="brand">Zyra</div><div class="tab"><span class="dot"></span><span class="label">${label}</span></div></div><div class="surface"><div class="status"><span class="spinner"></span><span>${label}</span></div></div></body></html>`
    return `data:text/html;charset=utf-8,${encodeURIComponent(html)}`
}

