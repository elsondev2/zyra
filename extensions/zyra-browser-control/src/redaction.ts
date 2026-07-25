// @ts-nocheck
export function redactExtensionObservation(observation) {
  return {
    ...observation,
    url: redactUrl(observation.url),
    elements: (observation.elements || []).map((element) => element.sensitive
      ? { ...element, value: undefined, text: element.text ? '[REDACTED]' : undefined }
      : element),
    redactions: [...new Set([...(observation.redactions || []), 'password-values', 'url-query-secrets'])]
  }
}

export function redactUrl(value) {
  try {
    const url = new URL(value)
    for (const key of [...url.searchParams.keys()]) {
      if (/token|secret|password|code|state|auth|credential|key/i.test(key)) url.searchParams.set(key, '[REDACTED]')
    }
    url.hash = ''
    return url.toString()
  } catch {
    return String(value || '').slice(0, 2048)
  }
}
