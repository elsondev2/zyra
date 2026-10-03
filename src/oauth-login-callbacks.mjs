function unavailablePrompt() {
  throw new Error("Browser sign-in did not complete automatically.");
}

/**
 * Keeps Pi's manual-code fallback open while the local browser callback is in
 * flight. Rejecting this prompt immediately cancels Pi's callback listener
 * before the browser has a chance to return the authorization code.
 */
export function waitForAutomaticBrowserCallback(prompt = {}) {
  return new Promise((_resolve, reject) => {
    const signal = prompt?.signal;
    if (!signal) return;
    const abort = () => reject(signal.reason instanceof Error ? signal.reason : new Error("Browser sign-in was cancelled."));
    if (signal.aborted) abort();
    else signal.addEventListener("abort", abort, { once: true });
  });
}

/**
 * Complete Pi's OAuth callback contract for Zyra's browser-first login flows.
 * Callers may still provide onSelect to opt into another provider-supported method.
 */
export function createBrowserOAuthLoginCallbacks(options = {}) {
  const onPrompt = typeof options.onPrompt === "function" ? options.onPrompt : unavailablePrompt;
  const onSelect = typeof options.onSelect === "function"
    ? options.onSelect
    : async (prompt) => {
        const browser = Array.isArray(prompt?.options)
          ? prompt.options.find((option) => option?.id === "browser")
          : undefined;
        if (!browser) throw new Error("Browser sign-in is unavailable for this OpenAI connection.");
        return browser.id;
      };

  const onAuth = typeof options.onAuth === "function" ? options.onAuth : () => undefined;
  const onDeviceCode = typeof options.onDeviceCode === "function" ? options.onDeviceCode : () => undefined;
  const onProgress = typeof options.onProgress === "function" ? options.onProgress : () => undefined;
  const onManualCodeInput = typeof options.onManualCodeInput === "function"
    ? options.onManualCodeInput
    : () => onPrompt({
        message: "Complete login in your browser, or paste the authorization code or redirect URL here.",
      });

  return {
    prompt: async (prompt) => {
      if (prompt.type === "select") return onSelect(prompt);
      if (prompt.type === "manual_code") return onManualCodeInput(prompt);
      return onPrompt(prompt);
    },
    notify: (event) => {
      if (event.type === "auth_url") onAuth(event);
      else if (event.type === "device_code") onDeviceCode(event);
      else if (event.type === "progress" || event.type === "info") onProgress(event.message);
    },
    onAuth,
    onDeviceCode,
    onPrompt,
    onProgress,
    onManualCodeInput,
    onSelect,
    signal: options.signal,
  };
}
