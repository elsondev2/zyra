export type DesktopInstallation = { kind: 'development' | 'installed' | 'standalone'; label: string }

export function readConnectionIdentity(value: unknown, expectedNamespaceId?: string) {
  const status = value && typeof value === 'object' ? value as Record<string, any> : {}
  const advertisedNamespace = status.instance?.namespaceId || status.installation?.namespaceId
  const namespaceId = typeof advertisedNamespace === 'string' && /^[a-zA-Z0-9_-]{1,128}$/.test(advertisedNamespace)
    ? advertisedNamespace : undefined
  if (expectedNamespaceId && namespaceId !== expectedNamespaceId) {
    throw new Error('This address belongs to a different Zyra instance. Reopen the original instance or connect to another one explicitly.')
  }
  const source = status.installation
  const installation: DesktopInstallation | undefined = source && ['development', 'installed', 'standalone'].includes(source.kind)
    && typeof source.label === 'string' && source.label.trim()
    ? { kind: source.kind, label: source.label.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 120) } : undefined
  return { namespaceId, ...(installation ? { runtimeStatus: { installation } } : {}) }
}
