export const BUN_RUNTIME_VERSION = "1.3.9";

export const TUI_RELEASE_TARGETS = Object.freeze({
  "windows-x64": Object.freeze({ bunTarget: "bun-windows-x64", extension: ".exe" }),
  "macos-arm64": Object.freeze({ bunTarget: "bun-darwin-arm64", extension: "" }),
  "macos-x64": Object.freeze({ bunTarget: "bun-darwin-x64", extension: "" }),
  "linux-x64": Object.freeze({ bunTarget: "bun-linux-x64", extension: "" }),
});

export function tuiReleaseAssetName(version, target) {
  const contract = TUI_RELEASE_TARGETS[target];
  if (!contract) throw new Error(`Unsupported Zyra TUI target: ${target}`);
  return `Zyra-TUI-${version}-${target}${contract.extension}`;
}

export function allTuiReleaseAssetNames(version) {
  return Object.keys(TUI_RELEASE_TARGETS).map((target) => tuiReleaseAssetName(version, target));
}

export function currentTuiReleaseTarget(platform = process.platform, arch = process.arch) {
  if (platform === "win32" && arch === "x64") return "windows-x64";
  if (platform === "darwin" && arch === "arm64") return "macos-arm64";
  if (platform === "darwin" && arch === "x64") return "macos-x64";
  if (platform === "linux" && arch === "x64") return "linux-x64";
  throw new Error(`No Zyra TUI build target for ${platform}-${arch}.`);
}
