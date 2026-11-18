import { useCallback, useEffect, useRef, useState } from 'react';
import {
  planRestore,
  type RestorePlan,
} from '@/features/session/model/sessionPlanner';
import type { IStorageAdapter } from '@/storage';

/**
 * Estado del proceso de restauración de sesión al arrancar la aplicación.
 */
export type SessionRestoreStatus = 'loading' | 'ready' | 'empty' | 'error';

/**
 * Resultado puro de restaurar una sesión desde el adaptador de almacenamiento.
 */
export type RestoreAdapterResult =
  | { status: 'empty'; plan: null }
  | { status: 'ready'; plan: RestorePlan };

/**
 * Crea un `ObjectURL` a partir de un `Blob` o `ArrayBuffer` si el entorno soporta `URL.createObjectURL`.
 */
export function createAudioObjectUrl(
  binary: Blob | ArrayBuffer,
  fileName?: string,
): string | null {
  if (
    typeof URL === 'undefined' ||
    typeof URL.createObjectURL !== 'function'
  ) {
    return null;
  }

  const blob =
    typeof Blob !== 'undefined' && binary instanceof Blob
      ? binary
      : new Blob([binary], {
          type: fileName?.toLowerCase().endsWith('.wav')
            ? 'audio/wav'
            : 'audio/mpeg',
        });

  return URL.createObjectURL(blob);
}

/**
 * Revoca un `ObjectURL` previamente creado si el entorno soporta `URL.revokeObjectURL`.
 */
export function revokeAudioObjectUrl(url: string | null): void {
  if (
    url &&
    typeof URL !== 'undefined' &&
    typeof URL.revokeObjectURL === 'function'
  ) {
    URL.revokeObjectURL(url);
  }
}

/**
 * Inicializa el adaptador, lee la sesión guardada, recupera proyecto y audio
 * y construye el plan de restauración validado sin decodificar el audio de nuevo.
 */
export async function restoreSessionFromAdapter(
  adapter: IStorageAdapter,
): Promise<RestoreAdapterResult> {
  await adapter.init();
  const session = await adapter.getSessionState();
  if (!session || !session.projectId) {
    return { status: 'empty', plan: null };
  }

  const [project, audio] = await Promise.all([
    adapter.getProject(session.projectId),
    adapter.getAudioBinary(session.projectId),
  ]);

  const plan = planRestore(session, project, audio);
  if (!plan) {
    return { status: 'empty', plan: null };
  }

  return { status: 'ready', plan };
}

export interface UseSessionRestoreReturn {
  status: SessionRestoreStatus;
  plan: RestorePlan | null;
  audioUrl: string | null;
  peaks: number[];
  duration: number;
  error: string | null;
  reload: () => Promise<void>;
}

/**
 * Hook que restaura la última sesión activa al montar:
 * inicializa el adaptador, lee sesión/proyecto/audio, genera `ObjectURL` desde el `Blob`
 * y lo revoca al cambiar de proyecto o desmontar.
 */
export function useSessionRestore(
  adapter: IStorageAdapter,
): UseSessionRestoreReturn {
  const [status, setStatus] = useState<SessionRestoreStatus>('loading');
  const [plan, setPlan] = useState<RestorePlan | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const activeUrlRef = useRef<string | null>(null);
  const mountedRef = useRef(true);

  const replaceAudioUrl = useCallback((nextUrl: string | null) => {
    if (activeUrlRef.current && activeUrlRef.current !== nextUrl) {
      revokeAudioObjectUrl(activeUrlRef.current);
    }
    activeUrlRef.current = nextUrl;
    setAudioUrl(nextUrl);
  }, []);

  const runRestore = useCallback(async () => {
    setStatus('loading');
    setError(null);

    try {
      const result = await restoreSessionFromAdapter(adapter);
      if (!mountedRef.current) {
        return;
      }

      if (result.status === 'empty') {
        replaceAudioUrl(null);
        setPlan(null);
        setStatus('empty');
        return;
      }

      const nextUrl = result.plan.audio
        ? createAudioObjectUrl(
            result.plan.audio.blob,
            result.plan.audio.fileName,
          )
        : null;

      replaceAudioUrl(nextUrl);
      setPlan(result.plan);
      setStatus('ready');
    } catch (err) {
      if (!mountedRef.current) {
        return;
      }
      replaceAudioUrl(null);
      setPlan(null);
      setError(
        err instanceof Error && err.message.length > 0
          ? err.message
          : 'No se pudo restaurar la sesión guardada.',
      );
      setStatus('error');
    }
  }, [adapter, replaceAudioUrl]);

  useEffect(() => {
    mountedRef.current = true;
    const timer = setTimeout(() => {
      void runRestore();
    }, 0);

    return () => {
      mountedRef.current = false;
      clearTimeout(timer);
      revokeAudioObjectUrl(activeUrlRef.current);
      activeUrlRef.current = null;
    };
  }, [runRestore]);

  return {
    status,
    plan,
    audioUrl,
    peaks: plan?.peaks ?? [],
    duration: plan?.duration ?? 0,
    error,
    reload: runRestore,
  };
}
