import { randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const brief = process.argv.includes("--brief");
const [command = "list", ...args] = process.argv.slice(2);
const operation = buildOperation(command, args);
const result = command === "wait-grant"
  ? await waitForGrant(args[0])
  : await requestRelay(operation, command === "open" ? 25_000 : 20_000);
printResult(result, readOption(args, "--screenshot"), brief);

function buildOperation(name, values) {
  if (name === "list" || name === "wait-grant") return { operation: "list_targets" };
  if (name === "open") return { operation: "open_tab", reveal: true };
  if (name === "raw") return JSON.parse(values.join(" "));
  if (name === "request") {
    const [targetId, origin] = values;
    requireValue(targetId, "targetId");
    requireValue(origin, "origin");
    return {
      operation: "request_grant",
      targetId,
      capabilities: [
        "observe.structure", "observe.screenshot", "navigate",
        "pointer.move", "pointer.click", "pointer.drag",
        "keyboard.type", "keyboard.key", "scroll", "form.select"
      ],
      durationMs: 10 * 60 * 1000,
      maxActions: 120,
      allowedOrigins: [new URL(origin).origin]
    };
  }
  if (name === "observe") {
    const [grantId, targetId] = values;
    requireValue(grantId, "grantId");
    requireValue(targetId, "targetId");
    return { operation: "observe", grantId, targetId, includeScreenshot: true };
  }
  const [grantId, targetId, revisionText, ...rest] = values;
  requireValue(grantId, "grantId");
  requireValue(targetId, "targetId");
  const observationRevision = integer(revisionText, "observationRevision");
  const action = buildAction(name, rest);
  return {
    operation: "act",
    version: 1,
    requestId: `live-test:${randomUUID()}`,
    grantId,
    targetId,
    observationRevision,
    action
  };
}

function buildAction(name, values) {
  if (name === "navigate") return { type: "navigate", url: new URL(requireValue(values[0], "url")).toString() };
  if (name === "move") return { type: "move", x: number(values[0], "x"), y: number(values[1], "y"), durationMs: optionalNumber(values[2]) };
  if (name === "click") return { type: "click", x: number(values[0], "x"), y: number(values[1], "y"), button: values[2] || "left", clickCount: optionalNumber(values[3]) || 1 };
  if (name === "drag") return {
    type: "drag",
    fromX: number(values[0], "fromX"), fromY: number(values[1], "fromY"),
    toX: number(values[2], "toX"), toY: number(values[3], "toY"),
    durationMs: optionalNumber(values[4]) || 500, button: "left"
  };
  if (name === "scroll") return {
    type: "scroll", x: number(values[0], "x"), y: number(values[1], "y"),
    deltaX: number(values[2], "deltaX"), deltaY: number(values[3], "deltaY")
  };
  if (name === "key") return { type: "key", key: requireValue(values[0], "key"), modifiers: values.slice(1) };
  throw new Error(`Unsupported live Browser command: ${name}.`);
}

async function waitForGrant(targetId) {
  requireValue(targetId, "targetId");
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    const result = await requestRelay({ operation: "list_targets" }, 10_000);
    const grant = Array.isArray(result.grants)
      ? result.grants.find((entry) => entry.targetId === targetId && entry.state === "active")
      : null;
    if (grant) return { grant };
    await new Promise((resolve) => setTimeout(resolve, 600));
  }
  throw new Error("Timed out waiting for the user-approved Browser grant.");
}

async function requestRelay(operation, timeoutMs) {
  const descriptors = fs.readdirSync(os.tmpdir())
    .filter((name) => /^zyra-browser-control-test-relay-\d+\.json$/.test(name))
    .map((name) => path.join(os.tmpdir(), name))
    .sort((left, right) => fs.statSync(right).mtimeMs - fs.statSync(left).mtimeMs);
  if (descriptors.length === 0) throw new Error("The temporary Browser relay is not running.");
  let lastConnectionError;
  for (const descriptorFile of descriptors) {
    let descriptor;
    try {
      descriptor = JSON.parse(fs.readFileSync(descriptorFile, "utf8"));
    } catch (error) {
      lastConnectionError = error;
      continue;
    }
    let response;
    try {
      response = await fetch(`http://127.0.0.1:${descriptor.port}/control`, {
        method: "POST",
        headers: { authorization: `Bearer ${descriptor.token}`, "content-type": "application/json" },
        body: JSON.stringify({ operation, timeoutMs }),
        signal: AbortSignal.timeout(Math.min(30_000, timeoutMs + 2_000))
      });
    } catch (error) {
      lastConnectionError = error;
      continue;
    }
    const payload = await response.json();
    if (!response.ok || !payload.ok) {
      throw Object.assign(new Error(payload.error || `HTTP ${response.status}`), { code: payload.code });
    }
    return payload.result || {};
  }
  throw lastConnectionError || new Error("No live Browser relay accepted the request.");
}

function printResult(result, screenshotFile, briefOutput = false) {
  const output = briefOutput && result?.observation
    ? {
        outcome: result.outcome || "completed",
        changed: result.changed,
        observation: {
          targetId: result.observation.targetId,
          revision: result.observation.revision,
          url: result.observation.url,
          title: result.observation.title,
          viewport: result.observation.viewport
        }
      }
    : structuredClone(result);
  if (output?.screenshot?.data) {
    const extension = output.screenshot.mimeType === "image/png" ? "png" : "jpg";
    const file = screenshotFile || path.join(os.tmpdir(), `zyra-live-browser-${Date.now()}.${extension}`);
    fs.writeFileSync(file, Buffer.from(output.screenshot.data, "base64"));
    output.screenshot = { mimeType: output.screenshot.mimeType, bytes: output.screenshot.bytes, file };
  }
  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
}

function readOption(values, name) {
  const index = values.indexOf(name);
  return index >= 0 ? values[index + 1] : undefined;
}

function requireValue(value, label) {
  if (!value) throw new Error(`${label} is required.`);
  return value;
}

function number(value, label) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error(`${label} must be a finite number.`);
  return parsed;
}

function integer(value, label) {
  const parsed = number(value, label);
  if (!Number.isSafeInteger(parsed) || parsed < 1) throw new Error(`${label} must be a positive integer.`);
  return parsed;
}

function optionalNumber(value) {
  return value === undefined ? undefined : number(value, "number");
}
