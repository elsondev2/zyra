// Generated from the maintained TypeScript in ../source by scripts/build-owned-runtime.mjs.
import { accessSync, constants, existsSync, readFileSync, realpathSync } from "fs";
import { homedir } from "os";
import { basename, dirname, join, resolve, sep, win32 } from "path";
import { fileURLToPath } from "url";
import { spawnProcessSync } from "./utils/child-process.js";
import { normalizePath } from "./utils/paths.js";
import { stripBom } from "./utils/text.js";
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const isBunBinary = import.meta.url.includes("$bunfs") || import.meta.url.includes("~BUN") || import.meta.url.includes("%7EBUN");
const isBunRuntime = !!process.versions.bun;
function normalizeSelfUpdatePackageTarget(target) {
  if (typeof target === "string") {
    return { packageName: target, installSpec: target };
  }
  return { packageName: target.packageName, installSpec: target.installSpec ?? target.packageName };
}
function makeSelfUpdateCommand(installStep, uninstallStep) {
  if (!uninstallStep) return installStep;
  return {
    ...installStep,
    display: `${uninstallStep.display} && ${installStep.display}`,
    steps: [uninstallStep, installStep]
  };
}
function makeSelfUpdateCommandStep(command, args) {
  return {
    command,
    args,
    display: [command, ...args].map((arg) => /\s/.test(arg) ? `"${arg}"` : arg).join(" ")
  };
}
function detectInstallMethod() {
  if (isBunBinary) {
    return "bun-binary";
  }
  const resolvedPath = `${__dirname}\0${process.execPath || ""}`.toLowerCase().replace(/\\/g, "/");
  if (resolvedPath.includes("/pnpm/") || resolvedPath.includes("/.pnpm/")) {
    return "pnpm";
  }
  if (resolvedPath.includes("/yarn/") || resolvedPath.includes("/.yarn/")) {
    return "yarn";
  }
  if (isBunRuntime || resolvedPath.includes("/install/global/node_modules/")) {
    return "bun";
  }
  if (resolvedPath.includes("/npm/") || resolvedPath.includes("/node_modules/")) {
    return "npm";
  }
  return "unknown";
}
function getInferredNpmInstall() {
  const packageDir = getPackageDir();
  const path = process.platform === "win32" || packageDir.includes("\\") ? win32 : { basename, dirname };
  const parent = path.dirname(packageDir);
  let root;
  if (path.basename(parent).startsWith("@") && path.basename(path.dirname(parent)) === "node_modules") {
    root = path.dirname(parent);
  } else if (path.basename(parent) === "node_modules") {
    root = parent;
  }
  if (!root) return void 0;
  const rootParent = path.dirname(root);
  if (path.basename(rootParent) === "lib") return { root, prefix: path.dirname(rootParent) };
  return void 0;
}
function getSelfUpdateCommandForMethod(method, installedPackageName, updatePackageTarget = installedPackageName, npmCommand) {
  const target = normalizeSelfUpdatePackageTarget(updatePackageTarget);
  switch (method) {
    case "bun-binary":
      return void 0;
    case "pnpm": {
      const match = readCommandOutput("pnpm", ["root", "-g"]) ? void 0 : /^(.*[\\/]global[\\/][^\\/]+)[\\/]\.pnpm[\\/]/.exec(getPackageDir());
      const binDirArgs = match ? [`--config.global-bin-dir=${process.env.PNPM_HOME || dirname(dirname(match[1]))}`] : [];
      return makeSelfUpdateCommand(
        makeSelfUpdateCommandStep("pnpm", [
          "install",
          "-g",
          "--ignore-scripts",
          "--config.minimumReleaseAge=0",
          ...binDirArgs,
          target.installSpec
        ]),
        target.packageName === installedPackageName ? void 0 : makeSelfUpdateCommandStep("pnpm", ["remove", "-g", ...binDirArgs, installedPackageName])
      );
    }
    case "yarn":
      return makeSelfUpdateCommand(
        makeSelfUpdateCommandStep("yarn", ["global", "add", "--ignore-scripts", target.installSpec]),
        target.packageName === installedPackageName ? void 0 : makeSelfUpdateCommandStep("yarn", ["global", "remove", installedPackageName])
      );
    case "bun":
      return makeSelfUpdateCommand(
        makeSelfUpdateCommandStep("bun", [
          "install",
          "-g",
          "--ignore-scripts",
          "--minimum-release-age=0",
          target.installSpec
        ]),
        target.packageName === installedPackageName ? void 0 : makeSelfUpdateCommandStep("bun", ["uninstall", "-g", installedPackageName])
      );
    case "npm": {
      const [command = "npm", ...npmArgs] = npmCommand ?? [];
      const inferred = npmCommand?.length ? void 0 : getInferredNpmInstall();
      const prefixArgs = [...npmArgs, ...inferred ? ["--prefix", inferred.prefix] : []];
      const installStep = makeSelfUpdateCommandStep(command, [
        ...prefixArgs,
        "install",
        "-g",
        "--ignore-scripts",
        "--min-release-age=0",
        target.installSpec
      ]);
      const uninstallStep = target.packageName === installedPackageName ? void 0 : makeSelfUpdateCommandStep(command, [...prefixArgs, "uninstall", "-g", installedPackageName]);
      return makeSelfUpdateCommand(installStep, uninstallStep);
    }
    case "unknown":
      return void 0;
  }
}
function readCommandOutput(command, args, options = {}) {
  const result = spawnProcessSync(command, args, {
    encoding: "utf-8",
    stdio: ["ignore", "pipe", "pipe"]
  });
  if (result.status === 0) return result.stdout.trim() || void 0;
  if (options.requireSuccess) {
    const reason = result.error?.message || result.stderr.trim() || `exit code ${result.status ?? "unknown"}`;
    throw new Error(`Failed to run ${[command, ...args].join(" ")}: ${reason}`);
  }
  return void 0;
}
function getGlobalPackageRoots(method, _packageName, npmCommand) {
  switch (method) {
    case "npm": {
      const configured = !!npmCommand?.length;
      const [command = "npm", ...npmArgs] = npmCommand ?? [];
      if (configured && command === "bun") {
        const bunBin = readCommandOutput(command, [...npmArgs, "pm", "bin", "-g"], {
          requireSuccess: true
        });
        const roots = [join(homedir(), ".bun", "install", "global", "node_modules")];
        if (bunBin) {
          roots.push(join(dirname(bunBin), "install", "global", "node_modules"));
        }
        return roots;
      }
      const root = readCommandOutput(command, [...npmArgs, "root", "-g"], {
        requireSuccess: configured
      });
      const inferred = configured ? void 0 : getInferredNpmInstall();
      return [root, inferred?.root].filter((x) => !!x);
    }
    case "pnpm": {
      const root = readCommandOutput("pnpm", ["root", "-g"]);
      if (root) return [root, dirname(root)];
      const match = /^(.*[\\/]global[\\/][^\\/]+)[\\/]\.pnpm[\\/]/.exec(getPackageDir());
      return match ? [match[1]] : [];
    }
    case "yarn": {
      const dir = readCommandOutput("yarn", ["global", "dir"]);
      return dir ? [dir, join(dir, "node_modules")] : [];
    }
    case "bun": {
      const bunBin = readCommandOutput("bun", ["pm", "bin", "-g"]);
      const roots = [join(homedir(), ".bun", "install", "global", "node_modules")];
      if (bunBin) {
        roots.push(join(dirname(bunBin), "install", "global", "node_modules"));
      }
      return roots;
    }
    case "bun-binary":
    case "unknown":
      return [];
  }
}
function normalizeExistingPathForComparison(path, resolveSymlinks) {
  const resolvedPath = resolve(path);
  if (!existsSync(resolvedPath)) {
    return void 0;
  }
  let normalizedPath = resolvedPath;
  if (resolveSymlinks) {
    try {
      normalizedPath = realpathSync(resolvedPath);
    } catch {
      return void 0;
    }
  }
  if (process.platform === "win32") {
    normalizedPath = normalizedPath.toLowerCase();
  }
  return normalizedPath;
}
function getPathComparisonCandidates(path) {
  return Array.from(
    new Set(
      [normalizeExistingPathForComparison(path, false), normalizeExistingPathForComparison(path, true)].filter(
        (candidate) => !!candidate
      )
    )
  );
}
function getEntrypointPackageDir() {
  const entrypoint = process.argv[1];
  if (!entrypoint) return void 0;
  let dir = dirname(entrypoint);
  while (dir !== dirname(dir)) {
    if (existsSync(join(dir, "package.json"))) {
      return dir;
    }
    dir = dirname(dir);
  }
  return void 0;
}
function isSelfUpdatePathWritable() {
  const packageDir = getPackageDir();
  try {
    accessSync(packageDir, constants.W_OK);
    accessSync(dirname(packageDir), constants.W_OK);
    return true;
  } catch {
    return false;
  }
}
function isManagedByGlobalPackageManager(method, packageName, npmCommand) {
  const packageDirs = [getPackageDir(), getEntrypointPackageDir()].filter((dir) => !!dir);
  const packageDirCandidates = packageDirs.flatMap((dir) => getPathComparisonCandidates(dir));
  return getGlobalPackageRoots(method, packageName, npmCommand).some((root) => {
    return getPathComparisonCandidates(root).some((normalizedRoot) => {
      const rootPrefix = normalizedRoot.endsWith(sep) ? normalizedRoot : `${normalizedRoot}${sep}`;
      return packageDirCandidates.some((packageDir) => packageDir.startsWith(rootPrefix));
    });
  });
}
function getSelfUpdateCommand(packageName, npmCommand, updatePackageTarget = packageName) {
  const method = detectInstallMethod();
  const command = getSelfUpdateCommandForMethod(method, packageName, updatePackageTarget, npmCommand);
  if (!command || !isManagedByGlobalPackageManager(method, packageName, npmCommand) || !isSelfUpdatePathWritable()) {
    return void 0;
  }
  return command;
}
function getSelfUpdateUnavailableInstruction(packageName, npmCommand, updatePackageTarget = packageName) {
  const method = detectInstallMethod();
  const target = normalizeSelfUpdatePackageTarget(updatePackageTarget);
  if (method === "bun-binary") {
    return `Download from: https://github.com/justelson/zyra/releases/latest`;
  }
  const command = getSelfUpdateCommandForMethod(method, packageName, target, npmCommand);
  if (command) {
    if (isManagedByGlobalPackageManager(method, packageName, npmCommand) && !isSelfUpdatePathWritable()) {
      return `This installation is managed by a global ${method} install, but the install path is not writable. Update it yourself with: ${command.display}`;
    }
    return `This installation is not managed by a global ${method} install. Update it with the package manager, wrapper, or source checkout that provides it.`;
  }
  return `Update ${target.installSpec} using the package manager, wrapper, or source checkout that provides this installation.`;
}
function getUpdateInstruction(packageName) {
  const method = detectInstallMethod();
  const command = getSelfUpdateCommandForMethod(method, packageName);
  if (command) {
    return `Run: ${command.display}`;
  }
  return getSelfUpdateUnavailableInstruction(packageName);
}
function findNodePackageDir(startDir) {
  let dir = startDir;
  while (dir !== dirname(dir)) {
    if (existsSync(join(dir, "package.json"))) {
      const parent = dirname(dir);
      if (basename(dir) === "dist" && existsSync(join(parent, "package.json"))) {
        return parent;
      }
      return dir;
    }
    dir = dirname(dir);
  }
  return startDir;
}
function getPackageDir() {
  const envDir = process.env.ZYRA_RUNTIME_PACKAGE_DIR;
  if (envDir) {
    return normalizePath(envDir);
  }
  if (isBunBinary) {
    return dirname(process.execPath);
  }
  return findNodePackageDir(__dirname);
}
function getThemesDir() {
  if (isBunBinary) {
    return join(getPackageDir(), "theme");
  }
  const packageDir = getPackageDir();
  const srcOrDist = existsSync(join(packageDir, "src")) ? "src" : "dist";
  return join(packageDir, srcOrDist, "modes", "interactive", "theme");
}
function getExportTemplateDir() {
  if (isBunBinary) {
    return join(getPackageDir(), "export-html");
  }
  const packageDir = getPackageDir();
  const srcOrDist = existsSync(join(packageDir, "src")) ? "src" : "dist";
  return join(packageDir, srcOrDist, "core", "export-html");
}
function getPackageJsonPath() {
  return join(getPackageDir(), "package.json");
}
function getReadmePath() {
  return resolve(join(getPackageDir(), "README.md"));
}
function getDocsPath() {
  return resolve(join(getPackageDir(), "docs"));
}
function getExamplesPath() {
  return resolve(join(getPackageDir(), "examples"));
}
function getChangelogPath() {
  return resolve(join(getPackageDir(), "CHANGELOG.md"));
}
function getInteractiveAssetsDir() {
  if (isBunBinary) {
    return join(getPackageDir(), "assets");
  }
  const packageDir = getPackageDir();
  const srcOrDist = existsSync(join(packageDir, "src")) ? "src" : "dist";
  return join(packageDir, srcOrDist, "modes", "interactive", "assets");
}
function getBundledInteractiveAssetPath(name) {
  return join(getInteractiveAssetsDir(), name);
}
let pkg = {};
try {
  pkg = JSON.parse(stripBom(readFileSync(getPackageJsonPath(), "utf-8")));
} catch (e) {
  const err = e;
  if (err.code !== "ENOENT") throw e;
}
const zyraConfigName = pkg.zyraConfig?.name;
const PACKAGE_NAME = pkg.name || "zyra";
const APP_NAME = "zyra";
const APP_TITLE = "Zyra";
const CONFIG_DIR_NAME = ".zyra";
const VERSION = pkg.version || "0.0.0";
const ENV_AGENT_DIR = `${APP_NAME.toUpperCase()}_CODING_AGENT_DIR`;
const ENV_SESSION_DIR = `${APP_NAME.toUpperCase()}_CODING_AGENT_SESSION_DIR`;
function expandTildePath(path) {
  return normalizePath(path);
}
const DEFAULT_SHARE_VIEWER_URL = "https://gist.github.com/";
function getShareViewerUrl(gistId) {
  const baseUrl = process.env.ZYRA_SHARE_VIEWER_URL || DEFAULT_SHARE_VIEWER_URL;
  return baseUrl === DEFAULT_SHARE_VIEWER_URL ? `${baseUrl}${gistId}` : `${baseUrl}#${gistId}`;
}
function getAgentDir() {
  const envDir = process.env.ZYRA_AGENT_DIR || process.env[ENV_AGENT_DIR];
  if (envDir) {
    return expandTildePath(envDir);
  }
  return join(homedir(), CONFIG_DIR_NAME, "agent");
}
function getCustomThemesDir() {
  return join(getAgentDir(), "themes");
}
function getModelsPath() {
  return join(getAgentDir(), "models.json");
}
function getAuthPath() {
  return join(getAgentDir(), "auth.json");
}
function getSettingsPath() {
  return join(getAgentDir(), "settings.json");
}
function getToolsDir() {
  return join(getAgentDir(), "tools");
}
function getBinDir() {
  return join(getAgentDir(), "bin");
}
function getPromptsDir() {
  return join(getAgentDir(), "prompts");
}
function getSessionsDir() {
  return join(getAgentDir(), "sessions");
}
function getDebugLogPath() {
  return join(getAgentDir(), `${APP_NAME}-debug.log`);
}
export {
  APP_NAME,
  APP_TITLE,
  CONFIG_DIR_NAME,
  ENV_AGENT_DIR,
  ENV_SESSION_DIR,
  PACKAGE_NAME,
  VERSION,
  detectInstallMethod,
  expandTildePath,
  findNodePackageDir,
  getAgentDir,
  getAuthPath,
  getBinDir,
  getBundledInteractiveAssetPath,
  getChangelogPath,
  getCustomThemesDir,
  getDebugLogPath,
  getDocsPath,
  getExamplesPath,
  getExportTemplateDir,
  getInteractiveAssetsDir,
  getModelsPath,
  getPackageDir,
  getPackageJsonPath,
  getPromptsDir,
  getReadmePath,
  getSelfUpdateCommand,
  getSelfUpdateUnavailableInstruction,
  getSessionsDir,
  getSettingsPath,
  getShareViewerUrl,
  getThemesDir,
  getToolsDir,
  getUpdateInstruction,
  isBunBinary,
  isBunRuntime
};
