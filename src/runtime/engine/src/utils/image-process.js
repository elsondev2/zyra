// Generated from the maintained TypeScript in ../source by scripts/build-owned-runtime.mjs.
import { convertImageBytesToPng } from "./image-convert.js";
import { formatDimensionNote, resizeImage } from "./image-resize.js";
function baseMimeType(mimeType) {
  return mimeType.split(";")[0]?.trim().toLowerCase() ?? mimeType.toLowerCase();
}
function normalizeSupportedImageMimeType(mimeType) {
  switch (baseMimeType(mimeType)) {
    case "image/png":
      return "image/png";
    case "image/jpeg":
    case "image/jpg":
      return "image/jpeg";
    case "image/gif":
      return "image/gif";
    case "image/webp":
      return "image/webp";
    default:
      return null;
  }
}
async function normalizeImage(bytes, mimeType) {
  const normalizedMimeType = normalizeSupportedImageMimeType(mimeType);
  if (normalizedMimeType) {
    return { bytes, mimeType: normalizedMimeType };
  }
  const pngBytes = await convertImageBytesToPng(bytes);
  if (!pngBytes) {
    return null;
  }
  return {
    bytes: pngBytes,
    mimeType: "image/png",
    convertedFrom: baseMimeType(mimeType)
  };
}
function conversionHint(from, to) {
  if (!from || from === to) return void 0;
  return `[Image converted from ${from} to ${to}.]`;
}
async function processImage(bytes, mimeType, options) {
  const autoResizeImages = options?.autoResizeImages ?? true;
  const normalized = await normalizeImage(bytes, mimeType);
  if (!normalized) {
    return {
      ok: false,
      message: "[Image omitted: could not be converted to a supported inline image format.]"
    };
  }
  if (autoResizeImages) {
    const resized = await resizeImage(normalized.bytes, normalized.mimeType, options?.resizeOptions);
    if (!resized) {
      return {
        ok: false,
        message: "[Image omitted: could not be resized below the inline image size limit.]"
      };
    }
    const hints2 = [];
    const convertedHint2 = conversionHint(normalized.convertedFrom, resized.mimeType);
    if (convertedHint2) hints2.push(convertedHint2);
    const dimensionNote = formatDimensionNote(resized);
    if (dimensionNote) hints2.push(dimensionNote);
    return {
      ok: true,
      data: resized.data,
      mimeType: resized.mimeType,
      hints: hints2
    };
  }
  const hints = [];
  const convertedHint = conversionHint(normalized.convertedFrom, normalized.mimeType);
  if (convertedHint) hints.push(convertedHint);
  return {
    ok: true,
    data: Buffer.from(normalized.bytes).toString("base64"),
    mimeType: normalized.mimeType,
    hints
  };
}
export {
  processImage
};
