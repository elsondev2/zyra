import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import path from 'node:path';
import { assert, fault } from './errors.mjs';

const digest = (text) => createHash('sha256').update(text).digest('hex');
export class DeviceStore {
  constructor(directory, now = Date.now) {
    this.directory = directory; this.now = now; this.pairing = null;
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    this.file = path.join(directory, 'devices.json');
    try { this.state = JSON.parse(readFileSync(this.file, 'utf8')); }
    catch (error) { if (error.code !== 'ENOENT') throw error; this.state = { version: 1, hostId: randomUUID(), devices: [] }; this.save(); }
    assert(this.state.version === 1 && Array.isArray(this.state.devices), 'Unsupported device store.');
  }
  save() {
    writeFileSync(`${this.file}.tmp`, JSON.stringify(this.state), { mode: 0o600 });
    renameSync(`${this.file}.tmp`, this.file);
  }
  createPairing() {
    const secret = randomBytes(32).toString('base64url');
    this.pairing = { digest: digest(secret), expiresAt: this.now() + 120000 };
    return { secret, expiresAt: this.pairing.expiresAt };
  }
  pair(secret, name, previous) {
    assert(typeof secret === 'string' && secret.length <= 128, 'Invalid pairing code.');
    assert(typeof name === 'string' && name.trim().length > 0 && name.length <= 80, 'Enter a device name.');
    if (!this.pairing || this.now() >= this.pairing.expiresAt || digest(secret) !== this.pairing.digest) throw fault('PAIRING_EXPIRED', 'Pairing code is invalid or expired. Create a new code on the PC.');
    // Only possession of the existing credential can identify a returning phone.
    // Model names are shared by many phones and must never merge identities.
    const existing = previous && this.authenticate(previous.deviceId, previous.token);
    if (existing) {
      const oldName = existing.name, oldPairedAt = existing.lastPairedAt;
      existing.name = name.trim();
      existing.lastPairedAt = Math.max(this.now(), (oldPairedAt || existing.createdAt) + 1);
      try { this.save(); } catch (error) { existing.name = oldName; existing.lastPairedAt = oldPairedAt; throw error; }
      this.pairing = null;
      return { deviceId: existing.id, token: previous.token, hostId: this.state.hostId };
    }
    assert(this.state.devices.length < 16, 'Revoke an unused device before pairing another.');
    const token = randomBytes(32).toString('base64url');
    const device = { id: randomUUID(), name: name.trim(), tokenHash: digest(token), createdAt: this.now(), lastPairedAt: this.now() };
    this.state.devices.push(device);
    try { this.save(); } catch (error) { this.state.devices.pop(); throw error; }
    this.pairing = null;
    return { deviceId: device.id, token, hostId: this.state.hostId };
  }
  authenticate(deviceId, token) {
    if (typeof token !== 'string' || token.length > 128) return null;
    const device = this.state.devices.find((item) => item.id === deviceId);
    return device && timingSafeEqual(Buffer.from(device.tokenHash, 'hex'), Buffer.from(digest(token), 'hex')) ? device : null;
  }
  setAccess(id, access) {
    const device = this.state.devices.find(item => item.id === id);
    assert(device, 'This device is no longer paired.');
    assert(access && Array.isArray(access.hiddenProjects) && access.hiddenProjects.length <= 256
      && access.hiddenProjects.every(root => typeof root === 'string' && root.trim().length > 0 && root.length <= 4096 && path.isAbsolute(root)), 'Invalid project access.');
    const previous = device.hiddenProjects;
    device.hiddenProjects = [...new Set(access.hiddenProjects)];
    try { this.save(); } catch (error) { device.hiddenProjects = previous; throw error; }
  }
  revoke(id) { this.state.devices = this.state.devices.filter((item) => item.id !== id); this.save(); }
  list() { return this.state.devices.map(({ tokenHash, ...device }) => device); }
}
