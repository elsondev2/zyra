// Generated from the maintained TypeScript in ../source by scripts/build-owned-runtime.mjs.
import { theme } from "../theme/theme.js";
class DynamicBorder {
  color;
  constructor(color = (str) => theme.fg("border", str)) {
    this.color = color;
  }
  invalidate() {
  }
  render(width) {
    return [this.color("\u2500".repeat(Math.max(1, width)))];
  }
}
export {
  DynamicBorder
};
