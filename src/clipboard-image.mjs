import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFile, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const localRequire = createRequire(import.meta.url);
const POWERSHELL_TIMEOUT_MS = 5000;
let nativeClipboard;
let nativeClipboardLoaded = false;
let clipboardReadQueue = Promise.resolve();

export function readClipboardImage(options = {}) {
  const capture = () => readClipboardImageNow(options);
  const pending = clipboardReadQueue.then(capture, capture);
  clipboardReadQueue = pending.catch(() => null);
  return pending;
}

async function readClipboardImageNow(options = {}) {
  const clipboard = options.clipboard ?? loadNativeClipboard();
  const nativeImage = await readNativeClipboardImage(clipboard);
  if (nativeImage) return nativeImage;
  if ((options.platform ?? process.platform) !== "win32") return null;
  return readClipboardImageViaPowerShell(options);
}

export function readImageDimensions(data, mimeType = "image/png") {
  const bytes = Buffer.isBuffer(data) ? data : Buffer.from(data ?? []);
  const mime = String(mimeType ?? "").toLowerCase();
  if ((mime === "image/png" || hasPngSignature(bytes)) && bytes.length >= 24) {
    return positiveDimensions(bytes.readUInt32BE(16), bytes.readUInt32BE(20));
  }
  if ((mime === "image/gif" || bytes.subarray(0, 3).toString("ascii") === "GIF") && bytes.length >= 10) {
    return positiveDimensions(bytes.readUInt16LE(6), bytes.readUInt16LE(8));
  }
  if (mime === "image/jpeg" || hasJpegSignature(bytes)) return readJpegDimensions(bytes);
  return {};
}

async function readNativeClipboardImage(clipboard) {
  if (!clipboard?.hasImage?.()) return null;
  try {
    const value = await clipboard.getImageBinary();
    const bytes = Buffer.from(value ?? []);
    if (bytes.length === 0) return null;
    return buildClipboardImage(bytes, "image/png", "native");
  } catch {
    return null;
  }
}

function loadNativeClipboard() {
  if (nativeClipboardLoaded) return nativeClipboard;
  nativeClipboardLoaded = true;
  const requires = [localRequire];
  try {
    const piEntry = fileURLToPath(import.meta.resolve("@earendil-works/pi-coding-agent"));
    const piRoot = path.dirname(path.dirname(piEntry));
    requires.push(createRequire(path.join(piRoot, "package.json")));
  } catch {
    // The PowerShell fallback remains available when Pi's optional native addon is absent.
  }
  for (const requireClipboard of requires) {
    try {
      nativeClipboard = requireClipboard("@mariozechner/clipboard");
      break;
    } catch {
      // Try the next resolution root.
    }
  }
  return nativeClipboard;
}

async function readClipboardImageViaPowerShell(options = {}) {
  const tempFile = path.join(os.tmpdir(), `zyra-clipboard-${randomUUID()}.png`);
  const quotedPath = tempFile.replaceAll("'", "''");
  const script = [
    "$ErrorActionPreference = 'Stop'",
    "Add-Type -AssemblyName System.Windows.Forms",
    "Add-Type -AssemblyName System.Drawing",
    "if (-not [System.Windows.Forms.Clipboard]::ContainsImage()) { exit 3 }",
    "$img = [System.Windows.Forms.Clipboard]::GetImage()",
    `$img.Save('${quotedPath}', [System.Drawing.Imaging.ImageFormat]::Png)`,
    "Write-Output \"$($img.Width)x$($img.Height)\"",
  ].join("; ");
  try {
    const execute = options.execFile ?? execFileAsync;
    const result = await execute("powershell.exe", ["-NoProfile", "-STA", "-Command", script], {
      timeout: options.timeoutMs ?? POWERSHELL_TIMEOUT_MS,
      windowsHide: true,
      maxBuffer: 4096,
    });
    const bytes = await readFile(tempFile);
    if (bytes.length === 0) return null;
    const dimensions = parseDimensionText(result?.stdout);
    return buildClipboardImage(bytes, "image/png", "powershell", dimensions);
  } catch {
    return null;
  } finally {
    await rm(tempFile, { force: true }).catch(() => {});
  }
}

function buildClipboardImage(bytes, mimeType, source, dimensions = readImageDimensions(bytes, mimeType)) {
  return {
    image: {
      type: "image",
      data: bytes.toString("base64"),
      mimeType,
    },
    width: dimensions.width,
    height: dimensions.height,
    source,
  };
}

function parseDimensionText(value) {
  const match = String(value ?? "").trim().match(/^(\d+)x(\d+)$/i);
  return match ? positiveDimensions(Number(match[1]), Number(match[2])) : {};
}

function positiveDimensions(width, height) {
  return Number.isFinite(width) && width > 0 && Number.isFinite(height) && height > 0
    ? { width, height }
    : {};
}

function hasPngSignature(bytes) {
  return bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
}

function hasJpegSignature(bytes) {
  return bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xd8;
}

function readJpegDimensions(bytes) {
  let offset = 2;
  while (offset + 8 < bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = bytes[offset + 1];
    const length = bytes.readUInt16BE(offset + 2);
    if (length < 2 || offset + 2 + length > bytes.length) return {};
    if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
      return positiveDimensions(bytes.readUInt16BE(offset + 7), bytes.readUInt16BE(offset + 5));
    }
    offset += 2 + length;
  }
  return {};
}
