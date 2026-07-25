import readline from "node:readline";
import { stdin as defaultInput, stdout as defaultOutput } from "node:process";

export async function promptSecret(message = "Secret", options = {}) {
  const input = options.input ?? defaultInput;
  const output = options.output ?? defaultOutput;
  if (!input.isTTY || !output.isTTY) {
    throw new Error("Secure input requires an interactive terminal. Configure OPENAI_API_KEY instead.");
  }

  readline.emitKeypressEvents(input);
  const wasRaw = Boolean(input.isRaw);
  if (!wasRaw) input.setRawMode(true);
  input.resume();

  let value = "";
  output.write(`${message}: `);

  return new Promise((resolve, reject) => {
    const finish = (result, error) => {
      input.off("keypress", onKeypress);
      if (!wasRaw) {
        input.setRawMode(false);
        input.pause();
      }
      output.write("\n");
      if (error) reject(error);
      else resolve(result);
    };

    const onKeypress = (text, key = {}) => {
      if (key.ctrl && key.name === "c") return finish(undefined, new Error("API key setup cancelled."));
      if (key.name === "escape") return finish(undefined, new Error("API key setup cancelled."));
      if (key.name === "return") return finish(value);
      if (key.name === "backspace") {
        if (value.length > 0) {
          value = value.slice(0, -1);
          output.write("\b \b");
        }
        return;
      }

      const printable = String(text ?? "")
        .replace(/\x1b\[200~/g, "")
        .replace(/\x1b\[201~/g, "")
        .replace(/[\x00-\x1f\x7f]/g, "");
      if (!printable) return;
      value += printable;
      output.write("*".repeat(printable.length));
    };

    input.on("keypress", onKeypress);
  });
}
