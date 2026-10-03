// Generated from the maintained TypeScript in ../source by scripts/build-owned-runtime.mjs.
class Spacer {
  lines;
  constructor(lines = 1) {
    this.lines = lines;
  }
  setLines(lines) {
    this.lines = lines;
  }
  invalidate() {
  }
  render(_width) {
    const result = [];
    for (let i = 0; i < this.lines; i++) {
      result.push("");
    }
    return result;
  }
}
export {
  Spacer
};
