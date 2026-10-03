import { renderAuthCallbackPage } from './auth-callback-page.mjs';
export const OPENAI_CODEX_CALLBACK_SUCCESS_HTML = renderAuthCallbackPage({ serviceName: 'ChatGPT', serviceKey: 'chatgpt' });
