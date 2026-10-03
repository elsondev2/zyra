// Generated from the maintained TypeScript in ../source by scripts/build-owned-runtime.mjs.
import {
  allocateImageId,
  getCapabilities,
  getCellDimensions,
  getImageDimensions,
  imageFallback,
  renderImage
} from "../terminal-image.js";
import { truncateToWidth } from "../utils.js";
class Image {
  base64Data;
  mimeType;
  dimensions;
  theme;
  options;
  imageId;
  cachedLines;
  cachedWidth;
  constructor(base64Data, mimeType, theme, options = {}, dimensions) {
    this.base64Data = base64Data;
    this.mimeType = mimeType;
    this.theme = theme;
    this.options = options;
    this.dimensions = dimensions || getImageDimensions(base64Data, mimeType) || { widthPx: 800, heightPx: 600 };
    this.imageId = options.imageId;
  }
  /** Get the Kitty image ID used by this image (if any). */
  getImageId() {
    return this.imageId;
  }
  invalidate() {
    this.cachedLines = void 0;
    this.cachedWidth = void 0;
  }
  render(width) {
    if (this.cachedLines && this.cachedWidth === width) {
      return this.cachedLines;
    }
    const maxWidth = Math.max(1, Math.min(width - 2, this.options.maxWidthCells ?? 60));
    const cellDimensions = getCellDimensions();
    const defaultMaxHeight = Math.max(1, Math.ceil(maxWidth * cellDimensions.widthPx / cellDimensions.heightPx));
    const maxHeight = this.options.maxHeightCells ?? defaultMaxHeight;
    const caps = getCapabilities();
    let lines;
    if (caps.images) {
      if (caps.images === "kitty" && this.imageId === void 0) {
        this.imageId = allocateImageId();
      }
      const result = renderImage(this.base64Data, this.dimensions, {
        maxWidthCells: maxWidth,
        maxHeightCells: maxHeight,
        imageId: this.imageId,
        moveCursor: false
      });
      if (result) {
        if (result.imageId) {
          this.imageId = result.imageId;
        }
        if (caps.images === "kitty") {
          lines = [result.sequence];
          for (let i = 0; i < result.rows - 1; i++) {
            lines.push("");
          }
        } else {
          lines = [];
          for (let i = 0; i < result.rows - 1; i++) {
            lines.push("");
          }
          const rowOffset = result.rows - 1;
          const moveUp = rowOffset > 0 ? `\x1B[${rowOffset}A` : "";
          lines.push(moveUp + result.sequence);
        }
      } else {
        const fallback = imageFallback(this.mimeType, this.dimensions, this.options.filename);
        lines = [truncateToWidth(this.theme.fallbackColor(fallback), width)];
      }
    } else {
      const fallback = imageFallback(this.mimeType, this.dimensions, this.options.filename);
      lines = [truncateToWidth(this.theme.fallbackColor(fallback), width)];
    }
    this.cachedLines = lines;
    this.cachedWidth = width;
    return lines;
  }
}
export {
  Image
};
