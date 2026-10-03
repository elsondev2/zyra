// Generated from the maintained TypeScript in ../source by scripts/build-owned-runtime.mjs.
function hexToRgb(hex) {
  const normalized = hex.startsWith("#") ? hex.slice(1) : hex;
  const r = parseInt(normalized.slice(0, 2), 16);
  const g = parseInt(normalized.slice(2, 4), 16);
  const b = parseInt(normalized.slice(4, 6), 16);
  return { r, g, b };
}
function parseOscHexChannel(channel) {
  if (!/^[0-9a-f]+$/i.test(channel)) {
    return void 0;
  }
  const max = 16 ** channel.length - 1;
  if (max <= 0) {
    return void 0;
  }
  return Math.round(parseInt(channel, 16) / max * 255);
}
const OSC11_BACKGROUND_COLOR_RESPONSE_PATTERN = /^\x1b\]11;([^\x07\x1b]*)(?:\x07|\x1b\\)$/i;
const COLOR_SCHEME_REPORT_PATTERN = /^(?:\x1b\[\?997;(1|2)n)+$/;
function isOsc11BackgroundColorResponse(data) {
  return OSC11_BACKGROUND_COLOR_RESPONSE_PATTERN.test(data);
}
function parseOsc11BackgroundColor(data) {
  const match = data.match(OSC11_BACKGROUND_COLOR_RESPONSE_PATTERN);
  if (!match) {
    return void 0;
  }
  const value = match[1].trim();
  if (value.startsWith("#")) {
    const hex = value.slice(1);
    if (/^[0-9a-f]{6}$/i.test(hex)) {
      return hexToRgb(value);
    }
    if (/^[0-9a-f]{12}$/i.test(hex)) {
      const r2 = parseOscHexChannel(hex.slice(0, 4));
      const g2 = parseOscHexChannel(hex.slice(4, 8));
      const b2 = parseOscHexChannel(hex.slice(8, 12));
      return r2 !== void 0 && g2 !== void 0 && b2 !== void 0 ? { r: r2, g: g2, b: b2 } : void 0;
    }
    return void 0;
  }
  const rgbValue = value.replace(/^rgba?:/i, "");
  const [red, green, blue] = rgbValue.split("/");
  if (red === void 0 || green === void 0 || blue === void 0) {
    return void 0;
  }
  const r = parseOscHexChannel(red);
  const g = parseOscHexChannel(green);
  const b = parseOscHexChannel(blue);
  return r !== void 0 && g !== void 0 && b !== void 0 ? { r, g, b } : void 0;
}
function parseTerminalColorSchemeReport(data) {
  const match = data.match(COLOR_SCHEME_REPORT_PATTERN);
  if (!match) {
    return void 0;
  }
  return match[1] === "2" ? "light" : "dark";
}
export {
  isOsc11BackgroundColorResponse,
  parseOsc11BackgroundColor,
  parseTerminalColorSchemeReport
};
