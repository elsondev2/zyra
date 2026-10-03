// Generated from the maintained TypeScript in ../source by scripts/build-owned-runtime.mjs.
const UINT32_BASE = 4294967296;
const MAX_UINT32 = 4294967295;
const MAX_CONFIGURED_DEPTH = 512;
const DEFAULT_MAX_CBOR_BYTE_LENGTH = 16 * 1024 * 1024;
const DEFAULT_MAX_CBOR_CONTAINER_LENGTH = 1e6;
const DEFAULT_MAX_CBOR_DEPTH = 64;
class CborError extends Error {
  constructor(message) {
    super(message);
    this.name = "CborError";
  }
}
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });
function resolveLimit(name, value, maximum) {
  if (!Number.isSafeInteger(value) || value < 0 || value > maximum) {
    throw new RangeError(`${name} must be an integer between 0 and ${maximum}`);
  }
  return value;
}
function resolveOptions(options) {
  return {
    maxByteLength: resolveLimit("maxByteLength", options?.maxByteLength ?? DEFAULT_MAX_CBOR_BYTE_LENGTH, MAX_UINT32),
    maxContainerLength: resolveLimit(
      "maxContainerLength",
      options?.maxContainerLength ?? DEFAULT_MAX_CBOR_CONTAINER_LENGTH,
      MAX_UINT32
    ),
    maxDepth: resolveLimit("maxDepth", options?.maxDepth ?? DEFAULT_MAX_CBOR_DEPTH, MAX_CONFIGURED_DEPTH)
  };
}
export {
  CborError,
  DEFAULT_MAX_CBOR_BYTE_LENGTH,
  DEFAULT_MAX_CBOR_CONTAINER_LENGTH,
  DEFAULT_MAX_CBOR_DEPTH,
  MAX_UINT32,
  UINT32_BASE,
  resolveOptions,
  textDecoder,
  textEncoder
};
