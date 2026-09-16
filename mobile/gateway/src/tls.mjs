import { X509Certificate } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import selfsigned from 'selfsigned';
export async function hostTls(directory) {
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const keyFile = path.join(directory, 'host-key.pem'), certFile = path.join(directory, 'host-cert.pem');
  if (!existsSync(keyFile) && !existsSync(certFile)) {
    const result = await selfsigned.generate([{ name: 'commonName', value: 'Zyra paired host' }], {
      days: 365, keySize: 2048, algorithm: 'sha256',
      extensions: [{ name: 'basicConstraints', cA: false }, { name: 'keyUsage', digitalSignature: true, keyEncipherment: true },
        { name: 'extKeyUsage', serverAuth: true }]
    });
    writeFileSync(keyFile, result.private, { mode: 0o600 });
    writeFileSync(certFile, result.cert, { mode: 0o600 });
  }
  const key = readFileSync(keyFile), cert = readFileSync(certFile);
  const certificate = new X509Certificate(cert);
  if (Date.parse(certificate.validTo) < Date.now()) throw new Error('Host certificate expired. Renew it and pair devices again.');
  return { key, cert, fingerprint: certificate.fingerprint256.replaceAll(':', '').toLowerCase(), minVersion: 'TLSv1.2' };
}
