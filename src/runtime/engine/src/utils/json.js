// Generated from the maintained TypeScript in ../source by scripts/build-owned-runtime.mjs.
function stripJsonComments(input) {
  return input.replace(/"(?:\\.|[^"\\])*"|\/\/[^\n]*/g, (m) => m[0] === '"' ? m : "").replace(/"(?:\\.|[^"\\])*"|,(\s*[}\]])/g, (m, tail) => tail ?? (m[0] === '"' ? m : ""));
}
export {
  stripJsonComments
};
