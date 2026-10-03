// Generated from the maintained TypeScript in ../source by scripts/build-owned-runtime.mjs.
import { applyExifOrientation } from "./exif-orientation.js";
import { loadPhoton } from "./photon.js";
async function convertImageBytesToPng(bytes) {
  const photon = await loadPhoton();
  if (!photon) {
    return null;
  }
  try {
    const rawImage = photon.PhotonImage.new_from_byteslice(bytes);
    const image = applyExifOrientation(photon, rawImage, bytes);
    if (image !== rawImage) rawImage.free();
    try {
      return new Uint8Array(image.get_bytes());
    } finally {
      image.free();
    }
  } catch {
    return null;
  }
}
async function convertToPng(base64Data, mimeType) {
  if (mimeType === "image/png") {
    return { data: base64Data, mimeType };
  }
  const bytes = new Uint8Array(Buffer.from(base64Data, "base64"));
  const pngBytes = await convertImageBytesToPng(bytes);
  if (!pngBytes) {
    return null;
  }
  return {
    data: Buffer.from(pngBytes).toString("base64"),
    mimeType: "image/png"
  };
}
export {
  convertImageBytesToPng,
  convertToPng
};
