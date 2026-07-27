import { randomBytes, timingSafeEqual } from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";

export const TEMPORARY_BROWSER_RELAY_ENABLE_FILE = path.join(os.tmpdir(), "zyra-enable-temp-browser-relay");
const MAX_REQUEST_BYTES = 512 * 1024;

export function normalizeTemporaryBrowserOperation(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Browser relay operation is invalid.");
  const operation = String(value.operation || "");
  if (operation === "open_tab") return { operation, reveal: value.reveal !== false };
  if (operation === "list_targets") return { operation, targetKind: "zyra-browser" };
  if (!["request_grant", "observe", "act", "release"].includes(operation)) {
    throw new Error(`Browser relay operation is not allowed: ${operation || "missing"}.`);
  }
  if (operation !== "release") {
    const targetId = String(value.targetId || "");
    if (!targetId.startsWith("zyra-browser:")) throw new Error("The temporary relay is restricted to in-app Browser targets.");
  }
  return JSON.parse(JSON.stringify(value));
}

function tokenMatches(request, token) {
  const supplied = String(request.headers.authorization || "").replace(/^Bearer\s+/i, "");
  const left = Buffer.from(supplied);
  const right = Buffer.from(token);
  return left.length === right.length && timingSafeEqual(left, right);
}

export async function startTemporaryBrowserRelay({ controlClient, threadId }) {
  if (process.env.ZYRA_ENABLE_TEMP_BROWSER_RELAY !== "1" && !fs.existsSync(TEMPORARY_BROWSER_RELAY_ENABLE_FILE)) return null;
  try { fs.unlinkSync(TEMPORARY_BROWSER_RELAY_ENABLE_FILE); } catch {}

  const token = randomBytes(32).toString("base64url");
  const descriptorFile = path.join(os.tmpdir(), `zyra-browser-control-test-relay-${process.pid}.json`);
  const server = http.createServer((request, response) => {
    const respond = (status, value) => {
      if (response.writableEnded) return;
      const body = JSON.stringify(value);
      response.writeHead(status, {
        "content-type": "application/json",
        "content-length": Buffer.byteLength(body),
        "cache-control": "no-store"
      });
      response.end(body);
    };
    if (request.socket.remoteAddress !== "127.0.0.1" && request.socket.remoteAddress !== "::ffff:127.0.0.1") {
      respond(403, { ok: false, error: "Loopback requests only." });
      return;
    }
    if (request.method !== "POST" || request.url !== "/control" || !tokenMatches(request, token)) {
      respond(401, { ok: false, error: "Unauthorized." });
      return;
    }
    const chunks = [];
    let size = 0;
    request.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_REQUEST_BYTES) {
        respond(413, { ok: false, error: "Request is too large." });
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on("error", () => respond(400, { ok: false, error: "Invalid request." }));
    request.on("end", () => {
      if (size > MAX_REQUEST_BYTES || response.writableEnded) return;
      void (async () => {
        try {
          const payload = JSON.parse(Buffer.concat(chunks).toString("utf8"));
          const operation = normalizeTemporaryBrowserOperation(payload.operation);
          const result = await controlClient.request(operation, { timeoutMs: payload.timeoutMs });
          respond(200, { ok: true, result });
        } catch (error) {
          respond(400, {
            ok: false,
            error: error instanceof Error ? error.message : String(error),
            code: error?.code
          });
        }
      })();
    });
  });

  await new Promise((resolveListen, rejectListen) => {
    server.once("error", rejectListen);
    server.listen(0, "127.0.0.1", resolveListen);
  });
  server.unref();
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Temporary Browser relay did not bind to loopback.");

  fs.writeFileSync(descriptorFile, JSON.stringify({
    version: 1,
    port: address.port,
    token,
    threadId: String(threadId || ""),
    processId: process.pid,
    createdAt: new Date().toISOString()
  }), { encoding: "utf8", mode: 0o600 });

  let stopped = false;
  return {
    descriptorFile,
    stop() {
      if (stopped) return;
      stopped = true;
      server.close();
      try { fs.unlinkSync(descriptorFile); } catch {}
    }
  };
}
