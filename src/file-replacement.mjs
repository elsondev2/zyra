import { renameSync } from 'node:fs';

const TRANSIENT_WRITE_ERROR_CODES = new Set(['EACCES', 'EBUSY', 'EPERM']);
const RENAME_RETRY_DELAYS_MS = [0, 15, 40, 90, 180, 320];

export function isTransientWriteError(error) {
  return TRANSIENT_WRITE_ERROR_CODES.has(error?.code);
}

export function replaceFileWithRetry(source, target) {
  let lastError;
  for (const delay of RENAME_RETRY_DELAYS_MS) {
    if (delay > 0) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, delay);
    try {
      renameSync(source, target);
      return;
    } catch (error) {
      lastError = error;
      if (!isTransientWriteError(error)) throw error;
    }
  }
  throw lastError;
}
