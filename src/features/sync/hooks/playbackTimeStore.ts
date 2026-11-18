import { useCallback, useSyncExternalStore } from 'react';

/**
 * Almacén externo ligero para el tiempo de reproducción actual (en milisegundos).
 * Permite leer el instante exacto sin costo y suscribir únicamente los componentes
 * que muestran el tiempo en pantalla, evitando re-renderizar toda la aplicación a 60 FPS.
 */
export interface PlaybackTimeStore {
  getTimeMs: () => number;
  setTimeMs: (nextMs: number) => void;
  subscribe: (listener: () => void) => () => void;
}

function normalizeTimeMs(value: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return 0;
  }
  return Math.round(value);
}

/**
 * Crea un almacén externo de tiempo de reproducción con suscripción sin estado de React.
 */
export function createPlaybackTimeStore(initialMs = 0): PlaybackTimeStore {
  let timeMs = normalizeTimeMs(initialMs);
  const listeners = new Set<() => void>();

  return {
    getTimeMs: () => timeMs,
    setTimeMs: (nextMs: number) => {
      const normalized = normalizeTimeMs(nextMs);
      if (normalized === timeMs) {
        return;
      }
      timeMs = normalized;
      for (const listener of listeners) {
        listener();
      }
    },
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

/**
 * Suscribe un componente hoja al almacén de tiempo con limitación de frecuencia (throttle)
 * para no saturar la interfaz durante la reproducción continua, manteniendo respuesta
 * inmediata en saltos manuales y entrega final al pausar.
 */
export function usePlaybackTime(
  store: PlaybackTimeStore | null | undefined,
  fallbackMs = 0,
  throttleMs = 33,
): number {
  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      if (!store) {
        return () => {};
      }
      if (throttleMs <= 0) {
        return store.subscribe(onStoreChange);
      }

      let lastNotifiedAt = 0;
      let trailingTimer: ReturnType<typeof setTimeout> | null = null;

      const unsubscribe = store.subscribe(() => {
        const now = Date.now();
        const elapsed = now - lastNotifiedAt;
        if (elapsed >= throttleMs) {
          if (trailingTimer !== null) {
            clearTimeout(trailingTimer);
            trailingTimer = null;
          }
          lastNotifiedAt = now;
          onStoreChange();
        } else if (trailingTimer === null) {
          trailingTimer = setTimeout(() => {
            trailingTimer = null;
            lastNotifiedAt = Date.now();
            onStoreChange();
          }, throttleMs - elapsed);
        }
      });

      return () => {
        unsubscribe();
        if (trailingTimer !== null) {
          clearTimeout(trailingTimer);
          trailingTimer = null;
        }
      };
    },
    [store, throttleMs],
  );

  const getSnapshot = useCallback(
    () => (store ? store.getTimeMs() : fallbackMs),
    [fallbackMs, store],
  );

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
