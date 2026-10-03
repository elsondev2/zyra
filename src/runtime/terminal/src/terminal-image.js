// Generated from the maintained TypeScript in ../source by scripts/build-owned-runtime.mjs.
import { execSync } from "node:child_process";
import { homedir } from "node:os";
import { isAbsolute } from "node:path";
import { pathToFileURL } from "node:url";
let cachedCapabilities = null;
let capabilityOverrides = {};
let cellDimensions = { widthPx: 9, heightPx: 18 };
function getCellDimensions() {
  return cellDimensions;
}
function setCellDimensions(dims) {
  cellDimensions = dims;
}
function probeTmuxHyperlinks() {
  try {
    const termfeatures = execSync("tmux display-message -p '#{client_termfeatures}'", {
      encoding: "utf8",
      timeout: 250,
      stdio: ["ignore", "pipe", "ignore"]
    });
    return termfeatures.split(",").map((feature) => feature.trim()).includes("hyperlinks");
  } catch {
    return false;
  }
}
function detectCapabilitiesFromEnvironment(tmuxForwardsHyperlink) {
  const termProgram = process.env.TERM_PROGRAM?.toLowerCase() || "";
  const terminalEmulator = process.env.TERMINAL_EMULATOR?.toLowerCase() || "";
  const term = process.env.TERM?.toLowerCase() || "";
  const colorTerm = process.env.COLORTERM?.toLowerCase() || "";
  const hasTrueColorHint = colorTerm === "truecolor" || colorTerm === "24bit";
  const isWindowsConsole = process.platform === "win32";
  if (process.env.TMUX || term.startsWith("tmux")) {
    return { images: null, trueColor: hasTrueColorHint, hyperlinks: tmuxForwardsHyperlink() };
  }
  if (term.startsWith("screen")) {
    return { images: null, trueColor: hasTrueColorHint, hyperlinks: false };
  }
  if (process.env.KITTY_WINDOW_ID || termProgram === "kitty") {
    return { images: "kitty", trueColor: true, hyperlinks: true };
  }
  if (termProgram === "ghostty" || term.includes("ghostty") || process.env.GHOSTTY_RESOURCES_DIR) {
    return { images: "kitty", trueColor: true, hyperlinks: true };
  }
  if (process.env.WEZTERM_PANE || termProgram === "wezterm") {
    return { images: "kitty", trueColor: true, hyperlinks: true };
  }
  if (termProgram === "warpterminal" || process.env.WARP_SESSION_ID || process.env.WARP_TERMINAL_SESSION_UUID) {
    return { images: "kitty", trueColor: true, hyperlinks: true };
  }
  if (process.env.ITERM_SESSION_ID || termProgram === "iterm.app") {
    return { images: "iterm2", trueColor: true, hyperlinks: true };
  }
  if (process.env.WT_SESSION) {
    return { images: null, trueColor: true, hyperlinks: true };
  }
  if (termProgram === "vscode") {
    return { images: null, trueColor: true, hyperlinks: true };
  }
  if (termProgram === "alacritty") {
    return { images: null, trueColor: true, hyperlinks: true };
  }
  if (terminalEmulator === "jetbrains-jediterm") {
    return { images: null, trueColor: true, hyperlinks: false };
  }
  if (isWindowsConsole) {
    return { images: null, trueColor: true, hyperlinks: false };
  }
  return { images: null, trueColor: hasTrueColorHint, hyperlinks: false };
}
function parseBooleanCapabilityOverride(value) {
  return value === "1" ? true : value === "0" ? false : void 0;
}
function detectCapabilities(tmuxForwardsHyperlink = probeTmuxHyperlinks) {
  const hyperlinks = parseBooleanCapabilityOverride(process.env.ZYRA_HYPERLINKS);
  const detected = detectCapabilitiesFromEnvironment(
    hyperlinks === void 0 ? tmuxForwardsHyperlink : () => hyperlinks
  );
  const imageProtocol = process.env.ZYRA_IMAGE_PROTOCOL?.toLowerCase();
  const images = imageProtocol === "kitty" || imageProtocol === "iterm2" ? imageProtocol : imageProtocol === "none" || imageProtocol === "0" ? null : void 0;
  const trueColor = parseBooleanCapabilityOverride(process.env.ZYRA_TRUE_COLOR);
  return {
    ...detected,
    ...images !== void 0 ? { images } : {},
    ...trueColor !== void 0 ? { trueColor } : {},
    ...hyperlinks !== void 0 ? { hyperlinks } : {}
  };
}
function getCapabilities() {
  if (!cachedCapabilities) {
    const hyperlinks = capabilityOverrides.hyperlinks;
    cachedCapabilities = {
      ...detectCapabilities(hyperlinks === void 0 ? void 0 : () => hyperlinks),
      ...capabilityOverrides
    };
  }
  return cachedCapabilities;
}
function resetCapabilitiesCache() {
  cachedCapabilities = null;
}
function setCapabilityOverrides(overrides) {
  if (capabilityOverrides.images === overrides.images && capabilityOverrides.trueColor === overrides.trueColor && capabilityOverrides.hyperlinks === overrides.hyperlinks) {
    return;
  }
  capabilityOverrides = { ...overrides };
  cachedCapabilities = null;
}
function setCapabilities(caps) {
  cachedCapabilities = caps;
}
const KITTY_PREFIX = "\x1B_G";
const ITERM2_PREFIX = "\x1B]1337;File=";
function isImageLine(line) {
  if (line.startsWith(KITTY_PREFIX) || line.startsWith(ITERM2_PREFIX)) {
    return true;
  }
  return line.includes(KITTY_PREFIX) || line.includes(ITERM2_PREFIX);
}
function allocateImageId() {
  return Math.floor(Math.random() * 4294967294) + 1;
}
function encodeKitty(base64Data, options = {}) {
  const CHUNK_SIZE = 4096;
  const params = ["a=T", "f=100", "q=2"];
  if (options.moveCursor === false) params.push("C=1");
  if (options.columns) params.push(`c=${options.columns}`);
  if (options.rows) params.push(`r=${options.rows}`);
  if (options.imageId) params.push(`i=${options.imageId}`);
  if (base64Data.length <= CHUNK_SIZE) {
    return `\x1B_G${params.join(",")};${base64Data}\x1B\\`;
  }
  const chunks = [];
  let offset = 0;
  let isFirst = true;
  while (offset < base64Data.length) {
    const chunk = base64Data.slice(offset, offset + CHUNK_SIZE);
    const isLast = offset + CHUNK_SIZE >= base64Data.length;
    if (isFirst) {
      chunks.push(`\x1B_G${params.join(",")},m=1;${chunk}\x1B\\`);
      isFirst = false;
    } else if (isLast) {
      chunks.push(`\x1B_Gm=0;${chunk}\x1B\\`);
    } else {
      chunks.push(`\x1B_Gm=1;${chunk}\x1B\\`);
    }
    offset += CHUNK_SIZE;
  }
  return chunks.join("");
}
function deleteKittyImage(imageId) {
  return `\x1B_Ga=d,d=I,i=${imageId},q=2\x1B\\`;
}
function deleteAllKittyImages() {
  return "\x1B_Ga=d,d=A,q=2\x1B\\";
}
function deleteAllKittyPlacements() {
  return "\x1B_Ga=d,d=a,q=2\x1B\\";
}
function encodeITerm2(base64Data, options = {}) {
  const params = [
    `inline=${options.inline !== false ? 1 : 0}`,
    `size=${Buffer.byteLength(base64Data, "base64")}`
  ];
  if (options.width !== void 0) params.push(`width=${options.width}`);
  if (options.height !== void 0) params.push(`height=${options.height}`);
  if (options.name) {
    const nameBase64 = Buffer.from(options.name).toString("base64");
    params.push(`name=${nameBase64}`);
  }
  if (options.preserveAspectRatio === false) {
    params.push("preserveAspectRatio=0");
  }
  return `\x1B]1337;File=${params.join(";")}:${base64Data}\x07`;
}
const kittyImageMetadata = /* @__PURE__ */ new Map();
let kittyTransmissionGeneration = 0;
function registerKittyImageMetadata(metadata) {
  kittyTransmissionGeneration += 1;
  kittyImageMetadata.delete(metadata.imageId);
  kittyImageMetadata.set(metadata.imageId, { ...metadata, transmissionGeneration: kittyTransmissionGeneration });
  if (kittyImageMetadata.size > 1e3) {
    const oldestImageId = kittyImageMetadata.keys().next().value;
    if (oldestImageId !== void 0) kittyImageMetadata.delete(oldestImageId);
  }
}
function getRegisteredKittyImageMetadata(line) {
  const controls = /\x1b_G([^;]*);/.exec(line)?.[1];
  if (!controls) return void 0;
  const imageId = /(?:^|,)i=(\d+)(?:,|$)/.exec(controls)?.[1];
  return imageId === void 0 ? void 0 : kittyImageMetadata.get(Number.parseInt(imageId, 10));
}
function getKittyImageMetadata(line) {
  const metadata = getRegisteredKittyImageMetadata(line);
  if (!metadata) return void 0;
  return {
    imageId: metadata.imageId,
    columns: metadata.columns,
    rows: metadata.rows,
    widthPx: metadata.widthPx,
    heightPx: metadata.heightPx
  };
}
const KITTY_PLACEMENT_CONTROL_KEYS = /* @__PURE__ */ new Set([
  "i",
  "p",
  "x",
  "y",
  "w",
  "h",
  "X",
  "Y",
  "c",
  "r",
  "C",
  "U",
  "z",
  "P",
  "Q",
  "H",
  "V"
]);
function getKittyImagePlacement(line) {
  const match = /\x1b_G([^;]*);/.exec(line);
  const metadata = getRegisteredKittyImageMetadata(line);
  if (!match || !metadata) return void 0;
  let commandStart = match.index;
  let commandControls = match[1];
  let transmissionEnd;
  while (true) {
    const terminator = line.indexOf("\x1B\\", commandStart + KITTY_PREFIX.length);
    if (terminator === -1) return void 0;
    transmissionEnd = terminator + 2;
    if (!/(?:^|,)m=1(?:,|$)/.test(commandControls)) break;
    commandStart = transmissionEnd;
    if (!line.startsWith(KITTY_PREFIX, commandStart)) return void 0;
    const controlsEnd = line.indexOf(";", commandStart + KITTY_PREFIX.length);
    if (controlsEnd === -1) return void 0;
    commandControls = line.slice(commandStart + KITTY_PREFIX.length, controlsEnd);
  }
  const controls = match[1].split(",").filter((control) => KITTY_PLACEMENT_CONTROL_KEYS.has(control.split("=", 1)[0] ?? ""));
  const sequence = `\x1B_Ga=p,q=2,${controls.join(",")}\x1B\\`;
  return {
    imageId: metadata.imageId,
    transmissionGeneration: metadata.transmissionGeneration,
    transmissionBytes: transmissionEnd - match.index,
    estimatedDecodedBytes: metadata.widthPx * metadata.heightPx * 4,
    sequence,
    replacementLine: `${line.slice(0, match.index)}${sequence}${line.slice(transmissionEnd)}`
  };
}
function cropKittyImageLine(line, hiddenRows, visibleRows) {
  const metadata = getKittyImageMetadata(line);
  const match = /\x1b_G([^;]*);/.exec(line);
  if (!metadata || !match || hiddenRows < 0 || hiddenRows >= metadata.rows || visibleRows <= 0) return line;
  const croppedRows = Math.min(visibleRows, metadata.rows - hiddenRows);
  if (hiddenRows === 0 && croppedRows === metadata.rows) return line;
  const sourceY = Math.floor(metadata.heightPx * hiddenRows / metadata.rows);
  const sourceEnd = Math.ceil(metadata.heightPx * (hiddenRows + croppedRows) / metadata.rows);
  const sourceHeight = Math.max(1, Math.min(metadata.heightPx, sourceEnd) - sourceY);
  const controls = match[1].split(",").filter((control) => !/^[yhr]=/.test(control));
  controls.push(`y=${sourceY}`, `h=${sourceHeight}`, `r=${croppedRows}`);
  return `${line.slice(0, match.index)}\x1B_G${controls.join(",")};${line.slice(match.index + match[0].length)}`;
}
function calculateImageCellSize(imageDimensions, maxWidthCells, maxHeightCells, cellDimensions2 = { widthPx: 9, heightPx: 18 }) {
  const maxWidth = Math.max(1, Math.floor(maxWidthCells));
  const maxHeight = maxHeightCells === void 0 ? void 0 : Math.max(1, Math.floor(maxHeightCells));
  const imageWidth = Math.max(1, imageDimensions.widthPx);
  const imageHeight = Math.max(1, imageDimensions.heightPx);
  const widthScale = maxWidth * cellDimensions2.widthPx / imageWidth;
  const heightScale = maxHeight === void 0 ? widthScale : maxHeight * cellDimensions2.heightPx / imageHeight;
  const scale = Math.min(widthScale, heightScale);
  const scaledWidthPx = imageWidth * scale;
  const scaledHeightPx = imageHeight * scale;
  const columns = Math.ceil(scaledWidthPx / cellDimensions2.widthPx);
  const rows = Math.ceil(scaledHeightPx / cellDimensions2.heightPx);
  return {
    columns: Math.max(1, Math.min(maxWidth, columns)),
    rows: Math.max(1, maxHeight === void 0 ? rows : Math.min(maxHeight, rows))
  };
}
function calculateImageRows(imageDimensions, targetWidthCells, cellDimensions2 = { widthPx: 9, heightPx: 18 }) {
  return calculateImageCellSize(imageDimensions, targetWidthCells, void 0, cellDimensions2).rows;
}
function getPngDimensions(base64Data) {
  try {
    const buffer = Buffer.from(base64Data, "base64");
    if (buffer.length < 24) {
      return null;
    }
    if (buffer[0] !== 137 || buffer[1] !== 80 || buffer[2] !== 78 || buffer[3] !== 71) {
      return null;
    }
    const width = buffer.readUInt32BE(16);
    const height = buffer.readUInt32BE(20);
    return { widthPx: width, heightPx: height };
  } catch {
    return null;
  }
}
function getJpegDimensions(base64Data) {
  try {
    const buffer = Buffer.from(base64Data, "base64");
    if (buffer.length < 2) {
      return null;
    }
    if (buffer[0] !== 255 || buffer[1] !== 216) {
      return null;
    }
    let offset = 2;
    while (offset < buffer.length - 9) {
      if (buffer[offset] !== 255) {
        offset++;
        continue;
      }
      const marker = buffer[offset + 1];
      if (marker >= 192 && marker <= 194) {
        const height = buffer.readUInt16BE(offset + 5);
        const width = buffer.readUInt16BE(offset + 7);
        return { widthPx: width, heightPx: height };
      }
      if (offset + 3 >= buffer.length) {
        return null;
      }
      const length = buffer.readUInt16BE(offset + 2);
      if (length < 2) {
        return null;
      }
      offset += 2 + length;
    }
    return null;
  } catch {
    return null;
  }
}
function getGifDimensions(base64Data) {
  try {
    const buffer = Buffer.from(base64Data, "base64");
    if (buffer.length < 10) {
      return null;
    }
    const sig = buffer.slice(0, 6).toString("ascii");
    if (sig !== "GIF87a" && sig !== "GIF89a") {
      return null;
    }
    const width = buffer.readUInt16LE(6);
    const height = buffer.readUInt16LE(8);
    return { widthPx: width, heightPx: height };
  } catch {
    return null;
  }
}
function getWebpDimensions(base64Data) {
  try {
    const buffer = Buffer.from(base64Data, "base64");
    if (buffer.length < 30) {
      return null;
    }
    const riff = buffer.slice(0, 4).toString("ascii");
    const webp = buffer.slice(8, 12).toString("ascii");
    if (riff !== "RIFF" || webp !== "WEBP") {
      return null;
    }
    const chunk = buffer.slice(12, 16).toString("ascii");
    if (chunk === "VP8 ") {
      if (buffer.length < 30) return null;
      const width = buffer.readUInt16LE(26) & 16383;
      const height = buffer.readUInt16LE(28) & 16383;
      return { widthPx: width, heightPx: height };
    } else if (chunk === "VP8L") {
      if (buffer.length < 25) return null;
      const bits = buffer.readUInt32LE(21);
      const width = (bits & 16383) + 1;
      const height = (bits >> 14 & 16383) + 1;
      return { widthPx: width, heightPx: height };
    } else if (chunk === "VP8X") {
      if (buffer.length < 30) return null;
      const width = (buffer[24] | buffer[25] << 8 | buffer[26] << 16) + 1;
      const height = (buffer[27] | buffer[28] << 8 | buffer[29] << 16) + 1;
      return { widthPx: width, heightPx: height };
    }
    return null;
  } catch {
    return null;
  }
}
function getImageDimensions(base64Data, mimeType) {
  if (mimeType === "image/png") {
    return getPngDimensions(base64Data);
  }
  if (mimeType === "image/jpeg") {
    return getJpegDimensions(base64Data);
  }
  if (mimeType === "image/gif") {
    return getGifDimensions(base64Data);
  }
  if (mimeType === "image/webp") {
    return getWebpDimensions(base64Data);
  }
  return null;
}
function renderImage(base64Data, imageDimensions, options = {}) {
  const caps = getCapabilities();
  if (!caps.images) {
    return null;
  }
  const maxWidth = options.maxWidthCells ?? 80;
  const size = calculateImageCellSize(imageDimensions, maxWidth, options.maxHeightCells, getCellDimensions());
  if (caps.images === "kitty") {
    if (options.imageId !== void 0) {
      registerKittyImageMetadata({
        imageId: options.imageId,
        columns: size.columns,
        rows: size.rows,
        widthPx: imageDimensions.widthPx,
        heightPx: imageDimensions.heightPx
      });
    }
    const sequence = encodeKitty(base64Data, {
      columns: size.columns,
      rows: size.rows,
      imageId: options.imageId,
      moveCursor: options.moveCursor
    });
    return { sequence, columns: size.columns, rows: size.rows, imageId: options.imageId };
  }
  if (caps.images === "iterm2") {
    const sequence = encodeITerm2(base64Data, {
      width: size.columns,
      height: "auto",
      preserveAspectRatio: options.preserveAspectRatio ?? true
    });
    return { sequence, columns: size.columns, rows: size.rows };
  }
  return null;
}
function hyperlink(text, url) {
  return `\x1B]8;;${url}\x1B\\${text}\x1B]8;;\x1B\\`;
}
function shortenImagePath(filename) {
  const home = homedir();
  if (home && (filename === home || filename.startsWith(`${home}/`) || filename.startsWith(`${home}\\`))) {
    return `~${filename.slice(home.length)}`;
  }
  return filename;
}
function imageFallback(mimeType, dimensions, filename) {
  const parts = [];
  if (filename) {
    const display = shortenImagePath(filename);
    if (getCapabilities().hyperlinks && isAbsolute(filename)) {
      parts.push(hyperlink(display, pathToFileURL(filename).href));
    } else {
      parts.push(display);
    }
  }
  parts.push(`[${mimeType}]`);
  if (dimensions) parts.push(`${dimensions.widthPx}x${dimensions.heightPx}`);
  return `[Image: ${parts.join(" ")}]`;
}
export {
  allocateImageId,
  calculateImageCellSize,
  calculateImageRows,
  cropKittyImageLine,
  deleteAllKittyImages,
  deleteAllKittyPlacements,
  deleteKittyImage,
  detectCapabilities,
  encodeITerm2,
  encodeKitty,
  getCapabilities,
  getCellDimensions,
  getGifDimensions,
  getImageDimensions,
  getJpegDimensions,
  getKittyImageMetadata,
  getKittyImagePlacement,
  getPngDimensions,
  getWebpDimensions,
  hyperlink,
  imageFallback,
  isImageLine,
  registerKittyImageMetadata,
  renderImage,
  resetCapabilitiesCache,
  setCapabilities,
  setCapabilityOverrides,
  setCellDimensions
};
