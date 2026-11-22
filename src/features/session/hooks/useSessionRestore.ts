import { useCallback, useEffect, useRef, useState } from 'react';
import {
  planRestore,
  type RestorePlan,
} from '@/features/session/model/sessionPlanner';
import { inferAudioMime } from '@/lib/audioFormats';
import { formatStorageErrorMessage } from '@/features/session/model/storageError';
import { UnrestorableProjectError, type IStorageAdapter } from '@/storage';

/**
 * Estado del proceso de restauración de sesión al arrancar la aplicación.
 */
export type SessionRestoreStatus = 'loading' | 'ready' | 'empty' | 'error';

/**
 * Resultado puro de restaurar una sesión desde el adaptador de almacenamiento.
 */
export type RestoreAdapterResult =
  | { status: 'empty'; plan: null; notice?: string }
  | { status: 'ready'; plan: RestorePlan };

/**
 * Devuelve un `Blob` con el MIME canónico del audio (mismo criterio que el
 * adaptador de almacenamiento). Safari de iOS necesita un `type` correcto para
 * poder hacer seek en un blob URL; si el Blob ya lo tiene correcto se reutiliza.
 */
export function buildAudioBlob(
  binary: Blob | ArrayBuffer,
  fileName?: string,
): Blob {
  const isBlob = typeof Blob !== 'undefined' && binary instanceof Blob;
  const declared = isBlob ? (binary as Blob).type : undefined;
  const mime = inferAudioMime(fileName ?? '', declared);
  if (isBlob && (binary as Blob).type === mime) {
    return binary as Blob;
  }
  return new Blob([binary], { type: mime });
}
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

  const blob = buildAudioBlob(binary, fileName);

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

  let project: Awaited<ReturnType<IStorageAdapter['getProject']>>;
  let audio: Awaited<ReturnType<IStorageAdapter['getAudioBinary']>>;
  try {
    [project, audio] = await Promise.all([
      adapter.getProject(session.projectId),
      adapter.getAudioBinary(session.projectId),
    ]);
  } catch (err) {
    if (err instanceof UnrestorableProjectError) {
      // El registro se conserva intacto; la app arranca igual y avisa a la usuaria.
      return { status: 'empty', plan: null, notice: err.message };
    }
    throw err;
  }

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
  /** Duración del audio restaurado en segundos (`0` si no hay audio). */
  duration: number;
  error: string | null;
  /** Aviso cuando el proyecto activo guardado no se pudo restaurar (el registro se conserva intacto). */
  notice: string | null;
  reload: () => Promise<void>;
  /** Revoca el `ObjectURL` restaurado cuando el proveedor toma el control manual de otro audio/proyecto. */
  clearAudioUrl: () => void;
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
  const [notice, setNotice] = useState<string | null>(null);

  const activeUrlRef = useRef<string | null>(null);
  const mountedRef = useRef(true);
  const requestIdRef = useRef(0);

  const replaceAudioUrl = useCallback((nextUrl: string | null) => {
    if (activeUrlRef.current && activeUrlRef.current !== nextUrl) {
      revokeAudioObjectUrl(activeUrlRef.current);
    }
    activeUrlRef.current = nextUrl;
    setAudioUrl(nextUrl);
  }, []);

  const clearAudioUrl = useCallback(() => {
    replaceAudioUrl(null);
  }, [replaceAudioUrl]);

  const runRestore = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    setStatus('loading');
    setError(null);
    setNotice(null);

    try {
      const result = await restoreSessionFromAdapter(adapter);
      if (!mountedRef.current || requestIdRef.current !== requestId) {
        return;
      }

      if (result.status === 'empty') {
        replaceAudioUrl(null);
        setPlan(null);
        setNotice(result.notice ?? null);
        setStatus('empty');
        return;
      }

      const nextUrl = result.plan.audio
        ? createAudioObjectUrl(
            result.plan.audio.blob,
            result.plan.audio.fileName,
          )
        : null;

      if (!mountedRef.current || requestIdRef.current !== requestId) {
        revokeAudioObjectUrl(nextUrl);
        return;
      }

      replaceAudioUrl(nextUrl);
      setPlan(result.plan);
      setStatus('ready');
    } catch (err) {
      if (!mountedRef.current || requestIdRef.current !== requestId) {
        return;
      }
      replaceAudioUrl(null);
      setPlan(null);
      setError(
        formatStorageErrorMessage(
          err,
          'No se pudo restaurar la sesión guardada.',
        ),
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
      requestIdRef.current += 1;
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
    notice,
    reload: runRestore,
    clearAudioUrl,
  };
}
