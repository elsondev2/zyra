// Generated from the maintained TypeScript in ../source by scripts/build-owned-runtime.mjs.
import { getKeybindings } from "../../../../../terminal/src/index.js";
import { theme } from "../theme/theme.js";
function formatKeyPart(part, options) {
  const displayPart = process.platform === "darwin" && part.toLowerCase() === "alt" ? "option" : part;
  return options.capitalize ? displayPart.charAt(0).toUpperCase() + displayPart.slice(1) : displayPart;
}
function formatKeyText(key, options = {}) {
  return key.split("/").map(
    (k) => k.split("+").map((part) => formatKeyPart(part, options)).join("+")
  ).join("/");
}
function formatKeys(keys, options = {}) {
  if (keys.length === 0) return "";
  return formatKeyText(keys.join("/"), options);
}
function keyText(keybinding) {
  return formatKeys(getKeybindings().getKeys(keybinding));
}
function keyDisplayText(keybinding) {
  return formatKeys(getKeybindings().getKeys(keybinding), { capitalize: true });
}
function keyHint(keybinding, description) {
  return theme.fg("dim", keyText(keybinding)) + theme.fg("muted", ` ${description}`);
}
function rawKeyHint(key, description) {
  return theme.fg("dim", formatKeyText(key)) + theme.fg("muted", ` ${description}`);
}
export {
  formatKeyText,
  keyDisplayText,
  keyHint,
  keyText,
  rawKeyHint
};
