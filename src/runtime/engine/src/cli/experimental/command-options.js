// Generated from the maintained TypeScript in ../source by scripts/build-owned-runtime.mjs.
import { parseArgs } from "../args.js";
import { parseAuthInput } from "./auth.js";
import { stringOption, valueOption } from "./command.js";
import { parseTransportAddress } from "./transport-address.js";
const authTokenOption = stringOption("--auth-token");
const authTokenFileOption = stringOption("--auth-token-file");
function transportOption(name) {
  return valueOption(name, (value) => {
    const result = parseTransportAddress(value, name);
    return result.address ? { ok: true, value: result.address } : { ok: false, error: result.error ?? `Invalid ${name} address "${value}"` };
  });
}
function parseAuth(input) {
  return parseAuthInput({
    authToken: input.value(authTokenOption),
    authTokenFile: input.value(authTokenFileOption)
  });
}
function parseLegacyOptions(input) {
  const options = parseArgs([...input.remainingArgs]);
  return {
    options,
    errors: options.diagnostics.filter((diagnostic) => diagnostic.type === "error").map((diagnostic) => diagnostic.message)
  };
}
function unsupportedLegacyOptions(command, input) {
  if (input.remainingArgs.length === 0) return [];
  return [`The experimental ${command} command does not support existing CLI options yet`];
}
export {
  authTokenFileOption,
  authTokenOption,
  parseAuth,
  parseLegacyOptions,
  transportOption,
  unsupportedLegacyOptions
};
