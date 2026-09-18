import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';

// Inspect the actual extracted AAR/APK ELF load segments, not filenames or the
// SDK's advertised support. Run before distributing new native dependencies.
const root = process.argv[2];
assert.ok(root, 'Pass the extracted jni or lib directory');
let count = 0;
for (const abi of await readdir(root, { withFileTypes: true })) {
  if (!abi.isDirectory()) continue;
  for (const name of await readdir(path.join(root, abi.name))) {
    if (!name.endsWith('.so')) continue;
    const file = await readFile(path.join(root, abi.name, name));
    assert.equal(file.subarray(0, 4).toString('hex'), '7f454c46');
    assert.equal(file[5], 1, 'Expected little-endian Android library');
    const bits64 = file[4] === 2;
    const offset = bits64 ? Number(file.readBigUInt64LE(32)) : file.readUInt32LE(28);
    const size = file.readUInt16LE(bits64 ? 54 : 42);
    const headers = file.readUInt16LE(bits64 ? 56 : 44);
    let loads = 0;
    for (let index = 0; index < headers; index++) {
      const header = offset + index * size;
      if (file.readUInt32LE(header) !== 1) continue;
      const alignment = bits64 ? Number(file.readBigUInt64LE(header + 48)) : file.readUInt32LE(header + 28);
      // Android's 16 KiB devices are 64-bit. Preserve valid older 32-bit ABIs.
      assert.ok(alignment >= (bits64 ? 16384 : 4096), `${abi.name}/${name}: LOAD alignment ${alignment}`);
      loads++;
    }
    assert.ok(loads > 0); count++;
    console.log(`${abi.name}/${name}: ${loads} aligned LOAD segments`);
  }
}
assert.ok(count > 0, 'No native libraries inspected');
