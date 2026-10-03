// Generated from the maintained TypeScript in ../source by scripts/build-owned-runtime.mjs.
import { spawn } from "node:child_process";
const MAX_BYTES = 64 * 1024 * 1024;
const execute = (command, args, input) => new Promise((resolve, reject) => {
  const child = spawn(command, args, { windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
  const chunks = [];
  let size = 0;
  const timer = setTimeout(() => {
    child.kill();
    reject(new Error("Clipboard operation timed out."));
  }, 5e3);
  child.stdout.on("data", (chunk) => {
    size += chunk.length;
    if (size > MAX_BYTES) {
      child.kill();
      reject(new Error("Clipboard content is too large."));
    } else chunks.push(chunk);
  });
  child.stderr.resume();
  child.on("error", (error) => {
    clearTimeout(timer);
    reject(error);
  });
  child.on("close", (code) => {
    clearTimeout(timer);
    code === 0 ? resolve(Buffer.concat(chunks)) : reject(new Error("Clipboard content is unavailable."));
  });
  child.stdin.on("error", () => {
  });
  child.stdin.end(input);
});
function createPlatformClipboard(options = {}) {
  const platform = options.platform ?? process.platform;
  const env = options.env ?? process.env;
  const run = options.execute ?? execute;
  const powershell = (script, input) => run("powershell.exe", ["-NoProfile", "-STA", "-Command", "[Console]::InputEncoding = [Console]::OutputEncoding = [System.Text.UTF8Encoding]::new(); Add-Type -AssemblyName System.Windows.Forms; " + script], input);
  const linux = async (type, input) => {
    if (env.WAYLAND_DISPLAY) {
      try {
        return await run(input === void 0 ? "wl-paste" : "wl-copy", input === void 0 ? ["--no-newline", "--type", type] : ["--type", type], input);
      } catch {
      }
    }
    return run("xclip", ["-selection", "clipboard", input === void 0 ? "-o" : "-i", "-t", type], input);
  };
  let image;
  const captureImage = async () => {
    if (platform === "win32") {
      const bytes = await powershell("if (-not [System.Windows.Forms.Clipboard]::ContainsImage()) { exit 3 }; Add-Type -AssemblyName System.Drawing; $img = [System.Windows.Forms.Clipboard]::GetImage(); $stream = [System.IO.MemoryStream]::new(); try { $img.Save($stream, [System.Drawing.Imaging.ImageFormat]::Png); [Console]::Write([Convert]::ToBase64String($stream.ToArray())) } finally { $img.Dispose(); $stream.Dispose() }");
      return Buffer.from(bytes.toString(), "base64");
    }
    if (platform === "darwin") {
      const bytes = await run("osascript", ["-l", "JavaScript", "-e", 'ObjC.import("AppKit"); ObjC.import("Foundation"); var d = $.NSPasteboard.generalPasteboard.dataForType($.NSPasteboardTypePNG); if (!d) throw Error("No PNG image"); ObjC.unwrap(d.base64EncodedStringWithOptions(0));']);
      return Buffer.from(bytes.toString().trim(), "base64");
    }
    return linux("image/png");
  };
  return {
    async getText() {
      const result = platform === "win32" ? await powershell("[Console]::Write([System.Windows.Forms.Clipboard]::GetText())") : platform === "darwin" ? await run("pbpaste", []) : await linux("text/plain");
      return result.toString("utf8");
    },
    async setText(text) {
      if (platform === "win32") await powershell("[System.Windows.Forms.Clipboard]::SetText([Console]::In.ReadToEnd())", text);
      else if (platform === "darwin") await run("pbcopy", [], text);
      else await linux("text/plain", text);
    },
    async hasImage() {
      try {
        image = await captureImage();
        return image.length > 0;
      } catch {
        image = void 0;
        return false;
      }
    },
    async getImageBinary() {
      const result = image ?? await captureImage();
      image = void 0;
      return result;
    }
  };
}
export {
  createPlatformClipboard
};
