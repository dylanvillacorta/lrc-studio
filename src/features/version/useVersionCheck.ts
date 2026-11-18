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
  checking: boolean;
  builtAt: string | null;
  checkMessage: string | null;
  checkNow: () => Promise<boolean>;
  applyUpdate: () => Promise<void>;
}

function getDefaultLocalVersion(): VersionInfo {
  return {
    version: typeof APP_VERSION !== 'undefined' ? APP_VERSION : '0.0.0',
    commit: typeof APP_COMMIT !== 'undefined' ? APP_COMMIT : 'dev',
  };
}

export async function fetchVersionInfo(
  fetchImpl: typeof fetch,
): Promise<VersionInfo | null> {
  try {
    const response = await fetchImpl(`/version.json?t=${Date.now()}`, {
      cache: 'no-store',
    });
    if (!response.ok) {
      return null;
    }
    const json: unknown = await response.json();
    return parseVersionResponse(json);
  } catch {
    return null;
  }
}

export async function checkVersionOnce(
  localVersion: VersionInfo,
  fetchImpl: typeof fetch,
): Promise<boolean> {
  const remote = await fetchVersionInfo(fetchImpl);
  if (!remote) {
    return false;
  }
  return isNewVersionAvailable(localVersion, remote);
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
  const [checking, setChecking] = useState(false);
  const [builtAt, setBuiltAt] = useState<string | null>(null);
  const [checkMessage, setCheckMessage] = useState<string | null>(null);
  const checkingRef = useRef(false);

  const runBackgroundCheck = useCallback(async () => {
    if (checkingRef.current || typeof fetchImpl !== 'function') {
      return;
    }
    checkingRef.current = true;
    try {
      const remote = await fetchVersionInfo(fetchImpl);
      if (!remote) {
        return;
      }
      if (remote.builtAt) {
        setBuiltAt(remote.builtAt);
      }
      if (isNewVersionAvailable(stableLocalVersion, remote)) {
        setUpdateAvailable(true);
      }
    } finally {
      checkingRef.current = false;
    }
  }, [fetchImpl, stableLocalVersion]);

  const checkNow = useCallback(async (): Promise<boolean> => {
    if (checkingRef.current || typeof fetchImpl !== 'function') {
      return false;
    }
    checkingRef.current = true;
    setChecking(true);
    setCheckMessage(null);
    try {
      const remote = await fetchVersionInfo(fetchImpl);
      if (!remote) {
        setCheckMessage('No se pudo comprobar en este momento.');
        return false;
      }
      if (remote.builtAt) {
        setBuiltAt(remote.builtAt);
      }
      const hasUpdate = isNewVersionAvailable(stableLocalVersion, remote);
      if (hasUpdate) {
        setUpdateAvailable(true);
        setCheckMessage(`Nueva versión disponible: v${remote.version}`);
      } else {
        setCheckMessage('Estás en la última versión.');
      }
      return hasUpdate;
    } finally {
      checkingRef.current = false;
      setChecking(false);
    }
  }, [fetchImpl, stableLocalVersion]);

  useEffect(() => {
    void runBackgroundCheck();

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void runBackgroundCheck();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    const timerId = window.setInterval(() => {
      void runBackgroundCheck();
    }, intervalMs);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.clearInterval(timerId);
    };
  }, [intervalMs, runBackgroundCheck]);

  const applyUpdate = useCallback(async () => {
    try {
      await flush();
    } finally {
      reload();
    }
  }, [flush, reload]);

  return {
    updateAvailable,
    checking,
    builtAt,
    checkMessage,
    checkNow,
    applyUpdate,
  };
}
