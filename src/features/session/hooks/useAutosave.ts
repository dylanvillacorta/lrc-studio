import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  createAutosaveScheduler,
  DEFAULT_AUTOSAVE_DELAY_MS,
  type AutosaveState,
} from '@/features/session/model/autosaveScheduler';
import type { IStorageAdapter } from '@/storage';
import type { ProjectFullData, SessionState } from '@/types';

/**
 * Intervalo mínimo (en ms) entre guardados automáticos de `currentTime` durante reproducción.
 */
export const PLAYBACK_SAVE_INTERVAL_MS = 1000;

/**
 * Instantánea completa que persiste el autoguardado (proyecto activo + estado de sesión).
 */
export interface AutosaveSnapshot {
  project: ProjectFullData | null;
  session: SessionState;
}

/**
 * Interfaz mínima compatible con `EventTarget` para registrar listeners en navegador o Node.
 */
export interface EventTargetLike {
  addEventListener(type: string, listener: EventListenerOrEventListenerObject): void;
  removeEventListener(type: string, listener: EventListenerOrEventListenerObject): void;
}

/**
 * Interfaz mínima compatible con `document` para escuchar `visibilitychange`.
 */
export interface VisibilityDocumentLike extends EventTargetLike {
  visibilityState?: string;
}

/**
 * Targets inyectables para los listeners de ciclo de vida del autoguardado.
 */
export interface AutosaveLifecycleTargets {
  windowTarget?: EventTargetLike | null;
  documentTarget?: VisibilityDocumentLike | null;
}

/**
 * Registra listeners de `visibilitychange` (cuando `visibilityState === 'hidden'`),
 * `pagehide` y `beforeunload` para disparar un guardado inmediato.
 * Devuelve la función de limpieza que elimina todos los listeners registrados.
 */
export function registerAutosaveLifecycleListeners(
  onFlush: () => void,
  targets: AutosaveLifecycleTargets = {},
): () => void {
  const windowTarget =
    targets.windowTarget !== undefined
      ? targets.windowTarget
      : typeof window !== 'undefined'
        ? window
        : null;
  const documentTarget =
    targets.documentTarget !== undefined
      ? targets.documentTarget
      : typeof document !== 'undefined'
        ? document
        : null;

  const handleVisibilityChange = (): void => {
    if (documentTarget?.visibilityState === 'hidden') {
      onFlush();
    }
  };

  const handlePageHide = (): void => {
    onFlush();
  };

  const handleBeforeUnload = (): void => {
    onFlush();
  };

  documentTarget?.addEventListener('visibilitychange', handleVisibilityChange);
  windowTarget?.addEventListener('pagehide', handlePageHide);
  windowTarget?.addEventListener('beforeunload', handleBeforeUnload);

  return () => {
    documentTarget?.removeEventListener('visibilitychange', handleVisibilityChange);
    windowTarget?.removeEventListener('pagehide', handlePageHide);
    windowTarget?.removeEventListener('beforeunload', handleBeforeUnload);
  };
}

/**
 * Indica si corresponde programar un nuevo guardado de `currentTime` durante reproducción
 * respetando el intervalo máximo de 1 vez por segundo.
 */
export function shouldSchedulePlaybackSave(
  lastSavedTickMs: number | null,
  nowMs: number,
  intervalMs = PLAYBACK_SAVE_INTERVAL_MS,
): boolean {
  if (lastSavedTickMs === null) {
    return true;
  }
  return nowMs - lastSavedTickMs >= intervalMs;
}

/**
 * Estado interno del rastreador de guardado durante reproducción/pausa.
 */
export interface PlaybackSaveTrackerState {
  wasPlaying: boolean;
  lastSavedTickMs: number | null;
}

/**
 * Evalúa qué acción de guardado corresponde al cambiar `isPlaying` o `currentTime`:
 * - Mientras reproduce: programa como máximo una vez por `intervalMs` (1000 ms).
 * - Al pausar (transición de `true` a `false`): exige `flush` inmediato para persistir el `currentTime` exacto.
 */
export function evaluatePlaybackSaveTick(
  prev: PlaybackSaveTrackerState,
  isPlaying: boolean,
  nowMs: number,
  intervalMs = PLAYBACK_SAVE_INTERVAL_MS,
): { nextState: PlaybackSaveTrackerState; action: 'none' | 'schedule' | 'flush' } {
  if (isPlaying) {
    const shouldSave = shouldSchedulePlaybackSave(
      prev.lastSavedTickMs,
      nowMs,
      intervalMs,
    );
    return {
      nextState: {
        wasPlaying: true,
        lastSavedTickMs: shouldSave ? nowMs : prev.lastSavedTickMs,
      },
      action: shouldSave ? 'schedule' : 'none',
    };
  }

  const action = prev.wasPlaying ? 'flush' : 'none';
  return {
    nextState: {
      wasPlaying: false,
      lastSavedTickMs: null,
    },
    action,
  };
}

export interface UseAutosaveOptions extends AutosaveLifecycleTargets {
  /** Retraso del debounce en milisegundos (por defecto 300 ms). */
  delayMs?: number;
  isPlaying?: boolean;
  /** Posición de reproducción actual en milisegundos. */
  currentTime?: number;
  /** Intervalo mínimo entre guardados de `currentTime` al reproducir, en milisegundos (por defecto 1000 ms). */
  playbackSaveIntervalMs?: number;
}

export interface UseAutosaveReturn {
  saveStatus: AutosaveState['status'];
  autosaveState: AutosaveState;
  scheduleSave: () => void;
  flush: () => Promise<void>;
  cancel: () => void;
}

/**
 * Hook que conecta `createAutosaveScheduler` con `IStorageAdapter`,
 * registra listeners de ciclo de vida (`visibilitychange`, `pagehide`, `beforeunload`)
 * y guarda `currentTime` periódicamente mientras se reproduce el audio (máximo 1 vez/s).
 */
export function useAutosave(
  adapter: IStorageAdapter,
  getSnapshot: () => AutosaveSnapshot,
  options: UseAutosaveOptions = {},
): UseAutosaveReturn {
  const {
    delayMs = DEFAULT_AUTOSAVE_DELAY_MS,
    windowTarget,
    documentTarget,
    isPlaying = false,
    currentTime = 0,
    playbackSaveIntervalMs = PLAYBACK_SAVE_INTERVAL_MS,
  } = options;

  const getSnapshotRef = useRef(getSnapshot);
  useEffect(() => {
    getSnapshotRef.current = getSnapshot;
  }, [getSnapshot]);

  const scheduler = useMemo(
    () =>
      createAutosaveScheduler<AutosaveSnapshot>({
        delayMs,
        save: async (snapshot) => {
          if (snapshot.project) {
            await adapter.saveProject(snapshot.project);
          }
          await adapter.saveSessionState(snapshot.session);
        },
      }),
    [adapter, delayMs],
  );

  const [autosaveState, setAutosaveState] = useState<AutosaveState>(() =>
    scheduler.getState(),
  );

  useEffect(() => {
    return scheduler.subscribe(setAutosaveState);
  }, [scheduler]);

  const flush = useCallback(async (): Promise<void> => {
    const latest = getSnapshotRef.current();
    if (latest.project !== null) {
      scheduler.schedule(latest);
    }
    await scheduler.flush();
  }, [scheduler]);

  const scheduleSave = useCallback((): void => {
    scheduler.schedule(getSnapshotRef.current());
  }, [scheduler]);

  const cancel = useCallback((): void => {
    scheduler.cancel();
  }, [scheduler]);

  useEffect(() => {
    const cleanupListeners = registerAutosaveLifecycleListeners(
      () => {
        void flush();
      },
      { windowTarget, documentTarget },
    );

    return () => {
      cleanupListeners();
      const status = scheduler.getState().status;
      if (status === 'pending' || status === 'saving' || status === 'error') {
        void flush();
      } else {
        scheduler.cancel();
      }
    };
  }, [documentTarget, flush, scheduler, windowTarget]);

  const playbackTrackerRef = useRef<PlaybackSaveTrackerState>({
    wasPlaying: false,
    lastSavedTickMs: null,
  });
  useEffect(() => {
    const { nextState, action } = evaluatePlaybackSaveTick(
      playbackTrackerRef.current,
      isPlaying,
      Date.now(),
      playbackSaveIntervalMs,
    );
    playbackTrackerRef.current = nextState;

    if (action === 'schedule') {
      scheduler.schedule(getSnapshotRef.current());
    } else if (action === 'flush') {
      void flush();
    }
  }, [currentTime, flush, isPlaying, playbackSaveIntervalMs, scheduler]);

  return {
    saveStatus: autosaveState.status,
    autosaveState,
    scheduleSave,
    flush,
    cancel,
  };
}
