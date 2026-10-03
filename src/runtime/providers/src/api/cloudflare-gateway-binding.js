// Generated from the maintained TypeScript in ../source by scripts/build-owned-runtime.mjs.
const CLOUDFLARE_GATEWAY_BINDING_AUTH_SENTINEL = "cloudflare-gateway-binding";
const STRIP_HEADERS = /* @__PURE__ */ new Set(["content-length", "host", "cf-aig-authorization"]);
function createGatewayBindingFetch(options) {
  const { binding, gateway } = options;
  const base = new URL(options.baseUrl);
  const basePath = base.pathname.endsWith("/") ? base.pathname : `${base.pathname}/`;
  return async (input, init) => {
    const request = input instanceof Request ? input : void 0;
    const url = request ? request.url : input.toString();
    const method = (init?.method ?? request?.method ?? "GET").toUpperCase();
    let parsed;
    try {
      parsed = new URL(url);
    } catch {
      parsed = void 0;
    }
    if (parsed === void 0 || parsed.origin !== base.origin || !parsed.pathname.startsWith(basePath)) {
      throw new Error(
        `createGatewayBindingFetch: ${method} ${url} is outside the configured gateway prefix (${base.origin}${basePath}); this fetch only serves its gateway-bound client`
      );
    }
    const unexpressible = (reason) => {
      throw new Error(
        `createGatewayBindingFetch: cannot express ${method} ${url} as a universal gateway request (${reason}); route it over HTTPS with gateway auth instead`
      );
    };
    if (method !== "POST") return unexpressible("only POST is supported");
    const rest = parsed.pathname.slice(basePath.length);
    const slash = rest.indexOf("/");
    if (slash <= 0) {
      return unexpressible("missing provider/endpoint path");
    }
    const provider = rest.slice(0, slash);
    const endpoint = rest.slice(slash + 1) + parsed.search;
    const bodyText = await readBodyText(request, init);
    let query;
    try {
      query = bodyText === void 0 ? void 0 : JSON.parse(bodyText);
    } catch {
      return unexpressible("non-JSON body");
    }
    if (query === void 0) {
      return unexpressible("missing body");
    }
    const headers = collectHeaders(request, init);
    const signal = init?.signal ?? (init && "signal" in init && init.signal === null ? void 0 : request?.signal);
    return binding.gateway(gateway).run({ provider, endpoint, headers, query }, signal ? { signal } : {});
  };
}
async function readBodyText(request, init) {
  const body = init?.body;
  if (body === void 0 || body === null) {
    if (init && "body" in init && body === null) return void 0;
    if (request && request.body !== null) return request.clone().text();
    return void 0;
  }
  if (typeof body === "string") return body;
  if (body instanceof Uint8Array) return new TextDecoder().decode(body);
  if (body instanceof ArrayBuffer) return new TextDecoder().decode(new Uint8Array(body));
  return new Request("http://body.local", {
    method: "POST",
    body,
    // The fetch spec requires `duplex: "half"` to construct a Request with a stream body
    // (Node's undici enforces it; it is ignored for the replayable body types). TypeScript's
    // RequestInit does not declare the field yet, hence the cast.
    duplex: "half"
  }).text();
}
function collectHeaders(request, init) {
  const result = {};
  const add = (key, value) => {
    const name = key.toLowerCase();
    if (!STRIP_HEADERS.has(name)) result[name] = value;
  };
  const headers = init?.headers;
  if (headers === void 0) {
    if (request) {
      for (const [key, value] of request.headers) add(key, value);
    }
  } else if (headers instanceof Headers) {
    for (const [key, value] of headers) add(key, value);
  } else if (Array.isArray(headers)) {
    for (const [key, value] of headers) add(key, value);
  } else {
    for (const [key, value] of Object.entries(headers)) {
      if (value !== void 0) add(key, String(value));
    }
  }
  return result;
}
export {
  CLOUDFLARE_GATEWAY_BINDING_AUTH_SENTINEL,
  createGatewayBindingFetch
};
