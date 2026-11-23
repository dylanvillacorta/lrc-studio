import type { LyricLine } from '@/types';

/**
 * Límites de una línea y utilidades puras del inspector numérico (±10/±50 ms).
 * Antes vivían en la lupa de onda.
 */
export const MIN_LINE_DURATION_MS = 50;
export const INSPECTOR_STEPS_MS = [-50, -10, 10, 50] as const;

export interface LineBounds {
  startMs: number;
  endMs: number;
}

export interface DragEdgeParams {
  edge: 'start' | 'end';
  targetMs: number;
  startMs: number;
  endMs: number;
  durationMs: number;
  minDurationMs?: number;
  snapStepMs?: number;
}

/**
 * Limita un valor numérico al rango `[min, max]`.
 */
export function clampMs(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }
  if (max <= min) {
    return min;
  }
  return Math.min(max, Math.max(min, value));
}

/**
 * Ajusta un tiempo al múltiplo más cercano de `snapStepMs` si es mayor que 0.
 */
export function snapMs(ms: number, snapStepMs?: number): number {
  if (!Number.isFinite(ms)) {
    return 0;
  }
  if (snapStepMs !== undefined && snapStepMs > 0) {
    return Math.round(ms / snapStepMs) * snapStepMs;
  }
  return Math.round(ms);
}

/**
 * Normaliza los límites de una línea dentro de `[0, durationMs]` respetando
 * la duración mínima entre inicio y fin.
 */
export function normalizeLineBounds(
  line: Pick<LyricLine, 'startMs' | 'endMs'>,
  durationMs: number,
  minDurationMs = MIN_LINE_DURATION_MS,
): LineBounds {
  const safeDuration = Math.max(0, Math.round(durationMs));
  const effectiveMin = Math.min(minDurationMs, safeDuration);

  const rawStart = line.startMs ?? 0;
  const maxStart = Math.max(0, safeDuration - effectiveMin);
  const startMs = Math.round(clampMs(rawStart, 0, maxStart));

  const fallbackEnd = Math.min(safeDuration, startMs + 2000);
  const rawEnd = line.endMs ?? fallbackEnd;
  const minEnd = Math.min(safeDuration, startMs + effectiveMin);
  const endMs = Math.round(clampMs(rawEnd, minEnd, safeDuration));

  return { startMs, endMs };
}

/**
 * Calcula los nuevos límites al arrastrar el borde de inicio o fin de una línea.
 * Garantiza que `startMs <= endMs - minDurationMs` y que ambos queden en `[0, durationMs]`.
 */
export function computeDraggedEdge({
  edge,
  targetMs,
  startMs,
  endMs,
  durationMs,
  minDurationMs = MIN_LINE_DURATION_MS,
  snapStepMs,
}: DragEdgeParams): LineBounds {
  const safeDuration = Math.max(0, Math.round(durationMs));
  const effectiveMin = Math.min(Math.max(1, Math.round(minDurationMs)), safeDuration);
  const safeEnd = Math.round(clampMs(endMs, effectiveMin, safeDuration));
  const safeStart = Math.round(clampMs(startMs, 0, Math.max(0, safeEnd - effectiveMin)));

  const snapped = snapMs(targetMs, snapStepMs);

  if (edge === 'start') {
    const maxStart = Math.max(0, safeEnd - effectiveMin);
    return {
      startMs: Math.round(clampMs(snapped, 0, maxStart)),
      endMs: safeEnd,
    };
  }

  const minEnd = Math.min(safeDuration, safeStart + effectiveMin);
  return {
    startMs: safeStart,
    endMs: Math.round(clampMs(snapped, minEnd, safeDuration)),
  };
}

/**
 * Aplica un delta en milisegundos (p. ej. ±10 o ±50 ms) al inicio o fin de la línea,
 * respetando los límites `[0, durationMs]` y la duración mínima de 50 ms.
 */
export function applyInspectorDelta(
  bounds: LineBounds,
  field: 'start' | 'end',
  deltaMs: number,
  durationMs: number,
  minDurationMs = MIN_LINE_DURATION_MS,
): LineBounds {
  const targetMs = (field === 'start' ? bounds.startMs : bounds.endMs) + deltaMs;
  return computeDraggedEdge({
    edge: field,
    targetMs,
    startMs: bounds.startMs,
    endMs: bounds.endMs,
    durationMs,
    minDurationMs,
  });
}
