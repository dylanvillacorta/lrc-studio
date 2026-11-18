import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { flushPendingSave } from '@/app/providers';
import {
  isNewVersionAvailable,
  parseVersionResponse,
  type VersionInfo,
} from './model';

const DEFAULT_INTERVAL_MS = 10 * 60 * 1000;

export interface UseVersionCheckOptions {
  intervalMs?: number;
  fetchImpl?: typeof fetch;
  flush?: () => Promise<void>;
  localVersion?: VersionInfo;
  reload?: () => void;
}

export interface UseVersionCheckResult {
  updateAvailable: boolean;
  applyUpdate: () => Promise<void>;
}

function getDefaultLocalVersion(): VersionInfo {
  return {
    version: typeof APP_VERSION !== 'undefined' ? APP_VERSION : '0.0.0',
    commit: typeof APP_COMMIT !== 'undefined' ? APP_COMMIT : 'dev',
  };
}

export async function checkVersionOnce(
  localVersion: VersionInfo,
  fetchImpl: typeof fetch,
): Promise<boolean> {
  try {
    const response = await fetchImpl(`/version.json?t=${Date.now()}`, {
      cache: 'no-store',
    });
    if (!response.ok) {
      return false;
    }
    const json: unknown = await response.json();
    const remote = parseVersionResponse(json);
    if (!remote) {
      return false;
    }
    return isNewVersionAvailable(localVersion, remote);
  } catch {
    return false;
  }
}

export function useVersionCheck(
  options: UseVersionCheckOptions = {},
): UseVersionCheckResult {
  const {
    intervalMs = DEFAULT_INTERVAL_MS,
    fetchImpl = globalThis.fetch,
    flush = flushPendingSave,
    localVersion,
    reload = () => window.location.reload(),
  } = options;

  const fallbackLocal = getDefaultLocalVersion();
  const resolvedVersion = localVersion?.version ?? fallbackLocal.version;
  const resolvedCommit = localVersion?.commit ?? fallbackLocal.commit;
  const stableLocalVersion = useMemo<VersionInfo>(
    () => ({ version: resolvedVersion, commit: resolvedCommit }),
    [resolvedVersion, resolvedCommit],
  );

  const [updateAvailable, setUpdateAvailable] = useState(false);
  const checkingRef = useRef(false);

  const runCheck = useCallback(async () => {
    if (checkingRef.current || typeof fetchImpl !== 'function') {
      return;
    }
    checkingRef.current = true;
    try {
      const hasUpdate = await checkVersionOnce(stableLocalVersion, fetchImpl);
      if (hasUpdate) {
        setUpdateAvailable(true);
      }
    } finally {
      checkingRef.current = false;
    }
  }, [fetchImpl, stableLocalVersion]);

  useEffect(() => {
    void runCheck();

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void runCheck();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    const timerId = window.setInterval(() => {
      void runCheck();
    }, intervalMs);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.clearInterval(timerId);
    };
  }, [intervalMs, runCheck]);

  const applyUpdate = useCallback(async () => {
    try {
      await flush();
    } finally {
      reload();
    }
  }, [flush, reload]);

  return { updateAvailable, applyUpdate };
}
