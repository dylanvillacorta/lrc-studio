/**
 * Pila de historial inmutable para deshacer operaciones de sincronización.
 * Extraído como lógica pura para permitir pruebas unitarias sin DOM.
 */

import type { LyricLine } from '@/types';

export interface SyncSnapshot {
  lines: LyricLine[];
  activeLineIndex: number;
  activeWordIndex: number;
}

export const MAX_SYNC_HISTORY = 50;

/**
 * Agrega una instantánea a la pila de historial respetando el límite máximo.
 */
export function pushSyncHistory(
  history: readonly SyncSnapshot[],
  snapshot: SyncSnapshot,
  maxItems = MAX_SYNC_HISTORY,
): SyncSnapshot[] {
  const next = [...history, snapshot];
  if (next.length > maxItems) {
    return next.slice(next.length - maxItems);
  }
  return next;
}

/**
 * Extrae la última instantánea del historial. Devuelve `snapshot: null` si no hay historial.
 */
export function popSyncHistory(history: readonly SyncSnapshot[]): {
  snapshot: SyncSnapshot | null;
  remaining: SyncSnapshot[];
} {
  if (history.length === 0) {
    return { snapshot: null, remaining: [] };
  }
  const snapshot = history[history.length - 1] ?? null;
  return {
    snapshot,
    remaining: history.slice(0, -1),
  };
}

export interface SyncHistoryState {
  past: SyncSnapshot[];
  future: SyncSnapshot[];
}

export function createSyncHistoryState(): SyncHistoryState {
  return { past: [], future: [] };
}

/**
 * Registra una instantánea previa a un cambio y limpia la pila de rehacer.
 */
export function recordSyncHistory(
  state: SyncHistoryState,
  snapshot: SyncSnapshot,
  maxItems = MAX_SYNC_HISTORY,
): SyncHistoryState {
  return {
    past: pushSyncHistory(state.past, snapshot, maxItems),
    future: [],
  };
}

/**
 * Deshace un paso guardando el estado actual en `future` para permitir rehacer.
 */
export function undoSyncHistory(
  state: SyncHistoryState,
  current: SyncSnapshot,
  maxItems = MAX_SYNC_HISTORY,
): { state: SyncHistoryState; snapshot: SyncSnapshot | null } {
  const { snapshot, remaining } = popSyncHistory(state.past);
  if (!snapshot) {
    return { state, snapshot: null };
  }
  return {
    state: {
      past: remaining,
      future: pushSyncHistory(state.future, current, maxItems),
    },
    snapshot,
  };
}

/**
 * Rehace un paso previamente deshecho y lo devuelve a la pila `past`.
 */
export function redoSyncHistory(
  state: SyncHistoryState,
  current: SyncSnapshot,
  maxItems = MAX_SYNC_HISTORY,
): { state: SyncHistoryState; snapshot: SyncSnapshot | null } {
  const { snapshot, remaining } = popSyncHistory(state.future);
  if (!snapshot) {
    return { state, snapshot: null };
  }
  return {
    state: {
      past: pushSyncHistory(state.past, current, maxItems),
      future: remaining,
    },
    snapshot,
  };
}
