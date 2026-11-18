export interface VersionInfo {
  version: string;
  commit: string;
  builtAt?: string;
}

export function isNewVersionAvailable(
  local: VersionInfo,
  remote: VersionInfo,
): boolean {
  if (!remote.version || !remote.commit) {
    return false;
  }
  return remote.version !== local.version || remote.commit !== local.commit;
}

export function parseVersionResponse(data: unknown): VersionInfo | null {
  if (typeof data !== 'object' || data === null) {
    return null;
  }
  const record = data as Record<string, unknown>;
  if (
    typeof record.version !== 'string' ||
    typeof record.commit !== 'string'
  ) {
    return null;
  }
  return {
    version: record.version,
    commit: record.commit,
    builtAt: typeof record.builtAt === 'string' ? record.builtAt : undefined,
  };
}
