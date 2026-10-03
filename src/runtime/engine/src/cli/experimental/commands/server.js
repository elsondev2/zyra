// Generated from the maintained TypeScript in ../source by scripts/build-owned-runtime.mjs.
import { Command } from "../command.js";
import {
  authTokenFileOption,
  authTokenOption,
  parseAuth,
  parseLegacyOptions,
  transportOption,
  unsupportedLegacyOptions
} from "../command-options.js";
const listenOption = transportOption("--listen");
const serverCommand = new Command("server").option(listenOption).option(authTokenOption).option(authTokenFileOption).build((input) => {
  const { auth, errors: authErrors } = parseAuth(input);
  const listen = input.values(listenOption);
  const { errors: optionErrors } = parseLegacyOptions(input);
  const errors = [...authErrors, ...optionErrors, ...unsupportedLegacyOptions("server", input)];
  if (errors.length > 0) return { ok: false, errors };
  return {
    ok: true,
    command: {
      command: "server",
      ...auth === void 0 ? {} : { auth },
      ...listen.length === 0 ? {} : { listen }
    }
  };
}).action((command, context) => context.runServer(command));
export {
  serverCommand
};
