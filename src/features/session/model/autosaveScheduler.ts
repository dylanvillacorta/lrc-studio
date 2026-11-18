import { formatStorageErrorMessage } from '@/features/session/model/storageError';

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
