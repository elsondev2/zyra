import { createHash } from 'node:crypto';

// Audited upstream bytes only. A changed artifact must be reviewed again;
// first-party wrappers, patched vendor files and license additions stay scanned.
const vendorHashes = new Map([
  ['mobile/android/app/src/main/assets/mermaid/mermaid.min.js', '581ed7d74bd9048d0e3a91363927d72ef22942d7722546b27f7cc29e35390eb8'],
  ['mobile/android/svg/src/main/java/com/caverock/androidsvg/SVGAndroidRenderer.java', 'cdae98880b7331cf7202381cd791545ecee3794771f4b1a319c8ae8b9aa201c8'],
]);
const attributionFile = 'extensions/zyra-browser-control/assets/LICENSES.txt';
const attributionLine = 3;
const attributionHash = 'b89ee2765a60cf20ed5703c11f3083cdef580ca5d64c3eab22ef287ffa04826c';
const digest = value => createHash('sha256').update(value).digest('hex');

/** Only local name/phrase rules are exempted; generic path/credential checks
 * must run on every line, including pristine vendor and attribution bytes. */
export function localPrivacyExemption(file, bytes) {
  const expected = vendorHashes.get(file);
  const pristine = expected !== undefined && digest(bytes) === expected;
  return (lineNumber, line) => pristine || (
    file === attributionFile && lineNumber === attributionLine && digest(line) === attributionHash
  );
}
