// Generated from the maintained TypeScript in ../source by scripts/build-owned-runtime.mjs.
import { Type } from "typebox";
function StringEnum(values, options) {
  return Type.Unsafe({
    type: "string",
    enum: values,
    ...options?.description && { description: options.description },
    ...options?.default && { default: options.default }
  });
}
export {
  StringEnum
};
