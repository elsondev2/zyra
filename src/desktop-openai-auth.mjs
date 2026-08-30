import {
  chooseVerifiedApiModel,
  configureOpenAIApiKey,
  removeZyraAuthMethod,
  verifyOpenAIApiKey,
} from "./auth-methods.mjs";
import { createBrowserOAuthLoginCallbacks } from "./oauth-login-callbacks.mjs";
import { createZyraAuthStorage } from "./pi-runtime.mjs";

export async function loginZyraAuth(provider = "openai-codex", options = {}) {
  const authStorage = options.authStorage ?? await createZyraAuthStorage(options);
  await authStorage.login(provider, createBrowserOAuthLoginCallbacks(options));
  return { provider, status: authStorage.getAuthStatus(provider) };
}

export async function getZyraAuthStatus(provider = "openai-codex", options = {}) {
  const authStorage = options.authStorage ?? await createZyraAuthStorage(options);
  return { provider, status: authStorage.getAuthStatus(provider) };
}

export async function configureZyraOpenAIApiKey(apiKey, options = {}) {
  const authStorage = options.authStorage ?? await createZyraAuthStorage(options);
  return withVerifiedApiModel(await configureOpenAIApiKey(authStorage, apiKey, options));
}

export async function verifyZyraOpenAIApiAuth(options = {}) {
  const authStorage = options.authStorage ?? await createZyraAuthStorage(options);
  if (!authStorage.hasAuth?.("openai")) throw new Error("OpenAI API is not connected.");
  const key = await authStorage.getApiKey("openai");
  return withVerifiedApiModel(await verifyOpenAIApiKey(key, options));
}

function withVerifiedApiModel(verification) {
  return { ...verification, model: chooseVerifiedApiModel(verification) };
}

export async function removeZyraAuth(method, options = {}) {
  const authStorage = options.authStorage ?? await createZyraAuthStorage(options);
  return await removeZyraAuthMethod(authStorage, method);
}
