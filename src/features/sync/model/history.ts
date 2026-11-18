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
