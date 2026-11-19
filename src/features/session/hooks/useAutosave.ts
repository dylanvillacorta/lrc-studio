import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  createDualAutosaveCoordinator,
  DEFAULT_AUTOSAVE_DELAY_MS,
  DEFAULT_SESSION_AUTOSAVE_DELAY_MS,
  type AutosaveKind,
  type AutosaveState,
} from '@/features/session/model/autosaveScheduler';
import type { IStorageAdapter } from '@/storage';
import type { ProjectFullData, SessionState } from '@/types';

/**
 * Fuente externa de tiempo de reproducción para escuchar cambios sin re-renderizar el árbol React.
 */
export interface PlaybackTimeSource {
  getTimeMs: () => number;
  subscribe: (listener: () => void) => () => void;
}

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
  /** Retraso del debounce de datos del proyecto en milisegundos (por defecto 300 ms). */
  delayMs?: number;
  /** Retraso del debounce silencioso de sesión en milisegundos (por defecto 800 ms). */
  sessionDelayMs?: number;
  isPlaying?: boolean;
  /** Fuente externa de tiempo de reproducción (evita re-renders por fotograma). */
  timeStore?: PlaybackTimeSource | null;
  /** Posición de reproducción actual en milisegundos (respaldo si no se pasa `timeStore`). */
  currentTime?: number;
  /** Intervalo mínimo entre guardados de `currentTime` al reproducir, en milisegundos (por defecto 1000 ms). */
  playbackSaveIntervalMs?: number;
}

export interface UseAutosaveReturn {
  saveStatus: AutosaveState['status'];
  autosaveState: AutosaveState;
  scheduleSave: () => AutosaveKind;
  scheduleProjectSave: () => boolean;
  scheduleSessionSave: () => boolean;
  markBaseline: (project: ProjectFullData | null, session: SessionState | null) => void;
  markProjectBaseline: (project: ProjectFullData | null) => void;
  markSessionBaseline: (session: SessionState | null) => void;
  flush: () => Promise<void>;
  cancel: () => void;
}

/**
 * Hook que coordina el autoguardado dual con `IStorageAdapter`:
 * - cambios del proyecto (300 ms, indicador visible),
 * - estado de sesión y `currentTime` (800 ms silencioso, sin alterar el indicador),
 * - flush en `visibilitychange`, `pagehide`, `beforeunload` y al pausar.
 */
export function useAutosave(
  adapter: IStorageAdapter,
  getSnapshot: () => AutosaveSnapshot,
  options: UseAutosaveOptions = {},
): UseAutosaveReturn {
  const {
    delayMs = DEFAULT_AUTOSAVE_DELAY_MS,
    sessionDelayMs = DEFAULT_SESSION_AUTOSAVE_DELAY_MS,
    windowTarget,
    documentTarget,
    isPlaying = false,
    timeStore = null,
    currentTime = 0,
    playbackSaveIntervalMs = PLAYBACK_SAVE_INTERVAL_MS,
  } = options;

  const getSnapshotRef = useRef(getSnapshot);
  useEffect(() => {
    getSnapshotRef.current = getSnapshot;
  }, [getSnapshot]);

  const coordinator = useMemo(
    () =>
      createDualAutosaveCoordinator({
        projectDelayMs: delayMs,
        sessionDelayMs,
        saveProject: (project) => adapter.saveProject(project),
        saveSession: (session) => adapter.saveSessionState(session),
      }),
    [adapter, delayMs, sessionDelayMs],
  );

  const [autosaveState, setAutosaveState] = useState<AutosaveState>(() =>
    coordinator.getState(),
  );

  useEffect(() => {
    return coordinator.subscribe(setAutosaveState);
  }, [coordinator]);

  const flush = useCallback(async (): Promise<void> => {
    await coordinator.flush(getSnapshotRef.current());
  }, [coordinator]);

  const scheduleSave = useCallback((): AutosaveKind => {
    return coordinator.schedule(getSnapshotRef.current());
  }, [coordinator]);

  const scheduleProjectSave = useCallback((): boolean => {
    return coordinator.scheduleProject(getSnapshotRef.current());
  }, [coordinator]);

  const scheduleSessionSave = useCallback((): boolean => {
    return coordinator.scheduleSession(getSnapshotRef.current().session);
  }, [coordinator]);

  const markBaseline = useCallback(
    (project: ProjectFullData | null, session: SessionState | null): void => {
      coordinator.markBaseline(project, session);
    },
    [coordinator],
  );

  const markProjectBaseline = useCallback(
    (project: ProjectFullData | null): void => {
      coordinator.markProjectBaseline(project);
    },
    [coordinator],
  );

  const markSessionBaseline = useCallback(
    (session: SessionState | null): void => {
      coordinator.markSessionBaseline(session);
    },
    [coordinator],
  );

  const cancel = useCallback((): void => {
    coordinator.cancel();
  }, [coordinator]);

  useEffect(() => {
    const cleanupListeners = registerAutosaveLifecycleListeners(
      () => {
        void flush();
      },
      { windowTarget, documentTarget },
    );

    return () => {
      cleanupListeners();
      void flush();
    };
  }, [documentTarget, flush, windowTarget]);

  const playbackTrackerRef = useRef<PlaybackSaveTrackerState>({
    wasPlaying: false,
    lastSavedTickMs: null,
  });

  // Evalúa transiciones de reproducción/pausa sin depender de `currentTime` cuando existe `timeStore`.
  useEffect(() => {
    const { nextState, action } = evaluatePlaybackSaveTick(
      playbackTrackerRef.current,
      isPlaying,
      Date.now(),
      playbackSaveIntervalMs,
    );
    playbackTrackerRef.current = nextState;

    const latest = getSnapshotRef.current();
    if (!latest.project) {
      return;
    }

    if (action === 'schedule') {
      coordinator.scheduleSession(latest.session);
    } else if (action === 'flush') {
      void flush();
    }
  }, [coordinator, flush, isPlaying, playbackSaveIntervalMs]);

  // Suscripción externa al tiempo de reproducción para guardado silencioso periódico y al hacer seek.
  useEffect(() => {
    if (!timeStore) {
      return;
    }
    return timeStore.subscribe(() => {
      const latest = getSnapshotRef.current();
      if (!latest.project) {
        return;
      }
      if (!isPlaying) {
        coordinator.scheduleSession(latest.session);
        return;
      }
      const { nextState, action } = evaluatePlaybackSaveTick(
        playbackTrackerRef.current,
        true,
        Date.now(),
        playbackSaveIntervalMs,
      );
      playbackTrackerRef.current = nextState;
      if (action === 'schedule') {
        coordinator.scheduleSession(latest.session);
      }
    });
  }, [coordinator, isPlaying, playbackSaveIntervalMs, timeStore]);

  // Respaldo para entornos sin `timeStore` que pasan `currentTime` numérico.
  useEffect(() => {
    if (timeStore) {
      return;
    }
    const latest = getSnapshotRef.current();
    if (!latest.project) {
      return;
    }
    if (!isPlaying) {
      coordinator.scheduleSession(latest.session);
      return;
    }
    const { nextState, action } = evaluatePlaybackSaveTick(
      playbackTrackerRef.current,
      true,
      Date.now(),
      playbackSaveIntervalMs,
    );
    playbackTrackerRef.current = nextState;
    if (action === 'schedule') {
      coordinator.scheduleSession(latest.session);
    }
  }, [coordinator, currentTime, isPlaying, playbackSaveIntervalMs, timeStore]);

  return useMemo<UseAutosaveReturn>(
    () => ({
      saveStatus: autosaveState.status,
      autosaveState,
      scheduleSave,
      scheduleProjectSave,
      scheduleSessionSave,
      markBaseline,
      markProjectBaseline,
      markSessionBaseline,
      flush,
      cancel,
    }),
    [
      autosaveState,
      cancel,
      flush,
      markBaseline,
      markProjectBaseline,
      markSessionBaseline,
      scheduleProjectSave,
      scheduleSave,
      scheduleSessionSave,
    ],
  );
}
