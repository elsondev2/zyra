// Generated from the maintained TypeScript in ../source by scripts/build-owned-runtime.mjs.
const importNodeModule = (specifier) => import(specifier);
function getProcessEnv() {
  const proc = globalThis.process;
  return proc?.env;
}
function defaultProviderAuthContext() {
  return {
    async env(name) {
      const value = getProcessEnv()?.[name];
      return typeof value === "string" && value.trim().length > 0 ? value : void 0;
    },
    async fileExists(path) {
      try {
        const fs = await importNodeModule("node:fs/promises");
        let resolved = path;
        if (resolved.startsWith("~")) {
          const os = await importNodeModule("node:os");
          resolved = os.homedir() + resolved.slice(1);
        }
        await fs.access(resolved);
        return true;
      } catch {
        return false;
      }
    }
  };
}
export {
  defaultProviderAuthContext
};
