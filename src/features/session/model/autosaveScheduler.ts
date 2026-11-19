import { formatStorageErrorMessage } from '@/features/session/model/storageError';
import type { ProjectFullData, SessionState } from '@/types';

/**
 * Estado actual del programador de autoguardado.
 */
export type SaveStatus = 'idle' | 'pending' | 'saving' | 'saved' | 'error';

/**
 * Instantánea observable del estado de autoguardado.
 */
export interface AutosaveState {
  status: SaveStatus;
  lastSavedAt: number | null;
  error: string | null;
}

/**
 * Opciones para `createAutosaveScheduler`.
 */
export interface AutosaveSchedulerOptions<T> {
  save: (snapshot: T) => Promise<void>;
  delayMs?: number;
  now?: () => number;
}

/**
 * Programador de autoguardado con debounce, coalescing y serialización estricta.
 */
export interface AutosaveScheduler<T> {
  schedule: (snapshot: T) => void;
  flush: () => Promise<void>;
  cancel: () => void;
  getState: () => AutosaveState;
  subscribe: (listener: (state: AutosaveState) => void) => () => void;
}

export const DEFAULT_AUTOSAVE_DELAY_MS = 300;
export const DEFAULT_SESSION_AUTOSAVE_DELAY_MS = 800;

export type AutosaveKind = 'none' | 'silent' | 'visible';

export interface DualAutosaveSnapshot {
  project: ProjectFullData | null;
  session: SessionState;
}

/**
 * Compara en O(1) si los datos persistibles del proyecto cambiaron respecto a la última versión guardada.
 */
export function hasProjectChanged(
  next: ProjectFullData | null,
  prev: ProjectFullData | null,
): boolean {
  if (next === null) {
    return false;
  }
  if (prev === null) {
    return true;
  }
  if (next === prev) {
    return false;
  }
  return (
    next.id !== prev.id ||
    next.updatedAt !== prev.updatedAt ||
    next.title !== prev.title ||
    next.artist !== prev.artist ||
    next.audioFileName !== prev.audioFileName ||
    next.durationMs !== prev.durationMs ||
    next.lines !== prev.lines ||
    next.waveformPeaks !== prev.waveformPeaks ||
    next.settings !== prev.settings
  );
}

/**
 * Compara si el estado de sesión cambió respecto al último guardado (ignorando `updatedAt`).
 */
export function hasSessionChanged(
  next: SessionState,
  prev: SessionState | null,
): boolean {
  if (prev === null) {
    return true;
  }
  return (
    next.projectId !== prev.projectId ||
    next.activeTab !== prev.activeTab ||
    next.currentTime !== prev.currentTime ||
    next.activeLineIndex !== prev.activeLineIndex ||
    next.activeWordIndex !== prev.activeWordIndex
  );
}

/**
 * Clasifica qué tipo de guardado corresponde ante una instantánea actual:
 * - `'visible'`: cambiaron los datos del proyecto (letra, marcas, metadatos, audio).
 * - `'silent'`: solo cambió el estado de sesión (pestaña, línea, palabra, `currentTime`).
 * - `'none'`: no hay cambios reales respecto a la línea base guardada.
 */
export function classifyAutosaveChange(params: {
  project: ProjectFullData | null;
  lastSavedProject: ProjectFullData | null;
  session: SessionState;
  lastSavedSession: SessionState | null;
}): AutosaveKind {
  if (hasProjectChanged(params.project, params.lastSavedProject)) {
    return 'visible';
  }
  if (hasSessionChanged(params.session, params.lastSavedSession)) {
    return 'silent';
  }
  return 'none';
}

export interface DualAutosaveCoordinatorOptions {
  saveProject: (project: ProjectFullData) => Promise<void>;
  saveSession: (session: SessionState) => Promise<void>;
  projectDelayMs?: number;
  sessionDelayMs?: number;
  now?: () => number;
}

export interface DualAutosaveCoordinator {
  schedule: (snapshot: DualAutosaveSnapshot) => AutosaveKind;
  scheduleProject: (snapshot: DualAutosaveSnapshot) => boolean;
  scheduleSession: (session: SessionState) => boolean;
  flush: (latestSnapshot?: DualAutosaveSnapshot) => Promise<void>;
  cancel: () => void;
  markBaseline: (project: ProjectFullData | null, session: SessionState | null) => void;
  markProjectBaseline: (project: ProjectFullData | null) => void;
  markSessionBaseline: (session: SessionState | null) => void;
  getState: () => AutosaveState;
  subscribe: (listener: (state: AutosaveState) => void) => () => void;
}

/**
 * Crea un programador de autoguardado con debounce (300 ms por defecto) que:
 * - fusiona (coalesce) cambios consecutivos quedándose con el último snapshot,
 * - serializa los guardados para que nunca se solapen ni un guardado viejo pise a uno nuevo,
 * - ante un error conserva el dato pendiente para reintentarlo en el siguiente cambio o `flush()`.
 */
export function createAutosaveScheduler<T>(
  options: AutosaveSchedulerOptions<T>,
): AutosaveScheduler<T> {
  const {
    save,
    delayMs = DEFAULT_AUTOSAVE_DELAY_MS,
    now = () => Date.now(),
  } = options;

  let timerId: ReturnType<typeof setTimeout> | null = null;
  let pendingSnapshot: T | null = null;
  let hasPending = false;
  let inFlightPromise: Promise<void> | null = null;
  let isExecuting = false;
  let generation = 0;

  let state: AutosaveState = {
    status: 'idle',
    lastSavedAt: null,
    error: null,
  };

  const listeners = new Set<(nextState: AutosaveState) => void>();

  function emit(nextState: AutosaveState): void {
    state = nextState;
    for (const listener of listeners) {
      listener(state);
    }
  }

  function clearTimer(): void {
    if (timerId !== null) {
      clearTimeout(timerId);
      timerId = null;
    }
  }

  async function drain(): Promise<void> {
    if (inFlightPromise !== null) {
      await inFlightPromise;
      if (!hasPending) {
        return;
      }
    }

    if (!hasPending) {
      return;
    }

    const run = async (): Promise<void> => {
      isExecuting = true;
      try {
        while (hasPending) {
          clearTimer();
          const snapshot = pendingSnapshot as T;
          const runGeneration = generation;
          pendingSnapshot = null;
          hasPending = false;

          emit({
            status: 'saving',
            lastSavedAt: state.lastSavedAt,
            error: null,
          });

          try {
            await save(snapshot);
            // Si `cancel()` se ejecutó mientras estaba en vuelo, volvemos a idle sin marcar saved
            if (generation !== runGeneration && !hasPending) {
              emit({
                status: 'idle',
                lastSavedAt: state.lastSavedAt,
                error: null,
              });
              break;
            }
            if (!hasPending) {
              emit({
                status: 'saved',
                lastSavedAt: now(),
                error: null,
              });
            }
          } catch (err) {
            const message = formatStorageErrorMessage(
              err,
              'Error al guardar los cambios.',
            );

            // Conservar el snapshot fallido para reintentar si no llegó uno más nuevo.
            if (!hasPending) {
              pendingSnapshot = snapshot;
              hasPending = true;
            }

            emit({
              status: 'error',
              lastSavedAt: state.lastSavedAt,
              error: message,
            });
            break;
          }
        }
      } finally {
        isExecuting = false;
      }
    };

    inFlightPromise = run().finally(() => {
      inFlightPromise = null;
    });

    await inFlightPromise;
  }

  function schedule(snapshot: T): void {
    pendingSnapshot = snapshot;
    hasPending = true;
    clearTimer();

    if (!isExecuting) {
      emit({
        status: 'pending',
        lastSavedAt: state.lastSavedAt,
        error: null,
      });
    }

    timerId = setTimeout(() => {
      timerId = null;
      void drain();
    }, delayMs);
  }

  async function flush(): Promise<void> {
    clearTimer();
    if (inFlightPromise !== null) {
      await inFlightPromise;
    }
    if (hasPending) {
      await drain();
    }
  }

  function cancel(): void {
    clearTimer();
    generation += 1;
    pendingSnapshot = null;
    hasPending = false;
    if (!isExecuting) {
      emit({
        status: 'idle',
        lastSavedAt: state.lastSavedAt,
        error: null,
      });
    }
  }

  function getState(): AutosaveState {
    return state;
  }

  function subscribe(listener: (nextState: AutosaveState) => void): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }

  return {
    schedule,
    flush,
    cancel,
    getState,
    subscribe,
  };
}

/**
 * Coordina dos canales independientes de autoguardado:
 * - Canal visible (300 ms): cambios reales del proyecto, actualiza `AutosaveState`.
 * - Canal silencioso (800 ms por defecto): estado de sesión, sin alterar el indicador visible ni escribir el proyecto.
 */
export function createDualAutosaveCoordinator(
  options: DualAutosaveCoordinatorOptions,
): DualAutosaveCoordinator {
  const {
    saveProject,
    saveSession,
    projectDelayMs = DEFAULT_AUTOSAVE_DELAY_MS,
    sessionDelayMs = DEFAULT_SESSION_AUTOSAVE_DELAY_MS,
    now,
  } = options;

  let lastSavedProject: ProjectFullData | null = null;
  let lastSavedSession: SessionState | null = null;
  let latestSession: SessionState | null = null;
  let sessionWriteChain: Promise<void> = Promise.resolve();

  function enqueueSessionSave(session: SessionState): Promise<void> {
    const run = sessionWriteChain.then(async () => {
      if (!hasSessionChanged(session, lastSavedSession)) {
        return;
      }
      await saveSession(session);
      lastSavedSession = session;
    });
    sessionWriteChain = run.catch(() => {});
    return run;
  }

  const projectScheduler = createAutosaveScheduler<DualAutosaveSnapshot>({
    delayMs: projectDelayMs,
    now,
    save: async (snapshot) => {
      if (snapshot.project && hasProjectChanged(snapshot.project, lastSavedProject)) {
        await saveProject(snapshot.project);
        lastSavedProject = snapshot.project;
      }
      const sessionToPersist =
        latestSession &&
        latestSession.projectId === (snapshot.project?.id ?? null)
          ? latestSession
          : snapshot.session;
      await enqueueSessionSave(sessionToPersist);
    },
  });

  const sessionScheduler = createAutosaveScheduler<SessionState>({
    delayMs: sessionDelayMs,
    now,
    save: async (session) => {
      await enqueueSessionSave(session);
    },
  });

  function scheduleProject(snapshot: DualAutosaveSnapshot): boolean {
    latestSession = snapshot.session;
    if (!hasProjectChanged(snapshot.project, lastSavedProject)) {
      return false;
    }
    projectScheduler.schedule(snapshot);
    return true;
  }

  function scheduleSession(session: SessionState): boolean {
    latestSession = session;
    if (!hasSessionChanged(session, lastSavedSession)) {
      return false;
    }
    sessionScheduler.schedule(session);
    return true;
  }

  function schedule(snapshot: DualAutosaveSnapshot): AutosaveKind {
    latestSession = snapshot.session;
    const kind = classifyAutosaveChange({
      project: snapshot.project,
      lastSavedProject,
      session: snapshot.session,
      lastSavedSession,
    });
    if (kind === 'visible') {
      projectScheduler.schedule(snapshot);
    } else if (kind === 'silent') {
      sessionScheduler.schedule(snapshot.session);
    }
    return kind;
  }

  async function flush(latestSnapshot?: DualAutosaveSnapshot): Promise<void> {
    if (latestSnapshot) {
      latestSession = latestSnapshot.session;
      if (hasProjectChanged(latestSnapshot.project, lastSavedProject)) {
        projectScheduler.schedule(latestSnapshot);
      }
    }

    const projectStatus = projectScheduler.getState().status;
    if (
      projectStatus === 'pending' ||
      projectStatus === 'saving' ||
      projectStatus === 'error'
    ) {
      await projectScheduler.flush();
    }

    if (latestSnapshot && hasSessionChanged(latestSnapshot.session, lastSavedSession)) {
      sessionScheduler.schedule(latestSnapshot.session);
    }

    const sessionStatus = sessionScheduler.getState().status;
    if (
      sessionStatus === 'pending' ||
      sessionStatus === 'saving' ||
      sessionStatus === 'error'
    ) {
      await sessionScheduler.flush();
    }
  }

  function cancel(): void {
    latestSession = null;
    projectScheduler.cancel();
    sessionScheduler.cancel();
  }

  function markProjectBaseline(project: ProjectFullData | null): void {
    lastSavedProject = project;
    if (projectScheduler.getState().status === 'pending') {
      projectScheduler.cancel();
    }
  }

  function markSessionBaseline(session: SessionState | null): void {
    lastSavedSession = session;
    latestSession = session;
    if (sessionScheduler.getState().status === 'pending') {
      sessionScheduler.cancel();
    }
  }

  function markBaseline(
    project: ProjectFullData | null,
    session: SessionState | null,
  ): void {
    markProjectBaseline(project);
    markSessionBaseline(session);
  }

  return {
    schedule,
    scheduleProject,
    scheduleSession,
    flush,
    cancel,
    markBaseline,
    markProjectBaseline,
    markSessionBaseline,
    getState: projectScheduler.getState,
    subscribe: projectScheduler.subscribe,
  };
}
