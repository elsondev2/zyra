// Generated from the maintained TypeScript in ../source by scripts/build-owned-runtime.mjs.
import { visibleWidth } from "./utils.js";
const SYMBOLS = {
  alpha: "\u03B1",
  beta: "\u03B2",
  gamma: "\u03B3",
  delta: "\u03B4",
  epsilon: "\u03F5",
  varepsilon: "\u03B5",
  zeta: "\u03B6",
  eta: "\u03B7",
  theta: "\u03B8",
  vartheta: "\u03D1",
  iota: "\u03B9",
  kappa: "\u03BA",
  varkappa: "\u03F0",
  lambda: "\u03BB",
  mu: "\u03BC",
  nu: "\u03BD",
  xi: "\u03BE",
  pi: "\u03C0",
  varpi: "\u03D6",
  rho: "\u03C1",
  varrho: "\u03F1",
  sigma: "\u03C3",
  varsigma: "\u03C2",
  tau: "\u03C4",
  upsilon: "\u03C5",
  phi: "\u03D5",
  varphi: "\u03C6",
  chi: "\u03C7",
  psi: "\u03C8",
  omega: "\u03C9",
  Gamma: "\u0393",
  Delta: "\u0394",
  Theta: "\u0398",
  Lambda: "\u039B",
  Xi: "\u039E",
  Pi: "\u03A0",
  Sigma: "\u03A3",
  Upsilon: "\u03A5",
  Phi: "\u03A6",
  Psi: "\u03A8",
  Omega: "\u03A9",
  pm: "\xB1",
  mp: "\u2213",
  times: "\xD7",
  div: "\xF7",
  cdot: "\xB7",
  ast: "\u2217",
  star: "\u22C6",
  circ: "\u2218",
  bullet: "\u2022",
  oplus: "\u2295",
  ominus: "\u2296",
  otimes: "\u2297",
  oslash: "\u2298",
  odot: "\u2299",
  bigcirc: "\u25CB",
  dagger: "\u2020",
  ddagger: "\u2021",
  amalg: "\u2A3F",
  uplus: "\u228E",
  sqcap: "\u2293",
  sqcup: "\u2294",
  triangleleft: "\u25C1",
  triangleright: "\u25B7",
  wr: "\u2240",
  cap: "\u2229",
  cup: "\u222A",
  bigcap: "\u22C2",
  bigcup: "\u22C3",
  bigwedge: "\u22C0",
  bigvee: "\u22C1",
  bigsqcup: "\u2A06",
  biguplus: "\u2A04",
  bigoplus: "\u2A01",
  bigotimes: "\u2A02",
  bigodot: "\u2A00",
  setminus: "\u2216",
  in: "\u2208",
  notin: "\u2209",
  ni: "\u220B",
  subset: "\u2282",
  supset: "\u2283",
  subseteq: "\u2286",
  supseteq: "\u2287",
  sqsubset: "\u228F",
  sqsupset: "\u2290",
  sqsubseteq: "\u2291",
  sqsupseteq: "\u2292",
  prec: "\u227A",
  preceq: "\u227C",
  succ: "\u227B",
  succeq: "\u227D",
  ll: "\u226A",
  gg: "\u226B",
  le: "\u2264",
  leq: "\u2264",
  leqslant: "\u2264",
  ge: "\u2265",
  geq: "\u2265",
  geqslant: "\u2265",
  ne: "\u2260",
  neq: "\u2260",
  equiv: "\u2261",
  approx: "\u2248",
  sim: "\u223C",
  simeq: "\u2243",
  cong: "\u2245",
  asymp: "\u224D",
  doteq: "\u2250",
  propto: "\u221D",
  parallel: "\u2225",
  perp: "\u22A5",
  mid: "\u2223",
  vdash: "\u22A2",
  dashv: "\u22A3",
  models: "\u22A8",
  Vdash: "\u22A9",
  Vvdash: "\u22AA",
  nvdash: "\u22AC",
  nvDash: "\u22AD",
  forall: "\u2200",
  exists: "\u2203",
  nexists: "\u2204",
  neg: "\xAC",
  land: "\u2227",
  wedge: "\u2227",
  lor: "\u2228",
  vee: "\u2228",
  to: "\u2192",
  rightarrow: "\u2192",
  longrightarrow: "\u2192",
  leftarrow: "\u2190",
  longleftarrow: "\u2190",
  gets: "\u2190",
  leftrightarrow: "\u2194",
  longleftrightarrow: "\u2194",
  hookleftarrow: "\u21A9",
  hookrightarrow: "\u21AA",
  twoheadleftarrow: "\u219E",
  twoheadrightarrow: "\u21A0",
  leftharpoonup: "\u21BC",
  leftharpoondown: "\u21BD",
  rightharpoonup: "\u21C0",
  rightharpoondown: "\u21C1",
  rightleftharpoons: "\u21CC",
  leftrightharpoons: "\u21CB",
  nearrow: "\u2197",
  searrow: "\u2198",
  swarrow: "\u2199",
  nwarrow: "\u2196",
  rightsquigarrow: "\u21DD",
  leadsto: "\u21DD",
  Rightarrow: "\u21D2",
  Longrightarrow: "\u21D2",
  Leftarrow: "\u21D0",
  Longleftarrow: "\u21D0",
  Leftrightarrow: "\u21D4",
  Longleftrightarrow: "\u21D4",
  implies: "\u21D2",
  iff: "\u21D4",
  mapsto: "\u21A6",
  longmapsto: "\u21A6",
  uparrow: "\u2191",
  downarrow: "\u2193",
  partial: "\u2202",
  nabla: "\u2207",
  int: "\u222B",
  iint: "\u222C",
  iiint: "\u222D",
  oint: "\u222E",
  sum: "\u2211",
  prod: "\u220F",
  coprod: "\u2210",
  infty: "\u221E",
  emptyset: "\u2205",
  varnothing: "\u2205",
  angle: "\u2220",
  therefore: "\u2234",
  because: "\u2235",
  aleph: "\u2135",
  beth: "\u2136",
  gimel: "\u2137",
  daleth: "\u2138",
  top: "\u22A4",
  bot: "\u22A5",
  triangle: "\u25B3",
  square: "\u25A1",
  lozenge: "\u25CA",
  checkmark: "\u2713",
  complement: "\u2201",
  wp: "\u2118",
  prime: "\u2032",
  ldots: "\u2026",
  dots: "\u2026",
  cdots: "\u22EF",
  vdots: "\u22EE",
  ddots: "\u22F1",
  ell: "\u2113",
  hbar: "\u210F",
  Im: "\u2111",
  Re: "\u211C",
  langle: "\u27E8",
  rangle: "\u27E9",
  vert: "|",
  lvert: "|",
  rvert: "|",
  Vert: "\u2016",
  lVert: "\u2016",
  rVert: "\u2016",
  lbrace: "{",
  rbrace: "}",
  backslash: "\\",
  lfloor: "\u230A",
  rfloor: "\u230B",
  lceil: "\u2308",
  rceil: "\u2309",
  colon: ":"
};
const NAMED_OPERATORS = /* @__PURE__ */ new Set([
  "arccos",
  "arcsin",
  "arctan",
  "arg",
  "cos",
  "cosh",
  "cot",
  "coth",
  "csc",
  "deg",
  "det",
  "dim",
  "exp",
  "gcd",
  "hom",
  "inf",
  "ker",
  "lg",
  "lim",
  "liminf",
  "limsup",
  "ln",
  "log",
  "max",
  "min",
  "Pr",
  "sec",
  "sin",
  "sinh",
  "sup",
  "tan",
  "tanh"
]);
const LIMIT_OPERATORS = /* @__PURE__ */ new Set([
  "argmax",
  "argmin",
  "inf",
  "injlim",
  "lim",
  "liminf",
  "limsup",
  "max",
  "min",
  "projlim",
  "sup"
]);
const DISPLAY_LIMIT_SYMBOLS = /* @__PURE__ */ new Set([
  "bigcap",
  "bigcup",
  "bigodot",
  "bigoplus",
  "bigotimes",
  "bigsqcup",
  "biguplus",
  "bigvee",
  "bigwedge",
  "coprod",
  "int",
  "iint",
  "iiint",
  "oint",
  "prod",
  "sum"
]);
const RELATION_COMMANDS = /* @__PURE__ */ new Set([
  "Leftarrow",
  "Leftrightarrow",
  "Longleftarrow",
  "Longleftrightarrow",
  "Longrightarrow",
  "Rightarrow",
  "Vdash",
  "Vvdash",
  "approx",
  "asymp",
  "cong",
  "dashv",
  "doteq",
  "downarrow",
  "equiv",
  "ge",
  "geq",
  "geqslant",
  "gets",
  "gg",
  "hookleftarrow",
  "hookrightarrow",
  "iff",
  "implies",
  "in",
  "leadsto",
  "le",
  "leftarrow",
  "leftharpoondown",
  "leftharpoonup",
  "leftrightarrow",
  "leftrightharpoons",
  "leq",
  "leqslant",
  "ll",
  "longleftarrow",
  "longleftrightarrow",
  "longmapsto",
  "longrightarrow",
  "mapsto",
  "mid",
  "models",
  "ne",
  "nearrow",
  "neq",
  "ni",
  "notin",
  "nvdash",
  "nvDash",
  "nwarrow",
  "parallel",
  "perp",
  "prec",
  "preceq",
  "propto",
  "rightharpoondown",
  "rightharpoonup",
  "rightleftharpoons",
  "rightarrow",
  "rightsquigarrow",
  "searrow",
  "sim",
  "simeq",
  "sqsubset",
  "sqsubseteq",
  "sqsupset",
  "sqsupseteq",
  "subset",
  "subseteq",
  "succ",
  "succeq",
  "supset",
  "supseteq",
  "swarrow",
  "to",
  "triangleleft",
  "triangleright",
  "twoheadleftarrow",
  "twoheadrightarrow",
  "uparrow",
  "vdash"
]);
const NEGATED_SYMBOLS = {
  "<": "\u226E",
  ">": "\u226F",
  "=": "\u2260",
  "\u2208": "\u2209",
  "\u220B": "\u220C",
  "\u2223": "\u2224",
  "\u2225": "\u2226",
  "\u223C": "\u2241",
  "\u2243": "\u2244",
  "\u2245": "\u2247",
  "\u2248": "\u2249",
  "\u2261": "\u2262",
  "\u2264": "\u2270",
  "\u2265": "\u2271",
  "\u227A": "\u2280",
  "\u227B": "\u2281",
  "\u2282": "\u2284",
  "\u2283": "\u2285",
  "\u2286": "\u2288",
  "\u2287": "\u2289",
  "\u22A2": "\u22AC",
  "\u22A8": "\u22AD",
  "\u2194": "\u21AE",
  "\u2190": "\u219A",
  "\u2192": "\u219B",
  "\u21D2": "\u21CF",
  "\u21D0": "\u21CD",
  "\u21D4": "\u21CE",
  "\u227C": "\u22E0",
  "\u227D": "\u22E1"
};
const BLACKBOARD = {
  C: "\u2102",
  H: "\u210D",
  N: "\u2115",
  P: "\u2119",
  Q: "\u211A",
  R: "\u211D",
  Z: "\u2124"
};
const SUPERSCRIPTS = {
  "0": "\u2070",
  "1": "\xB9",
  "2": "\xB2",
  "3": "\xB3",
  "4": "\u2074",
  "5": "\u2075",
  "6": "\u2076",
  "7": "\u2077",
  "8": "\u2078",
  "9": "\u2079",
  "+": "\u207A",
  "-": "\u207B",
  "=": "\u207C",
  "(": "\u207D",
  ")": "\u207E",
  a: "\u1D43",
  b: "\u1D47",
  c: "\u1D9C",
  d: "\u1D48",
  e: "\u1D49",
  f: "\u1DA0",
  g: "\u1D4D",
  h: "\u02B0",
  i: "\u2071",
  j: "\u02B2",
  k: "\u1D4F",
  l: "\u02E1",
  m: "\u1D50",
  n: "\u207F",
  o: "\u1D52",
  p: "\u1D56",
  r: "\u02B3",
  s: "\u02E2",
  t: "\u1D57",
  u: "\u1D58",
  v: "\u1D5B",
  w: "\u02B7",
  x: "\u02E3",
  y: "\u02B8",
  z: "\u1DBB"
};
const SUBSCRIPTS = {
  "0": "\u2080",
  "1": "\u2081",
  "2": "\u2082",
  "3": "\u2083",
  "4": "\u2084",
  "5": "\u2085",
  "6": "\u2086",
  "7": "\u2087",
  "8": "\u2088",
  "9": "\u2089",
  "+": "\u208A",
  "-": "\u208B",
  "=": "\u208C",
  "(": "\u208D",
  ")": "\u208E",
  a: "\u2090",
  e: "\u2091",
  h: "\u2095",
  i: "\u1D62",
  j: "\u2C7C",
  k: "\u2096",
  l: "\u2097",
  m: "\u2098",
  n: "\u2099",
  o: "\u2092",
  p: "\u209A",
  r: "\u1D63",
  s: "\u209B",
  t: "\u209C",
  u: "\u1D64",
  v: "\u1D65",
  x: "\u2093"
};
const SPACING_COMMANDS = /* @__PURE__ */ new Set([
  ",",
  ":",
  ";",
  " ",
  ">",
  "enspace",
  "enskip",
  "medspace",
  "quad",
  "qquad",
  "thickspace",
  "thinspace"
]);
const NEGATIVE_SPACING_COMMANDS = /* @__PURE__ */ new Set(["!", "negmedspace", "negthickspace", "negthinspace"]);
const NEGATIVE_SPACE = "\0";
const IGNORED_COMMANDS = /* @__PURE__ */ new Set([
  "displaystyle",
  "limits",
  "nolimits",
  "scriptstyle",
  "scriptscriptstyle",
  "textstyle"
]);
const SIZE_COMMANDS = /* @__PURE__ */ new Set([
  "big",
  "Big",
  "bigg",
  "Bigg",
  "bigl",
  "Bigl",
  "biggl",
  "Biggl",
  "bigr",
  "Bigr",
  "biggr",
  "Biggr"
]);
const PLAIN_WRAPPERS = /* @__PURE__ */ new Set([
  "emph",
  "mathcal",
  "mathbf",
  "mathfrak",
  "mathit",
  "mathrm",
  "mathnormal",
  "mathscr",
  "mathsf",
  "mathtt",
  "mathup",
  "mbox",
  "overbrace",
  "pmb",
  "smash",
  "substack",
  "text",
  "textbf",
  "textit",
  "textmd",
  "textnormal",
  "textrm",
  "textsc",
  "textsf",
  "textsl",
  "texttt",
  "textup",
  "underbrace",
  "bm",
  "boldsymbol"
]);
const ACCENTS = {
  acute: "\u0301",
  bar: "\u0305",
  breve: "\u0306",
  check: "\u030C",
  ddot: "\u0308",
  dot: "\u0307",
  grave: "\u0300",
  hat: "\u0302",
  mathring: "\u030A",
  overleftarrow: "\u20D6",
  overleftrightarrow: "\u20E1",
  overline: "\u0305",
  overrightarrow: "\u20D7",
  tilde: "\u0303",
  underline: "\u0332",
  vec: "\u20D7",
  widehat: "\u0302",
  widetilde: "\u0303"
};
function replaceCharacters(value, replacements) {
  let result = "";
  for (const character of value) {
    const replacement = replacements[character];
    if (replacement === void 0) {
      return void 0;
    }
    result += replacement;
  }
  return result;
}
function formatScript(value, kind) {
  value = value.trim();
  const replacements = kind === "sub" ? SUBSCRIPTS : SUPERSCRIPTS;
  const unicode = replaceCharacters(value.replace(/\s*([=+-])\s*/g, "$1"), replacements);
  if (unicode !== void 0) {
    return unicode;
  }
  const prefix = kind === "sub" ? "_" : "^";
  if (Array.from(value).length === 1 || kind === "sub" && /^[A-Za-z]+$/.test(value)) {
    return `${prefix}${value}`;
  }
  return `${prefix}(${value})`;
}
function formatFraction(numerator, denominator) {
  numerator = numerator.trim();
  denominator = denominator.trim();
  const simpleNumerator = /^[\p{L}\p{N}.]+$/u.test(numerator);
  const simpleDenominator = /^[\p{N}.]+$/u.test(denominator) || Array.from(denominator).length === 1;
  return `${simpleNumerator ? numerator : `(${numerator})`}/${simpleDenominator ? denominator : `(${denominator})`}`;
}
function formatRoot(value, symbol = "\u221A") {
  value = value.trim();
  return /^[\p{L}\p{N}.]+$/u.test(value) ? `${symbol}${value}` : `${symbol}(${value})`;
}
const NAMED_OPERATOR_START = "\u{F0004}";
const NAMED_OPERATOR_END = "\u{F0005}";
const NAMED_OPERATOR_LEFT_SPACING_PATTERN = /(?<=[\p{L}\p{N})\]}\u{f0001}])\u{f0004}/gu;
const NAMED_OPERATOR_RIGHT_SPACING_PATTERN = /\u{f0005}(?=[\p{L}\p{N}√\u{f0000}])/gu;
function normalizeOutput(value) {
  return value.replace(NAMED_OPERATOR_LEFT_SPACING_PATTERN, " ").replaceAll(NAMED_OPERATOR_START, "").replace(NAMED_OPERATOR_RIGHT_SPACING_PATTERN, " ").replaceAll(NAMED_OPERATOR_END, "").split("\n").map((line) => line.replace(/[ \t]+/g, " ").trim()).filter((line, index, lines) => line.length > 0 || index > 0 && index < lines.length - 1).join("\n").trim();
}
const LAYOUT_MARKER_START = "\u{F0000}";
const LAYOUT_MARKER_END = "\u{F0001}";
const LAYOUT_MARKER_PATTERN = /\u{f0000}(\d+)\u{f0001}/gu;
const TRAILING_LAYOUT_MARKER_PATTERN = /\u{f0000}(\d+)\u{f0001}$/u;
const PROTECTED_SPACE = "\u{F0002}";
function padLayoutLine(line, width, centered = false) {
  const padding = Math.max(0, width - visibleWidth(line));
  const left = centered ? Math.floor(padding / 2) : 0;
  return `${" ".repeat(left)}${line}${" ".repeat(padding - left)}`;
}
function joinLayouts(layouts) {
  if (layouts.length === 0) {
    return { lines: [""], width: 0, baseline: 0 };
  }
  const baseline = Math.max(...layouts.map((layout) => layout.baseline));
  const below = Math.max(...layouts.map((layout) => layout.lines.length - layout.baseline - 1));
  const lines = [];
  for (let row = 0; row <= baseline + below; row++) {
    let line = "";
    for (const layout of layouts) {
      const sourceRow = row - baseline + layout.baseline;
      line += sourceRow >= 0 && sourceRow < layout.lines.length ? padLayoutLine(layout.lines[sourceRow] ?? "", layout.width) : " ".repeat(layout.width);
    }
    lines.push(line.trimEnd());
  }
  return {
    lines,
    width: layouts.reduce((width, layout) => width + layout.width, 0),
    baseline
  };
}
function renderLayout(source, nodes) {
  const renderedLines = [];
  let firstBaseline = 0;
  for (const sourceLine of source.split("\n")) {
    const layouts = [];
    let position = 0;
    let previousNode;
    for (const match of sourceLine.matchAll(LAYOUT_MARKER_PATTERN)) {
      const index = match.index;
      const node = nodes[Number(match[1])];
      if (!node) {
        continue;
      }
      if (index > position) {
        const sliced = sourceLine.slice(position, index);
        const trimmed = (previousNode ? sliced.trimStart() : sliced).trimEnd();
        const preserveLeadingSpace = previousNode?.type === "matrix" && /^\s/.test(sliced);
        const preserveTrailingSpace = node.type === "matrix" && /\s$/.test(sliced);
        const text = trimmed ? `${preserveLeadingSpace ? " " : ""}${trimmed}${preserveTrailingSpace ? " " : ""}` : preserveLeadingSpace || preserveTrailingSpace ? " " : "";
        layouts.push({ lines: [text], width: visibleWidth(text), baseline: 0 });
      }
      if (node.type === "fraction") {
        const numerator = renderLayout(node.numerator, nodes);
        const denominator = renderLayout(node.denominator, nodes);
        const contentWidth = Math.max(numerator.width, denominator.width, 1);
        const width = contentWidth + 2;
        layouts.push({
          lines: [
            ...numerator.lines.map((line) => padLayoutLine(line, width, true)),
            ` ${"\u2500".repeat(contentWidth)} `,
            ...denominator.lines.map((line) => padLayoutLine(line, width, true))
          ],
          width,
          baseline: numerator.lines.length
        });
      } else if (node.type === "operator") {
        const contentWidth = Math.max(
          visibleWidth(node.operator),
          node.lower === void 0 ? 0 : visibleWidth(node.lower),
          node.upper === void 0 ? 0 : visibleWidth(node.upper)
        );
        const lines = [];
        if (node.upper !== void 0) {
          lines.push(`${padLayoutLine(node.upper, contentWidth, true)} `);
        }
        lines.push(`${padLayoutLine(node.operator, contentWidth, true)} `);
        if (node.lower !== void 0) {
          lines.push(`${padLayoutLine(node.lower, contentWidth, true)} `);
        }
        layouts.push({
          lines,
          width: contentWidth + 1,
          baseline: node.upper === void 0 ? 0 : 1
        });
      } else {
        const width = Math.max(0, ...node.lines.map((line) => visibleWidth(line)));
        layouts.push({
          lines: node.lines.map((line) => padLayoutLine(line, width)),
          width,
          baseline: node.baseline
        });
      }
      position = index + match[0].length;
      previousNode = node;
    }
    if (position < sourceLine.length) {
      const sliced = sourceLine.slice(position);
      const trimmed = previousNode ? sliced.trimStart() : sliced;
      const text = previousNode?.type === "matrix" && /^\s/.test(sliced) ? ` ${trimmed}` : trimmed;
      layouts.push({ lines: [text], width: visibleWidth(text), baseline: 0 });
    }
    const lineLayout = joinLayouts(layouts);
    if (renderedLines.length === 0) {
      firstBaseline = lineLayout.baseline;
    }
    renderedLines.push(...lineLayout.lines);
  }
  return {
    lines: renderedLines,
    width: Math.max(0, ...renderedLines.map((line) => visibleWidth(line))),
    baseline: firstBaseline
  };
}
class LatexParser {
  source;
  layoutNodes;
  display;
  position = 0;
  supported = true;
  stackFractions = true;
  constructor(source, layoutNodes, display) {
    this.source = source;
    this.layoutNodes = layoutNodes;
    this.display = display;
  }
  render() {
    const rendered = this.parseSequence();
    if (!this.supported || this.position !== this.source.length) {
      return void 0;
    }
    return normalizeOutput(rendered);
  }
  parseSequence(endCharacter) {
    let result = "";
    while (this.position < this.source.length) {
      const character = this.source[this.position];
      if (endCharacter && character === endCharacter) {
        this.position++;
        return result;
      }
      if (character === "}") {
        this.supported = false;
        return result;
      }
      if (character === "{") {
        this.position++;
        result += this.parseSequence("}");
        continue;
      }
      if (character === "\\") {
        const command = this.parseCommand();
        if (command === NEGATIVE_SPACE) {
          result = result.trimEnd();
          if (result.endsWith(NAMED_OPERATOR_END)) {
            result = result.slice(0, -NAMED_OPERATOR_END.length);
          }
        } else {
          result += command;
        }
        continue;
      }
      if (character === "^" || character === "_") {
        this.position++;
        result = result.trimEnd();
        const script = formatScript(this.parseRequiredArgument(false), character === "_" ? "sub" : "sup");
        if (result.endsWith(NAMED_OPERATOR_END)) {
          result = `${result.slice(0, -NAMED_OPERATOR_END.length)}${script}${NAMED_OPERATOR_END}`;
        } else {
          result += script;
        }
        continue;
      }
      if (/\s/.test(character)) {
        result += this.parseWhitespace();
        continue;
      }
      if (character === "=" || character === "<" || character === ">") {
        result = `${result.trimEnd()} ${character} `;
        this.position++;
        continue;
      }
      if (character === "&") {
        this.position++;
        continue;
      }
      if (character === "~") {
        this.position++;
        result += " ";
        continue;
      }
      if (character === ".") {
        const marker = TRAILING_LAYOUT_MARKER_PATTERN.exec(result);
        const node = marker ? this.layoutNodes[Number(marker[1])] : void 0;
        if (node?.type === "matrix") {
          const lastLine = node.lines.length - 1;
          node.lines[lastLine] = `${node.lines[lastLine] ?? ""}${character}`;
          this.position++;
          continue;
        }
      }
      result += character;
      this.position++;
    }
    if (endCharacter) {
      this.supported = false;
    }
    return result;
  }
  parseWhitespace() {
    while (this.position < this.source.length && /\s/.test(this.source[this.position] ?? "")) {
      this.position++;
    }
    return " ";
  }
  parseCommand() {
    this.position++;
    if (this.position >= this.source.length) {
      this.supported = false;
      return "";
    }
    let command = "";
    const first = this.source[this.position] ?? "";
    if (first === "\n" || first === "\r") {
      this.position++;
      if (first === "\r" && this.source[this.position] === "\n") {
        this.position++;
      }
      return " ";
    }
    if (/[A-Za-z]/.test(first)) {
      const start = this.position;
      while (this.position < this.source.length && /[A-Za-z]/.test(this.source[this.position] ?? "")) {
        this.position++;
      }
      command = this.source.slice(start, this.position);
    } else {
      command = first;
      this.position++;
    }
    if (command === "\\") {
      return "\n";
    }
    if (SPACING_COMMANDS.has(command)) {
      return " ";
    }
    if (NEGATIVE_SPACING_COMMANDS.has(command)) {
      return NEGATIVE_SPACE;
    }
    if (IGNORED_COMMANDS.has(command)) {
      return "";
    }
    if (command === "{" || command === "}" || command === "$" || command === "%" || command === "#" || command === "_" || command === "&") {
      return command;
    }
    if (command === "|") {
      return "\u2016";
    }
    if (command === "not") {
      const value = this.parseRequiredArgument(false).trim();
      const negated = NEGATED_SYMBOLS[value];
      if (negated !== void 0) {
        return ` ${negated} `;
      }
      const characters = Array.from(value);
      if (characters.length === 0) {
        this.supported = false;
        return "";
      }
      return ` ${characters[0]}\u0338${characters.slice(1).join("")} `;
    }
    if (LIMIT_OPERATORS.has(command)) {
      return this.parseOperator(command, "bracket", true, true);
    }
    const symbol = SYMBOLS[command];
    if (symbol !== void 0) {
      if (DISPLAY_LIMIT_SYMBOLS.has(command)) {
        return this.parseOperator(symbol, "script", true);
      }
      return command === "cdot" || command === "times" || RELATION_COMMANDS.has(command) ? ` ${symbol} ` : symbol;
    }
    if (NAMED_OPERATORS.has(command)) {
      return `${NAMED_OPERATOR_START}${command}${NAMED_OPERATOR_END}`;
    }
    if (SIZE_COMMANDS.has(command)) {
      return "";
    }
    if (command === "left" || command === "middle" || command === "right") {
      if (this.source[this.position] === ".") {
        this.position++;
      }
      return "";
    }
    if (command === "frac" || command === "dfrac" || command === "tfrac") {
      const shouldStack = this.display && this.stackFractions && command !== "tfrac";
      const numerator = this.parseRequiredArgument(!shouldStack);
      const denominator = this.parseRequiredArgument(!shouldStack);
      if (shouldStack) {
        const index = this.layoutNodes.push({
          type: "fraction",
          numerator: normalizeOutput(numerator),
          denominator: normalizeOutput(denominator)
        }) - 1;
        return `${LAYOUT_MARKER_START}${index}${LAYOUT_MARKER_END}`;
      }
      return formatFraction(numerator, denominator);
    }
    if (command === "sqrt") {
      const degree = this.parseOptionalArgument()?.trim();
      const value = this.parseRequiredArgument();
      if (degree === void 0 || degree === "2") {
        return formatRoot(value);
      }
      if (degree === "3") {
        return formatRoot(value, "\u221B");
      }
      if (degree === "4") {
        return formatRoot(value, "\u221C");
      }
      return `${formatScript(degree, "sup")}${formatRoot(value)}`;
    }
    if (command === "boxed" || command === "fbox") {
      return `[${this.parseRequiredArgument().trim()}]`;
    }
    if (command === "binom" || command === "dbinom" || command === "tbinom") {
      return `(${this.parseRequiredArgument()} choose ${this.parseRequiredArgument()})`;
    }
    const accent = ACCENTS[command];
    if (accent !== void 0) {
      const value = this.parseRequiredArgument();
      return Array.from(value).length === 1 ? `${value}${accent}` : `${command}(${value})`;
    }
    if (command === "mathbb") {
      const value = this.parseRequiredArgument();
      return Array.from(value, (character) => BLACKBOARD[character] ?? character).join("");
    }
    if (command === "operatorname") {
      const starred = this.source[this.position] === "*";
      if (starred) {
        this.position++;
      }
      const operator = normalizeOutput(this.parseRequiredArgument()).trim();
      return this.parseOperator(operator, "bracket", starred, true);
    }
    if (command === "mod" || command === "bmod") {
      return " mod ";
    }
    if (command === "pmod" || command === "pod") {
      const value = this.parseRequiredArgument().trim();
      return command === "pmod" ? ` (mod ${value})` : ` (${value})`;
    }
    if (command === "overset" || command === "stackrel") {
      const upper = this.parseRequiredArgument();
      const value = this.parseRequiredArgument().trim();
      return `${value}${formatScript(upper, "sup")}`;
    }
    if (command === "underset") {
      const lower = this.parseRequiredArgument();
      const value = this.parseRequiredArgument().trim();
      return `${value}${formatScript(lower, "sub")}`;
    }
    if (PLAIN_WRAPPERS.has(command)) {
      const value = this.parseRequiredArgument();
      return command.startsWith("text") || command === "mbox" ? value : value.trim();
    }
    if (command === "begin") {
      return this.parseEnvironment();
    }
    if (command === "end") {
      this.supported = false;
      return "";
    }
    this.supported = false;
    return `\\${command}`;
  }
  parseOperator(operator, inlineLowerStyle, displayLimits, spaced = false) {
    let useDisplayLimits = displayLimits;
    let modifierPosition = this.position;
    while (modifierPosition < this.source.length && /[ \t]/.test(this.source[modifierPosition] ?? "")) {
      modifierPosition++;
    }
    const modifier = /^\\(limits|nolimits)(?![A-Za-z])/.exec(this.source.slice(modifierPosition));
    if (modifier) {
      useDisplayLimits = modifier[1] === "limits";
      this.position = modifierPosition + modifier[0].length;
    }
    let lower;
    let upper;
    while (true) {
      let scriptPosition = this.position;
      while (scriptPosition < this.source.length && /[ \t]/.test(this.source[scriptPosition] ?? "")) {
        scriptPosition++;
      }
      const kind = this.source[scriptPosition];
      if (kind !== "_" && kind !== "^") {
        break;
      }
      this.position = scriptPosition + 1;
      const value = normalizeOutput(this.parseRequiredArgument(false)).replaceAll(" ", "");
      if (kind === "_") {
        if (lower !== void 0) {
          this.supported = false;
        }
        lower = value;
      } else {
        if (upper !== void 0) {
          this.supported = false;
        }
        upper = value;
      }
    }
    if (this.display && useDisplayLimits && (lower !== void 0 || upper !== void 0)) {
      const index = this.layoutNodes.push({ type: "operator", operator, lower, upper }) - 1;
      return `${LAYOUT_MARKER_START}${index}${LAYOUT_MARKER_END}`;
    }
    let rendered = operator;
    if (lower !== void 0) {
      rendered += inlineLowerStyle === "bracket" ? `[${lower}]` : formatScript(lower, "sub");
    }
    if (upper !== void 0) {
      rendered += formatScript(upper, "sup");
    }
    return spaced ? ` ${rendered} ` : rendered;
  }
  parseRequiredArgument(stackFractions = true) {
    const previousStackFractions = this.stackFractions;
    this.stackFractions = previousStackFractions && stackFractions;
    const value = this.parseRequiredArgumentValue();
    this.stackFractions = previousStackFractions;
    return value;
  }
  parseRequiredArgumentValue() {
    while (this.position < this.source.length && /\s/.test(this.source[this.position] ?? "")) {
      this.position++;
    }
    if (this.position >= this.source.length) {
      this.supported = false;
      return "";
    }
    if (this.source[this.position] === "{") {
      this.position++;
      return this.parseSequence("}");
    }
    if (this.source[this.position] === "\\") {
      return this.parseCommand();
    }
    const value = this.source[this.position] ?? "";
    this.position++;
    return value;
  }
  parseOptionalArgument() {
    while (this.position < this.source.length && /[ \t]/.test(this.source[this.position] ?? "")) {
      this.position++;
    }
    if (this.source[this.position] !== "[") {
      return void 0;
    }
    const end = this.source.indexOf("]", this.position + 1);
    if (end < 0) {
      this.supported = false;
      return void 0;
    }
    const value = this.source.slice(this.position + 1, end);
    this.position = end + 1;
    return this.renderNested(value);
  }
  readRawGroup() {
    while (this.position < this.source.length && /[ \t]/.test(this.source[this.position] ?? "")) {
      this.position++;
    }
    if (this.source[this.position] !== "{") {
      this.supported = false;
      return void 0;
    }
    const start = ++this.position;
    let depth = 1;
    while (this.position < this.source.length) {
      const character = this.source[this.position];
      if (character === "\\") {
        this.position += 2;
        continue;
      }
      if (character === "{") depth++;
      if (character === "}") depth--;
      if (depth === 0) {
        const value = this.source.slice(start, this.position);
        this.position++;
        return value;
      }
      this.position++;
    }
    this.supported = false;
    return void 0;
  }
  splitEnvironmentRows(body) {
    return body.split(/\\\\(?:\[[^\]\n]*\])?/);
  }
  parseEnvironment() {
    const environment = this.readRawGroup();
    if (!environment) {
      return "";
    }
    const endMarker = `\\end{${environment}}`;
    const end = this.source.indexOf(endMarker, this.position);
    if (end < 0) {
      this.supported = false;
      return "";
    }
    const body = this.source.slice(this.position, end);
    this.position = end + endMarker.length;
    if (environment === "equation" || environment === "equation*" || environment === "displaymath") {
      return this.renderNested(body).trim();
    }
    if (environment === "aligned" || environment === "align" || environment === "align*" || environment === "alignedat" || environment === "alignat" || environment === "alignat*" || environment === "gather" || environment === "gathered" || environment === "multline" || environment === "multline*" || environment === "split") {
      const alignedAt = ["alignedat", "alignat", "alignat*"].includes(environment);
      const alignedBody = alignedAt ? body.replace(/^\s*\{[^}]*\}/, "") : body;
      return this.splitEnvironmentRows(alignedBody).map((row) => {
        const cells = row.split("&");
        const source = alignedAt ? Array.from(
          { length: Math.ceil(cells.length / 2) },
          (_, index) => cells.slice(index * 2, index * 2 + 2).join("")
        ).join(" ") : cells.join("");
        return this.renderNested(source).trim();
      }).filter(Boolean).join("\n");
    }
    if (environment === "cases" || environment === "cases*") {
      const rows = this.splitEnvironmentRows(body).map((row) => row.split("&").map((cell) => this.renderNested(cell, false).trim())).filter((row) => row.some(Boolean));
      return rows.map((row, index) => {
        const value = (row[0] ?? "").replace(/,\s*$/, "");
        const condition = row[1] ?? "";
        const delimiter = index === 0 ? "\u23A7" : index === rows.length - 1 ? "\u23A9" : "\u23A8";
        const conditionPrefix = /^(?:if|when|for|otherwise)\b/i.test(condition) ? " " : " if ";
        return `${delimiter} ${value}${condition ? `${conditionPrefix}${condition}` : ""}`;
      }).join("\n");
    }
    if (["array", "matrix", "smallmatrix", "pmatrix", "bmatrix", "Bmatrix", "vmatrix", "Vmatrix"].includes(environment)) {
      const matrixBody = environment === "array" ? body.replace(/^\s*\{[^}]*\}/, "") : body;
      return this.renderMatrix(environment, matrixBody);
    }
    this.supported = false;
    return body;
  }
  renderMatrix(environment, body) {
    const matrix = this.splitEnvironmentRows(body).map((row) => row.split("&").map((cell) => this.renderNested(cell, false).trim())).filter((row) => row.some(Boolean));
    const columnCount = Math.max(0, ...matrix.map((row) => row.length));
    const columnWidths = Array.from(
      { length: columnCount },
      (_, column) => Math.max(0, ...matrix.map((row) => visibleWidth(row[column] ?? "")))
    );
    const rows = matrix.map(
      (row) => Array.from({ length: columnCount }, (_, column) => {
        const cell = row[column] ?? "";
        return `${cell}${PROTECTED_SPACE.repeat(Math.max(0, (columnWidths[column] ?? 0) - visibleWidth(cell)))}`;
      }).join(" \u2502 ")
    );
    let lines;
    if (environment === "array" || environment === "matrix" || environment === "smallmatrix") {
      lines = rows;
    } else {
      const delimiters = {
        pmatrix: ["\u239B", "\u239E", "\u239C", "\u239F", "\u239D", "\u23A0"],
        bmatrix: ["\u23A1", "\u23A4", "\u23A2", "\u23A5", "\u23A3", "\u23A6"],
        Bmatrix: ["\u23A7", "\u23AB", "\u23A8", "\u23AC", "\u23A9", "\u23AD"],
        vmatrix: ["\u2502", "\u2502", "\u2502", "\u2502", "\u2502", "\u2502"],
        Vmatrix: ["\u2551", "\u2551", "\u2551", "\u2551", "\u2551", "\u2551"]
      };
      const delimiter = delimiters[environment];
      if (!delimiter) {
        this.supported = false;
        return rows.join("\n");
      }
      lines = rows.map((row, index2) => {
        const left = index2 === 0 ? delimiter[0] : index2 === rows.length - 1 ? delimiter[4] : delimiter[2];
        const right = index2 === 0 ? delimiter[1] : index2 === rows.length - 1 ? delimiter[5] : delimiter[3];
        return `${left} ${row} ${right}`;
      });
    }
    if (lines.length <= 1) {
      return lines[0] ?? "";
    }
    const index = this.layoutNodes.push({ type: "matrix", lines, baseline: 0 }) - 1;
    return `${LAYOUT_MARKER_START}${index}${LAYOUT_MARKER_END}`;
  }
  renderNested(source, stackFractions = true) {
    const rendered = new LatexParser(source, this.layoutNodes, this.display && stackFractions).render();
    if (rendered === void 0) {
      this.supported = false;
      return source;
    }
    return rendered;
  }
}
function renderLatex(source, options = {}) {
  const layoutNodes = [];
  const rendered = new LatexParser(source, layoutNodes, options.display === true).render();
  if (rendered === void 0) {
    return void 0;
  }
  if (layoutNodes.length === 0) {
    return rendered.replaceAll(PROTECTED_SPACE, " ");
  }
  const lines = renderLayout(rendered, layoutNodes).lines;
  const indentation = Math.min(
    ...lines.filter((line) => line.trim()).map((line) => line.length - line.trimStart().length)
  );
  return lines.map((line) => line.slice(indentation).trimEnd()).join("\n").trimEnd().replaceAll(PROTECTED_SPACE, " ");
}
export {
  renderLatex
};
