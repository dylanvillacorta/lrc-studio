import { useCallback, useEffect, useState } from 'react';
import type { IStorageAdapter } from '@/storage';

const MAX_LATENCY_MS = 500;

function normalizeLatencyMs(value: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(MAX_LATENCY_MS, Math.round(value)));
}

export interface UseDeviceLatencyReturn {
  latencyMs: number;
  setLatencyMs: (nextMs: number) => void;
}

/**
 * Carga y persiste la compensación de latencia de audio del dispositivo (0–500 ms)
 * mediante `IStorageAdapter`.
 */
export function useDeviceLatency(adapter: IStorageAdapter): UseDeviceLatencyReturn {
  const [latencyMs, setLatencyMsState] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void adapter
      .getLatencyMs()
      .then((stored) => {
        if (!cancelled) {
          setLatencyMsState(normalizeLatencyMs(stored));
        }
      })
      .catch(() => {
        // Mantiene 0 ms por defecto si falla la lectura inicial.
      });
    return () => {
      cancelled = true;
    };
  }, [adapter]);

  const setLatencyMs = useCallback(
    (nextMs: number) => {
      const normalized = normalizeLatencyMs(nextMs);
      setLatencyMsState(normalized);
      void adapter.saveLatencyMs(normalized).catch(() => {
        // Ignora errores transitorios de almacenamiento en segundo plano.
      });
    },
    [adapter],
  );

  return { latencyMs, setLatencyMs };
}
