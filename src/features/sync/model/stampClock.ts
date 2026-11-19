/**
 * Reloj único de lectura temporal para marcado y controles de reproducción,
 * junto con la compensación por latencia de salida de audio (0–500 ms).
 */

export const MAX_LATENCY_MS = 500;

export interface CurrentTimeSource {
  getCurrentTimeMs?: () => number;
  timeStore?: { getTimeMs: () => number } | null;
  currentTimeMs?: number;
}

/**
 * Única función de lectura del tiempo actual de reproducción en milisegundos.
 * Prioriza `getCurrentTimeMs()` (lectura directa de `audio.currentTime`) frente
 * al `timeStore` o al respaldo de render.
 */
export function readCurrentTimeMs(source: CurrentTimeSource): number {
  if (source.getCurrentTimeMs) {
    return source.getCurrentTimeMs();
  }
  if (source.timeStore) {
    return source.timeStore.getTimeMs();
  }
  return source.currentTimeMs ?? 0;
}

/**
 * Normaliza la compensación de latencia a un entero entre 0 y 500 ms.
 */
export function clampLatencyMs(latencyMs: number): number {
  if (typeof latencyMs !== 'number' || !Number.isFinite(latencyMs)) {
    return 0;
  }
  return Math.max(0, Math.min(MAX_LATENCY_MS, Math.round(latencyMs)));
}

/**
 * Calcula la marca temporal compensada restando la latencia de salida de audio,
 * acotada a un mínimo de 0 ms.
 */
export function computeCompensatedStampMs(
  rawTimeMs: number,
  latencyMs: number,
): number {
  const safeRaw =
    typeof rawTimeMs === 'number' && Number.isFinite(rawTimeMs)
      ? Math.round(rawTimeMs)
      : 0;
  return Math.max(0, safeRaw - clampLatencyMs(latencyMs));
}
