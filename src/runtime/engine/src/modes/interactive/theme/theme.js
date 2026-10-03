// Generated from the maintained TypeScript in ../source by scripts/build-owned-runtime.mjs.
import * as fs from "node:fs";
import * as path from "node:path";
import {
  getCapabilities
} from "../../../../../terminal/src/index.js";
import chalk from "chalk";
import { Type } from "typebox";
import { Compile } from "typebox/compile";
import { getCustomThemesDir, getThemesDir } from "../../../config.js";
import { closeWatcher, watchWithErrorHandler } from "../../../utils/fs-watch.js";
import { highlight, supportsLanguage } from "../../../utils/syntax-highlight.js";
import { stripBom } from "../../../utils/text.js";
const ColorValueSchema = Type.Union([
  Type.String(),
  // hex "#ff0000", var ref "primary", or empty ""
  Type.Integer({ minimum: 0, maximum: 255 })
  // 256-color index
]);
const ThemeJsonSchema = Type.Object({
  $schema: Type.Optional(Type.String()),
  name: Type.String(),
  vars: Type.Optional(Type.Record(Type.String(), ColorValueSchema)),
  colors: Type.Object({
    // Core UI (10 colors)
    accent: ColorValueSchema,
    border: ColorValueSchema,
    borderAccent: ColorValueSchema,
    borderMuted: ColorValueSchema,
    success: ColorValueSchema,
    error: ColorValueSchema,
    warning: ColorValueSchema,
    muted: ColorValueSchema,
    dim: ColorValueSchema,
    text: ColorValueSchema,
    thinkingText: ColorValueSchema,
    // Backgrounds & Content Text (11 required, 3 optional)
    selectedBg: ColorValueSchema,
    scrollbarThumb: Type.Optional(ColorValueSchema),
    searchMatchBg: Type.Optional(ColorValueSchema),
    searchMatchText: Type.Optional(ColorValueSchema),
    userMessageBg: ColorValueSchema,
    userMessageText: ColorValueSchema,
    customMessageBg: ColorValueSchema,
    customMessageText: ColorValueSchema,
    customMessageLabel: ColorValueSchema,
    toolPendingBg: ColorValueSchema,
    toolSuccessBg: ColorValueSchema,
    toolErrorBg: ColorValueSchema,
    toolTitle: ColorValueSchema,
    toolOutput: ColorValueSchema,
    // Markdown (10 colors)
    mdHeading: ColorValueSchema,
    mdLink: ColorValueSchema,
    mdLinkUrl: ColorValueSchema,
    mdCode: ColorValueSchema,
    mdCodeBlock: ColorValueSchema,
    mdCodeBlockBorder: ColorValueSchema,
    mdQuote: ColorValueSchema,
    mdQuoteBorder: ColorValueSchema,
    mdHr: ColorValueSchema,
    mdListBullet: ColorValueSchema,
    // Tool Diffs (3 colors)
    toolDiffAdded: ColorValueSchema,
    toolDiffRemoved: ColorValueSchema,
    toolDiffContext: ColorValueSchema,
    // Syntax Highlighting (9 colors)
    syntaxComment: ColorValueSchema,
    syntaxKeyword: ColorValueSchema,
    syntaxFunction: ColorValueSchema,
    syntaxVariable: ColorValueSchema,
    syntaxString: ColorValueSchema,
    syntaxNumber: ColorValueSchema,
    syntaxType: ColorValueSchema,
    syntaxOperator: ColorValueSchema,
    syntaxPunctuation: ColorValueSchema,
    // Thinking Level Borders (6 colors)
    thinkingOff: ColorValueSchema,
    thinkingMinimal: ColorValueSchema,
    thinkingLow: ColorValueSchema,
    thinkingMedium: ColorValueSchema,
    thinkingHigh: ColorValueSchema,
    thinkingXhigh: ColorValueSchema,
    thinkingMax: Type.Optional(ColorValueSchema),
    // Bash Mode (1 color)
    bashMode: ColorValueSchema
  }),
  export: Type.Optional(
    Type.Object({
      pageBg: Type.Optional(ColorValueSchema),
      cardBg: Type.Optional(ColorValueSchema),
      infoBg: Type.Optional(ColorValueSchema)
    })
  )
});
const validateThemeJson = Compile(ThemeJsonSchema);
function hexToRgb(hex) {
  const cleaned = hex.replace("#", "");
  if (cleaned.length !== 6) {
    throw new Error(`Invalid hex color: ${hex}`);
  }
  const r = parseInt(cleaned.substring(0, 2), 16);
  const g = parseInt(cleaned.substring(2, 4), 16);
  const b = parseInt(cleaned.substring(4, 6), 16);
  if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) {
    throw new Error(`Invalid hex color: ${hex}`);
  }
  return { r, g, b };
}
const CUBE_VALUES = [0, 95, 135, 175, 215, 255];
const GRAY_VALUES = Array.from({ length: 24 }, (_, i) => 8 + i * 10);
function findClosestCubeIndex(value) {
  let minDist = Infinity;
  let minIdx = 0;
  for (let i = 0; i < CUBE_VALUES.length; i++) {
    const dist = Math.abs(value - CUBE_VALUES[i]);
    if (dist < minDist) {
      minDist = dist;
      minIdx = i;
    }
  }
  return minIdx;
}
function findClosestGrayIndex(gray) {
  let minDist = Infinity;
  let minIdx = 0;
  for (let i = 0; i < GRAY_VALUES.length; i++) {
    const dist = Math.abs(gray - GRAY_VALUES[i]);
    if (dist < minDist) {
      minDist = dist;
      minIdx = i;
    }
  }
  return minIdx;
}
function colorDistance(r1, g1, b1, r2, g2, b2) {
  const dr = r1 - r2;
  const dg = g1 - g2;
  const db = b1 - b2;
  return dr * dr * 0.299 + dg * dg * 0.587 + db * db * 0.114;
}
function rgbTo256(r, g, b) {
  const rIdx = findClosestCubeIndex(r);
  const gIdx = findClosestCubeIndex(g);
  const bIdx = findClosestCubeIndex(b);
  const cubeR = CUBE_VALUES[rIdx];
  const cubeG = CUBE_VALUES[gIdx];
  const cubeB = CUBE_VALUES[bIdx];
  const cubeIndex = 16 + 36 * rIdx + 6 * gIdx + bIdx;
  const cubeDist = colorDistance(r, g, b, cubeR, cubeG, cubeB);
  const gray = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
  const grayIdx = findClosestGrayIndex(gray);
  const grayValue = GRAY_VALUES[grayIdx];
  const grayIndex = 232 + grayIdx;
  const grayDist = colorDistance(r, g, b, grayValue, grayValue, grayValue);
  const maxC = Math.max(r, g, b);
  const minC = Math.min(r, g, b);
  const spread = maxC - minC;
  if (spread < 10 && grayDist < cubeDist) {
    return grayIndex;
  }
  return cubeIndex;
}
function hexTo256(hex) {
  const { r, g, b } = hexToRgb(hex);
  return rgbTo256(r, g, b);
}
function fgAnsi(color, mode) {
  if (color === "") return "\x1B[39m";
  if (typeof color === "number") return `\x1B[38;5;${color}m`;
  if (color.startsWith("#")) {
    if (mode === "truecolor") {
      const { r, g, b } = hexToRgb(color);
      return `\x1B[38;2;${r};${g};${b}m`;
    } else {
      const index = hexTo256(color);
      return `\x1B[38;5;${index}m`;
    }
  }
  throw new Error(`Invalid color value: ${color}`);
}
function bgAnsi(color, mode) {
  if (color === "") return "\x1B[49m";
  if (typeof color === "number") return `\x1B[48;5;${color}m`;
  if (color.startsWith("#")) {
    if (mode === "truecolor") {
      const { r, g, b } = hexToRgb(color);
      return `\x1B[48;2;${r};${g};${b}m`;
    } else {
      const index = hexTo256(color);
      return `\x1B[48;5;${index}m`;
    }
  }
  throw new Error(`Invalid color value: ${color}`);
}
function resolveVarRefs(value, vars, visited = /* @__PURE__ */ new Set()) {
  if (typeof value === "number" || value === "" || value.startsWith("#")) {
    return value;
  }
  if (visited.has(value)) {
    throw new Error(`Circular variable reference detected: ${value}`);
  }
  if (!(value in vars)) {
    throw new Error(`Variable reference not found: ${value}`);
  }
  visited.add(value);
  return resolveVarRefs(vars[value], vars, visited);
}
function resolveThemeColors(colors, vars = {}) {
  const resolved = {};
  for (const [key, value] of Object.entries(colors)) {
    resolved[key] = resolveVarRefs(value, vars);
  }
  return resolved;
}
function withThemeColorFallbacks(colors) {
  return {
    ...colors,
    thinkingMax: colors.thinkingMax ?? colors.thinkingXhigh,
    scrollbarThumb: colors.scrollbarThumb ?? colors.selectedBg,
    searchMatchBg: colors.searchMatchBg ?? colors.selectedBg,
    searchMatchText: colors.searchMatchText ?? colors.text
  };
}
class Theme {
  name;
  sourcePath;
  sourceInfo;
  fgColors;
  bgColors;
  mode;
  constructor(fgColors, bgColors, mode, options = {}) {
    this.name = options.name;
    this.sourcePath = options.sourcePath;
    this.sourceInfo = options.sourceInfo;
    this.mode = mode;
    this.fgColors = /* @__PURE__ */ new Map();
    const colors = {
      ...fgColors,
      thinkingMax: fgColors.thinkingMax ?? fgColors.thinkingXhigh,
      searchMatchText: fgColors.searchMatchText ?? fgColors.text
    };
    for (const [key, value] of Object.entries(colors)) {
      this.fgColors.set(key, fgAnsi(value, mode));
    }
    this.bgColors = /* @__PURE__ */ new Map();
    const backgrounds = {
      ...bgColors,
      scrollbarThumb: bgColors.scrollbarThumb ?? bgColors.selectedBg,
      searchMatchBg: bgColors.searchMatchBg ?? bgColors.selectedBg
    };
    for (const [key, value] of Object.entries(backgrounds)) {
      this.bgColors.set(key, bgAnsi(value, mode));
    }
  }
  fg(color, text) {
    const ansi = this.fgColors.get(color);
    if (!ansi) throw new Error(`Unknown theme color: ${color}`);
    return `${ansi}${text}\x1B[39m`;
  }
  bg(color, text) {
    const ansi = this.bgColors.get(color);
    if (!ansi) throw new Error(`Unknown theme background color: ${color}`);
    return `${ansi}${text}\x1B[49m`;
  }
  bold(text) {
    return chalk.bold(text);
  }
  italic(text) {
    return chalk.italic(text);
  }
  underline(text) {
    return chalk.underline(text);
  }
  inverse(text) {
    return chalk.inverse(text);
  }
  strikethrough(text) {
    return chalk.strikethrough(text);
  }
  getFgAnsi(color) {
    const ansi = this.fgColors.get(color);
    if (!ansi) throw new Error(`Unknown theme color: ${color}`);
    return ansi;
  }
  getBgAnsi(color) {
    const ansi = this.bgColors.get(color);
    if (!ansi) throw new Error(`Unknown theme background color: ${color}`);
    return ansi;
  }
  getColorMode() {
    return this.mode;
  }
  getThinkingBorderColor(level) {
    switch (level) {
      case "off":
        return (str) => this.fg("thinkingOff", str);
      case "minimal":
        return (str) => this.fg("thinkingMinimal", str);
      case "low":
        return (str) => this.fg("thinkingLow", str);
      case "medium":
        return (str) => this.fg("thinkingMedium", str);
      case "high":
        return (str) => this.fg("thinkingHigh", str);
      case "xhigh":
        return (str) => this.fg("thinkingXhigh", str);
      case "max":
        return (str) => this.fg("thinkingMax", str);
      default:
        return (str) => this.fg("thinkingOff", str);
    }
  }
  getBashModeBorderColor() {
    return (str) => this.fg("bashMode", str);
  }
}
let BUILTIN_THEMES;
function getBuiltinThemes() {
  if (!BUILTIN_THEMES) {
    const themesDir = getThemesDir();
    const darkPath = path.join(themesDir, "dark.json");
    const lightPath = path.join(themesDir, "light.json");
    BUILTIN_THEMES = {
      dark: JSON.parse(stripBom(fs.readFileSync(darkPath, "utf-8"))),
      light: JSON.parse(stripBom(fs.readFileSync(lightPath, "utf-8")))
    };
  }
  return BUILTIN_THEMES;
}
function getAvailableThemes() {
  return getAvailableThemesWithPaths().map(({ name }) => name);
}
function getAvailableThemesWithPaths() {
  const themesDir = getThemesDir();
  const result = [];
  const seen = /* @__PURE__ */ new Set();
  const addTheme = (themeInfo) => {
    if (seen.has(themeInfo.name)) {
      return;
    }
    seen.add(themeInfo.name);
    result.push(themeInfo);
  };
  for (const name of Object.keys(getBuiltinThemes())) {
    addTheme({ name, path: path.join(themesDir, `${name}.json`) });
  }
  for (const themeInfo of getCustomThemeInfos()) {
    addTheme(themeInfo);
  }
  for (const [name, theme2] of registeredThemes.entries()) {
    addTheme({ name, path: theme2.sourcePath });
  }
  return result.sort((a, b) => a.name.localeCompare(b.name));
}
function getCustomThemeInfos() {
  const customThemesDir = getCustomThemesDir();
  const result = [];
  if (!fs.existsSync(customThemesDir)) {
    return result;
  }
  for (const file of fs.readdirSync(customThemesDir)) {
    if (!file.endsWith(".json")) {
      continue;
    }
    const themePath = path.join(customThemesDir, file);
    try {
      const customTheme = loadThemeFromPath(themePath);
      if (customTheme.name) {
        result.push({ name: customTheme.name, path: themePath });
      }
    } catch {
    }
  }
  return result;
}
function assertThemeNameIsValid(name) {
  if (name.includes("/")) {
    throw new Error(
      `Invalid theme name "${name}": theme names cannot contain "/" because it is reserved for automatic light/dark theme settings.`
    );
  }
}
function parseThemeJson(label, json) {
  if (!validateThemeJson.Check(json)) {
    const errors = Array.from(validateThemeJson.Errors(json));
    const missingColors = /* @__PURE__ */ new Set();
    const otherErrors = [];
    for (const error of errors) {
      if (error.keyword === "required" && error.instancePath === "/colors") {
        const requiredProperties = error.params.requiredProperties;
        for (const requiredProperty of requiredProperties ?? []) {
          missingColors.add(requiredProperty);
        }
        continue;
      }
      const path2 = error.instancePath || "/";
      otherErrors.push(`  - ${path2}: ${error.message}`);
    }
    let errorMessage = `Invalid theme "${label}":
`;
    if (missingColors.size > 0) {
      errorMessage += "\nMissing required color tokens:\n";
      errorMessage += Array.from(missingColors).sort().map((color) => `  - ${color}`).join("\n");
      errorMessage += `

Please add these colors to your theme's "colors" object.`;
      errorMessage += "\nSee the built-in themes (dark.json, light.json) for reference values.";
    }
    if (otherErrors.length > 0) {
      errorMessage += `

Other errors:
${otherErrors.join("\n")}`;
    }
    throw new Error(errorMessage);
  }
  const themeJson = json;
  assertThemeNameIsValid(themeJson.name);
  return themeJson;
}
function parseThemeJsonContent(label, content) {
  let json;
  try {
    json = JSON.parse(stripBom(content));
  } catch (error) {
    throw new Error(`Failed to parse theme ${label}: ${error}`);
  }
  return parseThemeJson(label, json);
}
function loadThemeJson(name) {
  const builtinThemes = getBuiltinThemes();
  if (name in builtinThemes) {
    return builtinThemes[name];
  }
  const registeredTheme = registeredThemes.get(name);
  if (registeredTheme?.sourcePath) {
    const content2 = fs.readFileSync(registeredTheme.sourcePath, "utf-8");
    return parseThemeJsonContent(registeredTheme.sourcePath, content2);
  }
  if (registeredTheme) {
    throw new Error(`Theme "${name}" does not have a source path for export`);
  }
  const customThemesDir = getCustomThemesDir();
  const themePath = path.join(customThemesDir, `${name}.json`);
  if (!fs.existsSync(themePath)) {
    throw new Error(`Theme not found: ${name}`);
  }
  const content = fs.readFileSync(themePath, "utf-8");
  return parseThemeJsonContent(name, content);
}
function createTheme(themeJson, mode, sourcePath) {
  const colorMode = mode ?? (getCapabilities().trueColor ? "truecolor" : "256color");
  const resolvedColors = resolveThemeColors(withThemeColorFallbacks(themeJson.colors), themeJson.vars);
  const fgColors = {};
  const bgColors = {};
  const bgColorKeys = /* @__PURE__ */ new Set([
    "selectedBg",
    "scrollbarThumb",
    "searchMatchBg",
    "userMessageBg",
    "customMessageBg",
    "toolPendingBg",
    "toolSuccessBg",
    "toolErrorBg"
  ]);
  for (const [key, value] of Object.entries(resolvedColors)) {
    if (bgColorKeys.has(key)) {
      bgColors[key] = value;
    } else {
      fgColors[key] = value;
    }
  }
  return new Theme(fgColors, bgColors, colorMode, {
    name: themeJson.name,
    sourcePath
  });
}
function loadThemeFromPath(themePath, mode) {
  const content = fs.readFileSync(themePath, "utf-8");
  const themeJson = parseThemeJsonContent(themePath, content);
  return createTheme(themeJson, mode, themePath);
}
function loadTheme(name, mode) {
  const registeredTheme = registeredThemes.get(name);
  if (registeredTheme) {
    return registeredTheme;
  }
  const themeJson = loadThemeJson(name);
  return createTheme(themeJson, mode);
}
function getThemeByName(name) {
  try {
    return loadTheme(name);
  } catch {
    return void 0;
  }
}
function parseAutoThemeSetting(themeSetting) {
  if (!themeSetting) return void 0;
  const slashIndex = themeSetting.indexOf("/");
  if (slashIndex === -1 || themeSetting.indexOf("/", slashIndex + 1) !== -1) {
    return void 0;
  }
  const lightTheme = themeSetting.slice(0, slashIndex).trim();
  const darkTheme = themeSetting.slice(slashIndex + 1).trim();
  if (!lightTheme || !darkTheme) {
    return void 0;
  }
  return { lightTheme, darkTheme };
}
function resolveThemeSetting(themeSetting, terminalTheme) {
  const autoTheme = parseAutoThemeSetting(themeSetting);
  if (autoTheme) {
    return terminalTheme === "light" ? autoTheme.lightTheme : autoTheme.darkTheme;
  }
  if (themeSetting?.includes("/")) return void 0;
  if (typeof themeSetting === "string") return themeSetting;
  return void 0;
}
function getColorFgBgBackgroundIndex(colorfgbg) {
  const parts = colorfgbg.split(";");
  for (let i = parts.length - 1; i >= 0; i--) {
    const bg = parseInt(parts[i].trim(), 10);
    if (Number.isInteger(bg) && bg >= 0 && bg <= 255) {
      return bg;
    }
  }
  return void 0;
}
function getRgbColorLuminance({ r, g, b }) {
  const toLinear = (channel) => {
    const value = channel / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}
function getAnsiColorLuminance(index) {
  return getRgbColorLuminance(hexToRgb(ansi256ToHex(index)));
}
function getThemeForRgbColor(rgb) {
  return getRgbColorLuminance(rgb) >= 0.5 ? "light" : "dark";
}
function detectTerminalBackgroundFromEnv(options = {}) {
  const env = options.env ?? process.env;
  const colorfgbg = env.COLORFGBG || "";
  const bg = getColorFgBgBackgroundIndex(colorfgbg);
  if (bg !== void 0) {
    return {
      theme: getAnsiColorLuminance(bg) >= 0.5 ? "light" : "dark",
      source: "COLORFGBG",
      detail: `background color index ${bg}`,
      confidence: "high"
    };
  }
  return {
    theme: "dark",
    source: "fallback",
    detail: "no terminal background hint found",
    confidence: "low"
  };
}
async function detectTerminalBackgroundTheme({
  ui,
  timeoutMs,
  env
}) {
  try {
    const rgb = await ui.queryTerminalBackgroundColor({ timeoutMs });
    if (rgb) {
      return {
        theme: getThemeForRgbColor(rgb),
        source: "terminal background",
        detail: `OSC 11 background rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`,
        confidence: "high"
      };
    }
  } catch {
  }
  return detectTerminalBackgroundFromEnv({ env });
}
async function detectTerminalThemeForAuto({
  ui,
  timeoutMs,
  env
}) {
  let colorSchemePromise;
  try {
    colorSchemePromise = ui.queryTerminalColorScheme?.({ timeoutMs });
  } catch {
  }
  const backgroundThemePromise = detectTerminalBackgroundTheme({ ui, timeoutMs, env });
  try {
    const colorScheme = await colorSchemePromise;
    if (colorScheme) return colorScheme;
  } catch {
  }
  return (await backgroundThemePromise).theme;
}
function getDefaultTheme() {
  return detectTerminalBackgroundFromEnv().theme;
}
const THEME_KEY = Symbol.for("@zyra/engine:theme");
const THEME_KEY_OLD = Symbol.for("@mariozechner/pi-coding-agent:theme");
const theme = new Proxy({}, {
  get(_target, prop) {
    const t = globalThis[THEME_KEY];
    if (!t) throw new Error("Theme not initialized. Call initTheme() first.");
    return t[prop];
  }
});
function setGlobalTheme(t) {
  globalThis[THEME_KEY] = t;
  globalThis[THEME_KEY_OLD] = t;
}
let currentThemeName;
let themeWatcher;
let themeReloadTimer;
let onThemeChangeCallback;
const registeredThemes = /* @__PURE__ */ new Map();
function setRegisteredThemes(themes) {
  registeredThemes.clear();
  for (const theme2 of themes) {
    if (theme2.name) {
      assertThemeNameIsValid(theme2.name);
      registeredThemes.set(theme2.name, theme2);
    }
  }
}
function initTheme(themeName, enableWatcher = false) {
  const name = themeName ?? getDefaultTheme();
  currentThemeName = name;
  try {
    setGlobalTheme(loadTheme(name));
    if (enableWatcher) {
      startThemeWatcher();
    }
  } catch (_error) {
    currentThemeName = "dark";
    setGlobalTheme(loadTheme("dark"));
  }
}
function setTheme(name, enableWatcher = false) {
  currentThemeName = name;
  try {
    setGlobalTheme(loadTheme(name));
    if (enableWatcher) {
      startThemeWatcher();
    }
    if (onThemeChangeCallback) {
      onThemeChangeCallback();
    }
    return { success: true };
  } catch (error) {
    currentThemeName = "dark";
    setGlobalTheme(loadTheme("dark"));
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}
function setThemeInstance(themeInstance) {
  setGlobalTheme(themeInstance);
  currentThemeName = "<in-memory>";
  stopThemeWatcher();
  if (onThemeChangeCallback) {
    onThemeChangeCallback();
  }
}
function onThemeChange(callback) {
  onThemeChangeCallback = callback;
}
function startThemeWatcher() {
  stopThemeWatcher();
  if (!currentThemeName || currentThemeName === "dark" || currentThemeName === "light") {
    return;
  }
  const customThemesDir = getCustomThemesDir();
  const watchedThemeName = currentThemeName;
  const watchedFileName = `${watchedThemeName}.json`;
  const themeFile = path.join(customThemesDir, watchedFileName);
  if (!fs.existsSync(themeFile)) {
    return;
  }
  const scheduleReload = () => {
    if (themeReloadTimer) {
      clearTimeout(themeReloadTimer);
    }
    themeReloadTimer = setTimeout(() => {
      themeReloadTimer = void 0;
      if (currentThemeName !== watchedThemeName) {
        return;
      }
      if (!fs.existsSync(themeFile)) {
        return;
      }
      try {
        const reloadedTheme = loadThemeFromPath(themeFile);
        registeredThemes.set(watchedThemeName, reloadedTheme);
        setGlobalTheme(reloadedTheme);
        if (onThemeChangeCallback) {
          onThemeChangeCallback();
        }
      } catch (_error) {
      }
    }, 100);
  };
  themeWatcher = watchWithErrorHandler(
    customThemesDir,
    (_eventType, filename) => {
      if (currentThemeName !== watchedThemeName) {
        return;
      }
      if (!filename) {
        scheduleReload();
        return;
      }
      if (filename !== watchedFileName) {
        return;
      }
      scheduleReload();
    },
    () => {
      closeWatcher(themeWatcher);
      themeWatcher = void 0;
    }
  ) ?? void 0;
}
function stopThemeWatcher() {
  if (themeReloadTimer) {
    clearTimeout(themeReloadTimer);
    themeReloadTimer = void 0;
  }
  closeWatcher(themeWatcher);
  themeWatcher = void 0;
}
function ansi256ToHex(index) {
  const basicColors = [
    "#000000",
    "#800000",
    "#008000",
    "#808000",
    "#000080",
    "#800080",
    "#008080",
    "#c0c0c0",
    "#808080",
    "#ff0000",
    "#00ff00",
    "#ffff00",
    "#0000ff",
    "#ff00ff",
    "#00ffff",
    "#ffffff"
  ];
  if (index < 16) {
    return basicColors[index];
  }
  if (index < 232) {
    const cubeIndex = index - 16;
    const r = Math.floor(cubeIndex / 36);
    const g = Math.floor(cubeIndex % 36 / 6);
    const b = cubeIndex % 6;
    const toHex = (n) => (n === 0 ? 0 : 55 + n * 40).toString(16).padStart(2, "0");
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
  }
  const gray = 8 + (index - 232) * 10;
  const grayHex = gray.toString(16).padStart(2, "0");
  return `#${grayHex}${grayHex}${grayHex}`;
}
function getResolvedThemeColors(themeName) {
  const name = themeName ?? currentThemeName ?? getDefaultTheme();
  const isLight = name === "light";
  const themeJson = loadThemeJson(name);
  const resolved = resolveThemeColors(withThemeColorFallbacks(themeJson.colors), themeJson.vars);
  const defaultText = isLight ? "#000000" : "#e5e5e7";
  const cssColors = {};
  for (const [key, value] of Object.entries(resolved)) {
    if (typeof value === "number") {
      cssColors[key] = ansi256ToHex(value);
    } else if (value === "") {
      cssColors[key] = defaultText;
    } else {
      cssColors[key] = value;
    }
  }
  return cssColors;
}
function isLightTheme(themeName) {
  return themeName === "light";
}
function getThemeExportColors(themeName) {
  const name = themeName ?? currentThemeName ?? getDefaultTheme();
  try {
    const themeJson = loadThemeJson(name);
    const exportSection = themeJson.export;
    if (!exportSection) return {};
    const vars = themeJson.vars ?? {};
    const resolve = (value) => {
      if (value === void 0) return void 0;
      const resolved = resolveVarRefs(value, vars);
      if (typeof resolved === "number") return ansi256ToHex(resolved);
      if (resolved === "") return void 0;
      return resolved;
    };
    return {
      pageBg: resolve(exportSection.pageBg),
      cardBg: resolve(exportSection.cardBg),
      infoBg: resolve(exportSection.infoBg)
    };
  } catch {
    return {};
  }
}
let cachedHighlightThemeFor;
let cachedCliHighlightTheme;
function buildCliHighlightTheme(t) {
  return {
    keyword: (s) => t.fg("syntaxKeyword", s),
    built_in: (s) => t.fg("syntaxType", s),
    literal: (s) => t.fg("syntaxNumber", s),
    number: (s) => t.fg("syntaxNumber", s),
    regexp: (s) => t.fg("syntaxString", s),
    string: (s) => t.fg("syntaxString", s),
    comment: (s) => t.fg("syntaxComment", s),
    doctag: (s) => t.fg("syntaxComment", s),
    meta: (s) => t.fg("muted", s),
    function: (s) => t.fg("syntaxFunction", s),
    title: (s) => t.fg("syntaxFunction", s),
    class: (s) => t.fg("syntaxType", s),
    type: (s) => t.fg("syntaxType", s),
    tag: (s) => t.fg("syntaxPunctuation", s),
    name: (s) => t.fg("syntaxKeyword", s),
    attr: (s) => t.fg("syntaxVariable", s),
    variable: (s) => t.fg("syntaxVariable", s),
    params: (s) => t.fg("syntaxVariable", s),
    operator: (s) => t.fg("syntaxOperator", s),
    punctuation: (s) => t.fg("syntaxPunctuation", s),
    emphasis: (s) => t.italic(s),
    strong: (s) => t.bold(s),
    link: (s) => t.underline(s),
    addition: (s) => t.fg("toolDiffAdded", s),
    deletion: (s) => t.fg("toolDiffRemoved", s)
  };
}
function getCliHighlightTheme(t) {
  if (cachedHighlightThemeFor !== t || !cachedCliHighlightTheme) {
    cachedHighlightThemeFor = t;
    cachedCliHighlightTheme = buildCliHighlightTheme(t);
  }
  return cachedCliHighlightTheme;
}
function highlightCode(code, lang) {
  const validLang = lang && supportsLanguage(lang) ? lang : void 0;
  if (!validLang) {
    return code.split("\n").map((line) => theme.fg("mdCodeBlock", line));
  }
  const opts = {
    language: validLang,
    ignoreIllegals: true,
    theme: getCliHighlightTheme(theme)
  };
  try {
    return highlight(code, opts).split("\n");
  } catch {
    return code.split("\n");
  }
}
function getLanguageFromPath(filePath) {
  const ext = filePath.split(".").pop()?.toLowerCase();
  if (!ext) return void 0;
  const extToLang = {
    ts: "typescript",
    tsx: "typescript",
    js: "javascript",
    jsx: "javascript",
    mjs: "javascript",
    cjs: "javascript",
    py: "python",
    rb: "ruby",
    rs: "rust",
    go: "go",
    java: "java",
    kt: "kotlin",
    swift: "swift",
    c: "c",
    h: "c",
    cpp: "cpp",
    cc: "cpp",
    cxx: "cpp",
    hpp: "cpp",
    cs: "csharp",
    php: "php",
    sh: "bash",
    bash: "bash",
    zsh: "bash",
    fish: "fish",
    ps1: "powershell",
    sql: "sql",
    html: "html",
    htm: "html",
    css: "css",
    scss: "scss",
    sass: "sass",
    less: "less",
    json: "json",
    yaml: "yaml",
    yml: "yaml",
    toml: "toml",
    xml: "xml",
    md: "markdown",
    markdown: "markdown",
    dockerfile: "dockerfile",
    makefile: "makefile",
    cmake: "cmake",
    lua: "lua",
    perl: "perl",
    r: "r",
    scala: "scala",
    clj: "clojure",
    ex: "elixir",
    exs: "elixir",
    erl: "erlang",
    hs: "haskell",
    ml: "ocaml",
    vim: "vim",
    graphql: "graphql",
    proto: "protobuf",
    tf: "hcl",
    hcl: "hcl"
  };
  return extToLang[ext];
}
function getMarkdownTheme() {
  return {
    heading: (text) => theme.fg("mdHeading", text),
    link: (text) => theme.fg("mdLink", text),
    linkUrl: (text) => theme.fg("mdLinkUrl", text),
    code: (text) => theme.fg("mdCode", text),
    codeBlock: (text) => theme.fg("mdCodeBlock", text),
    codeBlockBorder: (text) => theme.fg("mdCodeBlockBorder", text),
    quote: (text) => theme.fg("mdQuote", text),
    quoteBorder: (text) => theme.fg("mdQuoteBorder", text),
    hr: (text) => theme.fg("mdHr", text),
    listBullet: (text) => theme.fg("mdListBullet", text),
    bold: (text) => theme.bold(text),
    italic: (text) => theme.italic(text),
    underline: (text) => theme.underline(text),
    strikethrough: (text) => chalk.strikethrough(text),
    highlightCode: (code, lang) => {
      const validLang = lang && supportsLanguage(lang) ? lang : void 0;
      if (!validLang) {
        return code.split("\n").map((line) => theme.fg("mdCodeBlock", line));
      }
      const opts = {
        language: validLang,
        ignoreIllegals: true,
        theme: getCliHighlightTheme(theme)
      };
      try {
        return highlight(code, opts).split("\n");
      } catch {
        return code.split("\n").map((line) => theme.fg("mdCodeBlock", line));
      }
    }
  };
}
function getSelectListTheme() {
  return {
    selectedPrefix: (text) => theme.fg("accent", text),
    selectedText: (text) => theme.fg("accent", text),
    description: (text) => theme.fg("muted", text),
    scrollInfo: (text) => theme.fg("muted", text),
    noMatch: (text) => theme.fg("muted", text)
  };
}
function getEditorTheme() {
  return {
    borderColor: (text) => theme.fg("borderMuted", text),
    selectList: getSelectListTheme()
  };
}
function getSettingsListTheme() {
  return {
    label: (text, selected) => selected ? theme.fg("accent", text) : text,
    value: (text, selected) => selected ? theme.fg("accent", text) : theme.fg("muted", text),
    description: (text) => theme.fg("dim", text),
    cursor: theme.fg("accent", "\u2192 "),
    hint: (text) => theme.fg("dim", text)
  };
}
export {
  Theme,
  detectTerminalBackgroundFromEnv,
  detectTerminalBackgroundTheme,
  detectTerminalThemeForAuto,
  getAvailableThemes,
  getAvailableThemesWithPaths,
  getDefaultTheme,
  getEditorTheme,
  getLanguageFromPath,
  getMarkdownTheme,
  getResolvedThemeColors,
  getSelectListTheme,
  getSettingsListTheme,
  getThemeByName,
  getThemeExportColors,
  getThemeForRgbColor,
  highlightCode,
  initTheme,
  isLightTheme,
  loadThemeFromPath,
  onThemeChange,
  parseAutoThemeSetting,
  resolveThemeSetting,
  setRegisteredThemes,
  setTheme,
  setThemeInstance,
  stopThemeWatcher,
  theme
};
