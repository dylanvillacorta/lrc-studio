import { nudgeLineTime } from '@/features/sync';
import type { LyricLine } from '@/types';

export const DEFAULT_LOUPE_MARGIN_MS = 1500;
export const DEFAULT_MIN_WINDOW_MS = 2000;
export const MIN_LINE_DURATION_MS = 50;
export const INSPECTOR_STEPS_MS = [-50, -10, 10, 50] as const;

export interface LineBounds {
  startMs: number;
  endMs: number;
}

export interface ZoomWindowOptions {
  marginMs?: number;
  minWindowMs?: number;
}

export interface ZoomWindow {
  windowStartMs: number;
  windowEndMs: number;
  lineStartMs: number;
  lineEndMs: number;
  spanMs: number;
  zoomFactor: number;
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
 * Calcula la ventana de zoom alrededor de una línea con margen configurable
 * y ancho mínimo de ventana, limitada a `[0, durationMs]`.
 */
export function computeZoomWindow(
  line: Pick<LyricLine, 'startMs' | 'endMs'>,
  durationMs: number,
  options: ZoomWindowOptions = {},
): ZoomWindow {
  const marginMs = Math.max(0, Math.round(options.marginMs ?? DEFAULT_LOUPE_MARGIN_MS));
  const minWindowMs = Math.max(
    MIN_LINE_DURATION_MS,
    Math.round(options.minWindowMs ?? DEFAULT_MIN_WINDOW_MS),
  );
  const safeDuration = Math.max(0, Math.round(durationMs));

  const { startMs: lineStartMs, endMs: lineEndMs } = normalizeLineBounds(
    line,
    safeDuration,
  );

  if (safeDuration === 0) {
    return {
      windowStartMs: 0,
      windowEndMs: 0,
      lineStartMs: 0,
      lineEndMs: 0,
      spanMs: 0,
      zoomFactor: 1,
    };
  }

  let windowStartMs = Math.max(0, lineStartMs - marginMs);
  let windowEndMs = Math.min(safeDuration, lineEndMs + marginMs);

  const targetMinSpan = Math.min(safeDuration, minWindowMs);
  let currentSpan = windowEndMs - windowStartMs;

  if (currentSpan < targetMinSpan) {
    const missing = targetMinSpan - currentSpan;
    const expandLeft = Math.floor(missing / 2);
    const expandRight = missing - expandLeft;

    windowStartMs = Math.max(0, windowStartMs - expandLeft);
    windowEndMs = Math.min(safeDuration, windowEndMs + expandRight);

    currentSpan = windowEndMs - windowStartMs;
    if (currentSpan < targetMinSpan) {
      if (windowStartMs === 0) {
        windowEndMs = Math.min(safeDuration, targetMinSpan);
      } else if (windowEndMs === safeDuration) {
        windowStartMs = Math.max(0, safeDuration - targetMinSpan);
      }
    }
  }

  const spanMs = Math.max(1, windowEndMs - windowStartMs);
  const zoomFactor = Math.max(1, Math.round(safeDuration / spanMs));

  return {
    windowStartMs,
    windowEndMs,
    lineStartMs,
    lineEndMs,
    spanMs,
    zoomFactor,
  };
}

/**
 * Convierte un instante en milisegundos a posición horizontal `x` en píxeles,
 * limitada a `[0, widthPx]`.
 */
export function msToX(
  ms: number,
  windowStartMs: number,
  windowEndMs: number,
  widthPx: number,
): number {
  if (widthPx <= 0 || windowEndMs <= windowStartMs) {
    return 0;
  }
  const ratio = clampMs((ms - windowStartMs) / (windowEndMs - windowStartMs), 0, 1);
  return ratio * widthPx;
}

/**
 * Convierte una posición horizontal `x` en píxeles a milisegundos dentro de
 * `[windowStartMs, windowEndMs]`, con límite estricto.
 */
export function xToMs(
  xPx: number,
  windowStartMs: number,
  windowEndMs: number,
  widthPx: number,
): number {
  if (widthPx <= 0 || windowEndMs <= windowStartMs) {
    return Math.round(windowStartMs);
  }
  const ratio = clampMs(xPx / widthPx, 0, 1);
  return Math.round(windowStartMs + ratio * (windowEndMs - windowStartMs));
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

/**
 * Aplica un ajuste de inspector reutilizando `nudgeLineTime` de `sync` y
 * asegurando los límites válidos de la lupa (`[0, durationMs]` y duración mínima).
 */
export function nudgeLoupeLine(
  lines: readonly LyricLine[],
  lineIndex: number,
  field: 'startMs' | 'endMs',
  deltaMs: number,
  durationMs: number,
  minDurationMs = MIN_LINE_DURATION_MS,
): LyricLine[] {
  const target = lines[lineIndex];
  if (!target) {
    return [...lines];
  }

  const normalized = normalizeLineBounds(target, durationMs, minDurationMs);
  const adjusted = applyInspectorDelta(
    normalized,
    field === 'startMs' ? 'start' : 'end',
    deltaMs,
    durationMs,
    minDurationMs,
  );
  const actualDelta =
    field === 'startMs'
      ? adjusted.startMs - normalized.startMs
      : adjusted.endMs - normalized.endMs;

  const baseLines = lines.map((line, idx) =>
    idx === lineIndex
      ? { ...line, startMs: normalized.startMs, endMs: normalized.endMs }
      : line,
  );

  return nudgeLineTime(baseLines, lineIndex, field, actualDelta);
}
