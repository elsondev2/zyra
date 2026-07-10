const GPT_RELEASE_RE = /^gpt-(\d+)(?:\.(\d+))?(?:\.(\d+))?(?:-(.*))?$/i;
const PROVIDER_ORDER = new Map([
  ["openai-codex", 0],
  ["openai", 1],
]);
const GPT_56_TIER_ORDER = new Map([
  ["sol", 0],
  ["", 1],
  ["terra", 2],
  ["luna", 3],
]);

export function sortModelsLatestFirst(models = []) {
  return models
    .map((model, index) => ({ model, index, release: parseGptRelease(model?.id) }))
    .sort(compareModelEntries)
    .map(({ model }) => model);
}

function compareModelEntries(a, b) {
  if (a.release && b.release) {
    const releaseOrder = compareReleaseVersions(a.release, b.release);
    if (releaseOrder !== 0) return releaseOrder;

    const tierOrder = compareDocumentedTierOrder(a.release, b.release);
    if (tierOrder !== 0) return tierOrder;

    if (a.model?.id === b.model?.id) {
      const providerOrder = providerRank(a.model?.provider) - providerRank(b.model?.provider);
      if (providerOrder !== 0) return providerOrder;
    }
  } else if (a.release) {
    return -1;
  } else if (b.release) {
    return 1;
  }

  return a.index - b.index;
}

function compareReleaseVersions(a, b) {
  for (let index = 0; index < a.version.length; index += 1) {
    const difference = b.version[index] - a.version[index];
    if (difference !== 0) return difference;
  }
  return 0;
}

function compareDocumentedTierOrder(a, b) {
  if (a.version[0] !== 5 || a.version[1] !== 6 || b.version[0] !== 5 || b.version[1] !== 6) {
    return 0;
  }
  return tierRank(a.suffix) - tierRank(b.suffix);
}

function parseGptRelease(id) {
  const match = GPT_RELEASE_RE.exec(String(id ?? "").trim());
  if (!match) return undefined;
  return {
    version: [Number(match[1]), Number(match[2] ?? 0), Number(match[3] ?? 0)],
    suffix: String(match[4] ?? "").toLowerCase(),
  };
}

function tierRank(suffix) {
  return GPT_56_TIER_ORDER.get(suffix) ?? Number.MAX_SAFE_INTEGER;
}

function providerRank(provider) {
  return PROVIDER_ORDER.get(provider) ?? Number.MAX_SAFE_INTEGER;
}
