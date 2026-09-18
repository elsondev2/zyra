/** A narrow view of the attached runtime. Never return profile bodies, memory
 * contents, global source lists, paths or an arbitrary thread selector. */
export function sessionPreferences(runtime, sdk, type, payload = {}) {
  if (!runtime?.session) throw new Error('Open a chat before changing its preferences.');
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('Invalid chat preferences.');
  const memory = sdk.createZyraMemoryController(runtime);
  if (type === 'memory.configure') {
    if (Object.keys(payload).some(key => key !== 'enabled') || typeof payload.enabled !== 'boolean') {
      throw new Error('Choose whether this chat can contribute to memory.');
    }
    const result = memory.setThreadMode(payload.enabled ? 'enabled' : 'disabled');
    return { memoryMode: result.mode };
  }
  if (type !== 'preferences.get' || Object.keys(payload).length) throw new Error('Unsupported chat preference request.');
  const profiles = sdk.listZyraProfiles(runtime.project).map(profile => ({
    name: String(profile.name), description: String(profile.description || '').slice(0, 160)
  })).filter(profile => /^[a-z0-9][a-z0-9_-]{0,63}$/.test(profile.name));
  return { profile: sdk.getActiveProfile(runtime), profiles, memoryMode: memory.threadMode().mode };
}
