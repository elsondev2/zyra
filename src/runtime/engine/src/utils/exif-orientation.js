// Generated from the maintained TypeScript in ../source by scripts/build-owned-runtime.mjs.
function readOrientationFromTiff(bytes, tiffStart) {
  if (tiffStart + 8 > bytes.length) return 1;
  const byteOrder = bytes[tiffStart] << 8 | bytes[tiffStart + 1];
  const le = byteOrder === 18761;
  const read16 = (pos) => {
    if (le) return bytes[pos] | bytes[pos + 1] << 8;
    return bytes[pos] << 8 | bytes[pos + 1];
  };
  const read32 = (pos) => {
    if (le) return bytes[pos] | bytes[pos + 1] << 8 | bytes[pos + 2] << 16 | bytes[pos + 3] << 24;
    return (bytes[pos] << 24 | bytes[pos + 1] << 16 | bytes[pos + 2] << 8 | bytes[pos + 3]) >>> 0;
  };
  const ifdOffset = read32(tiffStart + 4);
  const ifdStart = tiffStart + ifdOffset;
  if (ifdStart + 2 > bytes.length) return 1;
  const entryCount = read16(ifdStart);
  for (let i = 0; i < entryCount; i++) {
    const entryPos = ifdStart + 2 + i * 12;
    if (entryPos + 12 > bytes.length) return 1;
    if (read16(entryPos) === 274) {
      const value = read16(entryPos + 8);
      return value >= 1 && value <= 8 ? value : 1;
    }
  }
  return 1;
}
function findJpegTiffOffset(bytes) {
  let offset = 2;
  while (offset < bytes.length - 1) {
    if (bytes[offset] !== 255) return -1;
    const marker = bytes[offset + 1];
    if (marker === 255) {
      offset++;
      continue;
    }
    if (marker === 225) {
      if (offset + 4 >= bytes.length) return -1;
      const segmentStart = offset + 4;
      if (segmentStart + 6 > bytes.length) return -1;
      if (!hasExifHeader(bytes, segmentStart)) return -1;
      return segmentStart + 6;
    }
    if (offset + 4 > bytes.length) return -1;
    const length = bytes[offset + 2] << 8 | bytes[offset + 3];
    offset += 2 + length;
  }
  return -1;
}
function findWebpTiffOffset(bytes) {
  let offset = 12;
  while (offset + 8 <= bytes.length) {
    const chunkId = String.fromCharCode(bytes[offset], bytes[offset + 1], bytes[offset + 2], bytes[offset + 3]);
    const chunkSize = bytes[offset + 4] | bytes[offset + 5] << 8 | bytes[offset + 6] << 16 | bytes[offset + 7] << 24;
    const dataStart = offset + 8;
    if (chunkId === "EXIF") {
      if (dataStart + chunkSize > bytes.length) return -1;
      const tiffStart = chunkSize >= 6 && hasExifHeader(bytes, dataStart) ? dataStart + 6 : dataStart;
      return tiffStart;
    }
    offset = dataStart + chunkSize + chunkSize % 2;
  }
  return -1;
}
function hasExifHeader(bytes, offset) {
  return bytes[offset] === 69 && bytes[offset + 1] === 120 && bytes[offset + 2] === 105 && bytes[offset + 3] === 102 && bytes[offset + 4] === 0 && bytes[offset + 5] === 0;
}
function getExifOrientation(bytes) {
  let tiffOffset = -1;
  if (bytes.length >= 2 && bytes[0] === 255 && bytes[1] === 216) {
    tiffOffset = findJpegTiffOffset(bytes);
  } else if (bytes.length >= 12 && bytes[0] === 82 && bytes[1] === 73 && bytes[2] === 70 && bytes[3] === 70 && bytes[8] === 87 && bytes[9] === 69 && bytes[10] === 66 && bytes[11] === 80) {
    tiffOffset = findWebpTiffOffset(bytes);
  }
  if (tiffOffset === -1) return 1;
  return readOrientationFromTiff(bytes, tiffOffset);
}
function rotate90(photon, image, dstIndex) {
  const w = image.get_width();
  const h = image.get_height();
  const src = image.get_raw_pixels();
  const dst = new Uint8Array(src.length);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const srcIdx = (y * w + x) * 4;
      const dstIdx = dstIndex(x, y, w, h) * 4;
      dst[dstIdx] = src[srcIdx];
      dst[dstIdx + 1] = src[srcIdx + 1];
      dst[dstIdx + 2] = src[srcIdx + 2];
      dst[dstIdx + 3] = src[srcIdx + 3];
    }
  }
  return new photon.PhotonImage(dst, h, w);
}
function applyExifOrientation(photon, image, originalBytes) {
  const orientation = getExifOrientation(originalBytes);
  if (orientation === 1) return image;
  switch (orientation) {
    case 2:
      photon.fliph(image);
      return image;
    case 3:
      photon.fliph(image);
      photon.flipv(image);
      return image;
    case 4:
      photon.flipv(image);
      return image;
    case 5: {
      const rotated = rotate90(photon, image, (x, y, _w, h) => x * h + (h - 1 - y));
      photon.fliph(rotated);
      return rotated;
    }
    case 6:
      return rotate90(photon, image, (x, y, _w, h) => x * h + (h - 1 - y));
    case 7: {
      const rotated = rotate90(photon, image, (x, y, w, h) => (w - 1 - x) * h + y);
      photon.fliph(rotated);
      return rotated;
    }
    case 8:
      return rotate90(photon, image, (x, y, w, h) => (w - 1 - x) * h + y);
    default:
      return image;
  }
}
export {
  applyExifOrientation
};
