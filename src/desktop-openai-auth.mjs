import {
  configureOpenAIApiKey,
  removeZyraAuthMethod,
  verifyOpenAIApiKey,
} from "./auth-methods.mjs";
import { createBrowserOAuthLoginCallbacks } from "./oauth-login-callbacks.mjs";

let piAuthStoragePromise;

async function loadPiAuthStorage() {
  if (!piAuthStoragePromise) {
    const packageEntry = import.meta.resolve("@earendil-works/pi-coding-agent");
    const authStorageUrl = new URL("./core/auth-storage.js", packageEntry);
    piAuthStoragePromise = import(authStorageUrl.href)
      .then((module) => {
        if (typeof module.AuthStorage !== "function") {
          throw new Error("Pi auth storage is unavailable.");
        }
        return module.AuthStorage;
      })
      .catch((error) => {
        piAuthStoragePromise = undefined;
        throw error;
      });
  }
  return piAuthStoragePromise;
}

export async function loginZyraAuth(provider = "openai-codex", options = {}) {
  const authStorage = options.authStorage ?? (await loadPiAuthStorage()).create();
  await authStorage.login(provider, createBrowserOAuthLoginCallbacks(options));
  return { provider, status: authStorage.getAuthStatus(provider) };
}

export async function getZyraAuthStatus(provider = "openai-codex", options = {}) {
  const AuthStorage = await loadPiAuthStorage();
  const authStorage = options.authStorage ?? AuthStorage.create();
  return { provider, status: authStorage.getAuthStatus(provider) };
}

export async function configureZyraOpenAIApiKey(apiKey, options = {}) {
  const AuthStorage = await loadPiAuthStorage();
  const authStorage = options.authStorage ?? AuthStorage.create();
  return configureOpenAIApiKey(authStorage, apiKey, options);
}

export async function verifyZyraOpenAIApiAuth(options = {}) {
  const AuthStorage = await loadPiAuthStorage();
  const authStorage = options.authStorage ?? AuthStorage.create();
  if (!authStorage.hasAuth?.("openai")) throw new Error("OpenAI API is not connected.");
  const key = await authStorage.getApiKey("openai");
  return verifyOpenAIApiKey(key, options);
}

export async function removeZyraAuth(method, options = {}) {
  const AuthStorage = await loadPiAuthStorage();
  const authStorage = options.authStorage ?? AuthStorage.create();
  return removeZyraAuthMethod(authStorage, method);
}
