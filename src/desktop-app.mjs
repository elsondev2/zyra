import { createHash } from "node:crypto";
import { existsSync, lstatSync, readFileSync } from "node:fs";
import { chmod, copyFile, mkdir, mkdtemp, rename, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

const REGISTRATION_FILE = path.join(".zyra", "desktop-install-v1.json");
const CURRENT_VERSION = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;
const GITHUB_API = "https://api.github.com/repos/justelson/zyra/releases/tags/";

export function desktopRegistrationPath(dataRoot = process.env.ZYRA_DATA_ROOT || os.homedir()) {
  return path.join(path.resolve(dataRoot), REGISTRATION_FILE);
}

export function readDesktopRegistration(options = {}) {
  const file = desktopRegistrationPath(options.dataRoot);
  try {
    const value = JSON.parse(readFileSync(file, "utf8"));
    if (value?.version !== 1 || typeof value.executable !== "string" || !path.isAbsolute(value.executable)) return null;
    if (value.appVersion !== (options.expectedVersion || CURRENT_VERSION) || value.platform !== process.platform || value.architecture !== process.arch) return null;
    if (!existsSync(value.executable)) return null;
    const stats = lstatSync(value.executable);
    if (!stats.isFile() || stats.isSymbolicLink()) return null;
    return value;
  } catch {
    return null;
  }
}

export async function launchInstalledDesktop(options = {}) {
  const registration = options.registration || readDesktopRegistration(options);
  if (!registration) return { launched: false, reason: "Zyra Desktop is not installed or has not been opened yet." };
  const args = ["--zyra-background-host"];
  const verifier = options.verifyNative || defaultNativeVerifier(process.platform);
  if (verifier) await verifier(registration.executable);
  const launch = options.spawn || spawn;
  const child = launch(registration.executable, args, {
    detached: true,
    windowsHide: true,
    stdio: "ignore",
    env: { ...process.env, ZYRA_DESKTOP_UI_REQUEST: "1" }
  });
  child.unref?.();
  return { launched: true, version: registration.appVersion || null };
}

export function desktopArtifactFor(version, platform = process.platform, arch = process.arch) {
  const normalizedVersion = String(version || "").replace(/^v/, "");
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(normalizedVersion)) throw new Error("Zyra version is invalid.");
  if (platform === "win32" && arch === "x64") return `Zyra-Desktop-${normalizedVersion}-Windows-x64.exe`;
  if (platform === "darwin") return `Zyra-Desktop-${normalizedVersion}-macOS-universal.dmg`;
  if (platform === "linux" && arch === "x64") return `Zyra-Desktop-${normalizedVersion}-Linux-x64.AppImage`;
  throw new Error(`Zyra Desktop is unavailable for ${platform}/${arch}.`);
}

export async function installMatchingDesktop(options = {}) {
  const version = String(options.version || "").replace(/^v/, "");
  const artifactName = desktopArtifactFor(version, options.platform, options.arch);
  const fetchImpl = options.fetch || globalThis.fetch;
  if (typeof fetchImpl !== "function") throw new Error("This runtime cannot download Zyra Desktop.");
  const releaseResponse = await fetchImpl(`${GITHUB_API}v${encodeURIComponent(version)}`, {
    headers: { Accept: "application/vnd.github+json", "User-Agent": `Zyra-TUI/${version}` }
  });
  if (!releaseResponse.ok) throw new Error(`The matching Zyra Desktop v${version} release is unavailable.`);
  const release = await releaseResponse.json();
  if (release?.draft === true || String(release?.tag_name || "") !== `v${version}`) throw new Error("The matching Desktop release is not published.");
  const assets = Array.isArray(release.assets) ? release.assets : [];
  const artifact = assets.find((asset) => asset?.name === artifactName);
  const checksums = assets.find((asset) => asset?.name === "SHA256SUMS");
  if (!artifact?.browser_download_url || !checksums?.browser_download_url) throw new Error("The Desktop release is missing its verified installer assets.");
  const allowedDownload = (value) => {
    const url = new URL(value);
    return url.protocol === "https:" && ["github.com", "api.github.com", "objects.githubusercontent.com", "release-assets.githubusercontent.com"].includes(url.hostname);
  };
  if (!allowedDownload(artifact.browser_download_url) || !allowedDownload(checksums.browser_download_url)) throw new Error("The Desktop release download host is not trusted.");
  const [artifactResponse, checksumResponse] = await Promise.all([fetchImpl(artifact.browser_download_url), fetchImpl(checksums.browser_download_url)]);
  if (!artifactResponse.ok || !checksumResponse.ok) throw new Error("Could not download the matching Desktop installer.");
  const expected = parseChecksum(await checksumResponse.text(), artifactName);
  const bytes = Buffer.from(await artifactResponse.arrayBuffer());
  const actual = createHash("sha256").update(bytes).digest("hex");
  if (actual !== expected) throw new Error("The downloaded Desktop installer failed checksum verification.");
  const root = options.temporaryDirectory
    ? path.resolve(options.temporaryDirectory)
    : await mkdtemp(path.join(os.tmpdir(), 'zyra-desktop-'));
  await mkdir(root, { recursive: true, mode: 0o700 });
  const temporary = path.join(root, `${artifactName}.partial`);
  const target = path.join(root, artifactName);
  try {
    await writeFile(temporary, bytes, { mode: 0o700, flag: 'wx' });
    await rename(temporary, target);
    const platform = options.platform || process.platform;
    const nativeVerifier = options.verifyNative || defaultNativeVerifier(platform);
    if (nativeVerifier) await nativeVerifier(target);
    if (options.dryRun) return { installed: false, verified: true, artifactPath: target, artifactName };
    if (platform === 'linux') {
      const installDirectory = path.join(os.homedir(), '.local', 'share', 'Zyra');
      const installedPath = path.join(installDirectory, 'Zyra.AppImage');
      const stagedPath = path.join(installDirectory, `.Zyra.AppImage.tmp-${process.pid}-${Date.now()}`);
      await mkdir(installDirectory, { recursive: true, mode: 0o700 });
      await copyFile(target, stagedPath);
      await chmod(stagedPath, 0o755);
      await rename(stagedPath, installedPath);
      await rm(target, { force: true });
      await launchInstaller(installedPath, { platform, spawn: options.spawn || spawn });
      return { installed: true, verified: true, artifactName, installedPath };
    }
    await launchInstaller(target, { platform, spawn: options.spawn || spawn });
    return { installed: true, verified: true, artifactName };
  } catch (error) {
    await rm(temporary, { force: true }).catch(() => undefined);
    if (!options.keepDownloaded) await rm(target, { force: true }).catch(() => undefined);
    throw error;
  }
}

function parseChecksum(text, artifactName) {
  const line = String(text || "").split(/\r?\n/).find((entry) => entry.trim().endsWith(`  ${artifactName}`) || entry.trim().endsWith(` *${artifactName}`));
  const checksum = line?.trim().split(/\s+/)[0]?.toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(checksum || "")) throw new Error("The Desktop installer checksum is missing or invalid.");
  return checksum;
}

function defaultNativeVerifier(platform) {
  if (platform === 'win32') return (file) => runChecked('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', '$s=Get-AuthenticodeSignature -LiteralPath $env:ZYRA_VERIFY_FILE;if($s.Status -ne "Valid"){exit 1}'], { env: { ...process.env, ZYRA_VERIFY_FILE: file } });
  if (platform === 'darwin') return (file) => runChecked('spctl', ['--assess', '--type', 'open', '--context', 'context:primary-signature', file]);
  return null;
}

function runChecked(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { windowsHide: true, stdio: 'ignore', ...options });
    child.once('error', reject);
    child.once('exit', (code) => code === 0 ? resolve() : reject(new Error(`Native Desktop signature verification failed (${command} exited ${code}).`)));
  });
}

function launchInstaller(file, options) {
  const platform = options.platform;
  const command = platform === "darwin" ? "open" : file;
  const args = platform === "darwin" ? [file] : [];
  return new Promise((resolve, reject) => {
    const child = options.spawn(command, args, { detached: platform !== "linux", windowsHide: true, stdio: "ignore" });
    child.once?.("error", reject);
    child.once?.("spawn", () => {
      child.unref?.();
      resolve();
    });
  });
}
